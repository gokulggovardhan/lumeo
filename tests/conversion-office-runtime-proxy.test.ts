import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import runtimeRelease from "../config/office-runtime-release.json" with { type: "json" };
import {
  LUMEO_OFFICE_RUNTIME_RELEASE_ID,
  resolveLumeoOfficeAssetBaseUrl,
} from "../lib/conversion/browser/libreoffice/assetConfig.ts";
import { maybeHandleOfficeRuntimeRequest } from "../worker/office-runtime.ts";

test("production Office runtime release is immutable and matches the client route", () => {
  assert.equal(LUMEO_OFFICE_RUNTIME_RELEASE_ID, runtimeRelease.releaseId);
  assert.doesNotMatch(runtimeRelease.releaseId, /latest/i);
  assert.match(runtimeRelease.releaseTag, /^office-runtime-/);
  assert.equal(
    resolveLumeoOfficeAssetBaseUrl("https://lumeo.in"),
    `https://lumeo.in/office-runtime/${runtimeRelease.releaseId}/`,
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

  assert.match(source, /permissions:\n  contents: write/);
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
