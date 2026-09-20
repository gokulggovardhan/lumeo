import assert from "node:assert/strict";
import test from "node:test";

import {
  isImmutableOfficeAssetUrl,
  resolveOfficeAssetConfig,
  ZETAJS_HELPER_URL,
} from "../lib/conversion/browser/libreoffice/assetConfig.ts";

test("ZetaJS helper is pinned instead of using an unversioned package URL", () => {
  assert.match(ZETAJS_HELPER_URL, /zetajs@1\.2\.0/);
  assert.doesNotMatch(ZETAJS_HELPER_URL, /@latest/);
});

test("development may use the upstream latest runtime for the internal lab", () => {
  const config = resolveOfficeAssetConfig("development", null);
  assert.match(config.officeBaseUrl, /zetaoffice_latest/);
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
});

test("immutable URL helper rejects latest aliases", () => {
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
});
