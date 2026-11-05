import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import runtimeRelease from "../config/office-runtime-release.json" with { type: "json" };
import {
  LUMEO_OFFICE_RUNTIME_RELEASE_ID,
  resolveLumeoOfficeAssetBaseUrl,
} from "../lib/conversion/browser/libreoffice/assetConfig.ts";
import { maybeHandleOfficeRuntimeRequest } from "../worker/office-runtime.ts";
import { isPinnedOfficeDependencyProgress } from "../e2e/office-runtime-console.ts";

test("production Office runtime release is immutable and matches the client route", () => {
  assert.equal(LUMEO_OFFICE_RUNTIME_RELEASE_ID, runtimeRelease.releaseId);
  assert.doesNotMatch(runtimeRelease.releaseId, /latest/i);
  assert.match(runtimeRelease.releaseTag, /^office-runtime-/);
  assert.equal(
    resolveLumeoOfficeAssetBaseUrl("https://lumeo.in"),
    `https://lumeo.in/office-runtime/${runtimeRelease.releaseId}/`,
  );
});


test("pinned-release manifest is byte-identical to verified GitHub Release metadata", async () => {
  const body = await readFile("config/office-runtime-manifest.json");
  assert.equal(body.byteLength, 1633);
  // SHA-256 from published GitHub Release asset id 578281296, independently
  // recovered from a successful real Chromium response trace.
  assert.equal(
    createHash("sha256").update(body).digest("hex"),
    "df987a76ae6611dda92b76748f66661cba27cdea3ec6d6670ffed9c2f07f1fd8",
  );
  const manifest = JSON.parse(body.toString("utf8"));
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.releaseId, runtimeRelease.releaseId);
  assert.equal(manifest.zetaJsVersion, "1.2.0");

  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async (): Promise<Response> => {
    calls += 1;
    throw new Error("The pinned manifest must not call GitHub at runtime.");
  }) as typeof fetch;

  const url = `https://lumeo.in/office-runtime/${runtimeRelease.releaseId}/lumeo-office-runtime.json`;
  try {
    const response = await maybeHandleOfficeRuntimeRequest(new Request(url));
    assert.ok(response);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Content-Type"), "application/json");
    assert.match(response.headers.get("Cache-Control") ?? "", /immutable/);
    assert.equal(response.headers.get("Cross-Origin-Resource-Policy"), "same-origin");
    assert.deepEqual(await response.json(), manifest);

    const head = await maybeHandleOfficeRuntimeRequest(new Request(url, { method: "HEAD" }));
    assert.ok(head);
    assert.equal(head.status, 200);
    assert.equal(head.headers.get("Content-Length"), String(Buffer.byteLength(JSON.stringify(manifest))));
    assert.equal(await head.text(), "");
    assert.equal(calls, 0, "Neither HEAD nor GET should access an upstream server");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("only pinned, nonfatal Emscripten progress is excluded from production console failures", () => {
  const pinned = `https://lumeo.in/office-runtime/${runtimeRelease.releaseId}/soffice.js`;
  for (const message of [
    "still waiting on run dependencies:",
    "dependency: wasm-instantiate",
    "QRect(0,0 0x0) 1",
    "QObject::connect(QWindow, QtFrame): invalid nullptr parameter",
    "warning: unsupported syscall: __syscall_mprotect",
    "dependency: fp /instdir/program/services.rdb",
    "dependency: datafile_/mnt/builddir/workdir/CustomTarget/static/emscripten_fs_image/soffice.data",
    "(end of list)",
  ]) {
    assert.equal(isPinnedOfficeDependencyProgress(pinned, message), true, message);
  }
  for (const message of [
    "The local Office engine stopped unexpectedly.",
    "RuntimeError: unreachable",
    "dependency: unexpectedFailure",
    "dependency: fp /instdir/program/services.rdb\\nFatal error",
  ]) {
    assert.equal(isPinnedOfficeDependencyProgress(pinned, message), false, message);
  }
  assert.equal(
    isPinnedOfficeDependencyProgress("https://attacker.example/soffice.js", "dependency: wasm-instantiate"),
    false,
  );
  assert.equal(
    isPinnedOfficeDependencyProgress("https://lumeo.in/office-runtime/outdated/soffice.js", "dependency: wasm-instantiate"),
    false,
  );
});

test("Cloudflare Worker intercepts Office runtime before vinext", async () => {
  const source = await readFile("worker/index.ts", "utf8");
  const directRuntimeIndex = source.indexOf(
    "await maybeHandleOfficeRuntimeRequest(request)",
  );
  const vinextIndex = source.indexOf("handler.fetch(...args)");

  assert.ok(directRuntimeIndex >= 0, "Office runtime fast path is missing");
  assert.ok(vinextIndex >= 0, "vinext handler call is missing");
  assert.ok(
    directRuntimeIndex < vinextIndex,
    "Office runtime must be handled before vinext",
  );
});

test("Office runtime fast path streams identity bytes and preserves Range", async () => {
  const originalFetch = globalThis.fetch;
  let capturedInit: RequestInit | undefined;
  let capturedUrl = "";

  globalThis.fetch = (async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    capturedUrl = String(input);
    capturedInit = init;

    return new Response(new Uint8Array([0]), {
      status: 206,
      headers: {
        "Accept-Ranges": "bytes",
        "Content-Length": "1",
        "Content-Range": "bytes 0-0/161667499",
        ETag: "\"runtime-etag\"",
        "Last-Modified": "Mon, 21 Sep 2026 05:01:04 GMT",
      },
    });
  }) as typeof fetch;

  try {
    const response = await maybeHandleOfficeRuntimeRequest(
      new Request(
        `https://lumeo.in/office-runtime/${runtimeRelease.releaseId}/soffice.wasm`,
        { headers: { Range: "bytes=0-0" } },
      ),
    );

    assert.ok(response);
    assert.equal(response.status, 206);
    assert.match(
      capturedUrl,
      /github\.com\/gokulggovardhan\/lumeo\/releases\/download/,
    );

    const upstreamHeaders = new Headers(capturedInit?.headers);
    assert.equal(upstreamHeaders.get("Range"), "bytes=0-0");
    assert.equal(upstreamHeaders.get("Accept-Encoding"), "identity");
    assert.equal(capturedInit?.cache, "no-store");

    assert.equal(response.headers.get("Content-Type"), "application/wasm");
    assert.equal(
      response.headers.get("Content-Range"),
      "bytes 0-0/161667499",
    );
    assert.match(response.headers.get("Cache-Control") ?? "", /immutable/);
    assert.match(response.headers.get("Cache-Control") ?? "", /no-transform/);
    assert.equal(
      response.headers.get("Cross-Origin-Resource-Policy"),
      "same-origin",
    );
    assert.equal(response.headers.get("Vary"), null);
    assert.deepEqual(
      Array.from(new Uint8Array(await response.arrayBuffer())),
      [0],
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Office runtime fast path retries a transient upstream 429", async () => {
  const originalFetch = globalThis.fetch;
  let attempts = 0;

  globalThis.fetch = (async (): Promise<Response> => {
    attempts += 1;
    if (attempts === 1) {
      return new Response("rate limited", {
        status: 429,
        headers: { "Retry-After": "1" },
      });
    }

    return new Response("console.log('office runtime');", {
      status: 200,
      headers: {
        "Content-Length": "30",
        ETag: "\"runtime-js\"",
      },
    });
  }) as typeof fetch;

  try {
    const response = await maybeHandleOfficeRuntimeRequest(
      new Request(
        `https://lumeo.in/office-runtime/${runtimeRelease.releaseId}/soffice.js`,
      ),
    );

    assert.ok(response);
    assert.equal(response.status, 200);
    assert.equal(attempts, 2);
    assert.equal(
      response.headers.get("Content-Type"),
      "application/javascript",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Office runtime production and fallback routes never buffer conversion assets", async () => {
  const workerSource = await readFile("worker/office-runtime.ts", "utf8");
  const fallbackSource = await readFile(
    "app/office-runtime/[release]/[asset]/route.ts",
    "utf8",
  );
  const source = `${workerSource}\n${fallbackSource}`;

  assert.match(workerSource, /Accept-Encoding": "identity"/);
  assert.match(workerSource, /upstream\.body/);
  assert.match(workerSource, /no-transform/);
  assert.match(fallbackSource, /upstream\.body/);
  assert.doesNotMatch(source, /cacheEverything:\s*true/);
  assert.doesNotMatch(source, /cacheTtl:\s*31_536_000/);
  assert.doesNotMatch(source, /arrayBuffer\(/);
  assert.doesNotMatch(source, /formData\(/);
  assert.doesNotMatch(source, /supabase/i);
  assert.doesNotMatch(source, /render/i);
});

test("production runtime release workflow verifies full production payload integrity", async () => {
  const source = await readFile(
    ".github/workflows/office-runtime-production.yml",
    "utf8",
  );

  assert.match(source, /permissions:\r?\n  contents: write/);
  assert.match(source, /--draft/);
  assert.match(source, /Verify release asset inventory and sizes/);
  assert.match(source, /Manifest is the publish marker and is uploaded last/);
  assert.match(source, /Verify full production runtime integrity/);
  assert.match(source, /sha256sum/);
  assert.match(source, /soffice\.wasm soffice\.data/);
  assert.match(source, /--draft=false/);
  assert.doesNotMatch(source, /CLOUDFLARE_API_TOKEN/);
  assert.doesNotMatch(source, /CLOUDFLARE_ACCOUNT_ID/);
});
