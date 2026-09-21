import assert from "node:assert/strict";
import test from "node:test";

import {
  isImmutableOfficeAssetUrl,
  OFFICE_RUNTIME_MANIFEST_FILE,
  OFFICE_RUNTIME_REQUIRED_FILES,
  preflightOfficeAssetOrigin,
  resolveOfficeAssetConfig,
  validateOfficeRuntimeManifest,
  ZETAJS_HELPER_URL,
  ZETAJS_HELPER_VERSION,
} from "../lib/conversion/browser/libreoffice/assetConfig.ts";

function validManifest(releaseId = "release-2026-09-21") {
  return {
    schemaVersion: 1 as const,
    releaseId,
    zetaJsVersion: ZETAJS_HELPER_VERSION,
    zetaOfficeBranch: "distro/allotropia/zeta-24-2",
    createdAt: "2026-09-21T00:00:00.000Z",
    files: Object.fromEntries(
      Object.entries(OFFICE_RUNTIME_REQUIRED_FILES).map(([name, types], index) => [
        name,
        {
          bytes: 1024 + index,
          sha256: String(index + 1).padStart(64, "a").slice(0, 64),
          contentType: types[0],
        },
      ]),
    ),
  };
}

test("ZetaJS helper is pinned instead of using an unversioned package URL", () => {
  assert.match(ZETAJS_HELPER_URL, /zetajs@1\.2\.0/);
  assert.doesNotMatch(ZETAJS_HELPER_URL, /@latest/);
});

test("development may use the upstream latest runtime for the internal lab", () => {
  const config = resolveOfficeAssetConfig("development", null);
  assert.match(config.officeBaseUrl, /zetaoffice_latest/);
  assert.equal(config.releaseId, null);
  assert.equal(config.manifestUrl, null);
});

test("production requires an explicit immutable HTTPS asset base", () => {
  assert.throws(
    () => resolveOfficeAssetConfig("production", null),
    /required/,
  );
  assert.throws(
    () =>
      resolveOfficeAssetConfig(
        "production",
        "https://assets.example.test/office/latest/",
      ),
    /immutable\/versioned/,
  );
  assert.throws(
    () =>
      resolveOfficeAssetConfig(
        "production",
        "http://assets.example.test/office/release-1/",
      ),
    /HTTPS/,
  );

  const config = resolveOfficeAssetConfig(
    "production",
    "https://assets.example.test/office/release-1",
  );
  assert.equal(
    config.officeBaseUrl,
    "https://assets.example.test/office/release-1/",
  );
  assert.equal(config.releaseId, "release-1");
  assert.equal(
    config.manifestUrl,
    `https://assets.example.test/office/release-1/${OFFICE_RUNTIME_MANIFEST_FILE}`,
  );
});

test("immutable URL helper rejects latest aliases and unversioned roots", () => {
  assert.equal(
    isImmutableOfficeAssetUrl(
      "https://assets.example.test/office/release-2026-09-20/",
    ),
    true,
  );
  assert.equal(
    isImmutableOfficeAssetUrl(
      "https://assets.example.test/office/latest/",
    ),
    false,
  );
  assert.equal(isImmutableOfficeAssetUrl("https://assets.example.test/"), false);
});

test("runtime manifest must match the immutable release and pinned helper", () => {
  const manifest = validManifest();
  assert.equal(
    validateOfficeRuntimeManifest(manifest, "release-2026-09-21").releaseId,
    "release-2026-09-21",
  );

  assert.throws(
    () =>
      validateOfficeRuntimeManifest(
        { ...manifest, releaseId: "another-release" },
        "release-2026-09-21",
      ),
    /does not match/,
  );

  assert.throws(
    () =>
      validateOfficeRuntimeManifest(
        { ...manifest, zetaJsVersion: "999.0.0" },
        "release-2026-09-21",
      ),
    /versions do not match/,
  );
});

test("runtime manifest requires every expected Office payload file", () => {
  const manifest = validManifest();
  const { ["soffice.wasm"]: _removed, ...files } = manifest.files;

  assert.throws(
    () =>
      validateOfficeRuntimeManifest(
        { ...manifest, files },
        "release-2026-09-21",
      ),
    /missing soffice\.wasm/,
  );
});


test("runtime preflight never caches a partial soffice.js response", async (t) => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ method: string; cache: RequestCache | undefined; range: string | null }> = [];

  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    calls.push({
      method: init?.method ?? "GET",
      cache: init?.cache,
      range: headers.get("Range"),
    });
    return new Response(null, {
      status: 200,
      headers: {
        "content-type": "application/javascript",
      },
    });
  }) as typeof fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  await preflightOfficeAssetOrigin(
    resolveOfficeAssetConfig(
      "development",
      "https://assets.example.test/runtime-dev/",
    ),
  );

  assert.deepEqual(calls, [
    {
      method: "HEAD",
      cache: "no-store",
      range: null,
    },
  ]);
});
