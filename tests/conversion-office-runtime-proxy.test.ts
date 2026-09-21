import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import runtimeRelease from "../config/office-runtime-release.json" with { type: "json" };
import {
  LUMEO_OFFICE_RUNTIME_RELEASE_ID,
  resolveLumeoOfficeAssetBaseUrl,
} from "../lib/conversion/browser/libreoffice/assetConfig.ts";

test("production Office runtime release is immutable and matches the client route", () => {
  assert.equal(LUMEO_OFFICE_RUNTIME_RELEASE_ID, runtimeRelease.releaseId);
  assert.doesNotMatch(runtimeRelease.releaseId, /latest/i);
  assert.match(runtimeRelease.releaseTag, /^office-runtime-/);
  assert.equal(
    resolveLumeoOfficeAssetBaseUrl("https://lumeo.in"),
    `https://lumeo.in/office-runtime/${runtimeRelease.releaseId}/`,
  );
});

test("Office runtime route is a fixed streaming proxy, not a conversion backend", async () => {
  const source = await readFile(
    "app/office-runtime/[release]/[asset]/route.ts",
    "utf8",
  );

  assert.match(source, /github\.com\/gokulggovardhan\/lumeo\/releases\/download/);
  assert.match(source, /upstream\.body/);
  assert.match(source, /cacheEverything: true/);
  assert.match(source, /cacheTtl: 31_536_000/);
  assert.match(source, /Cache-Control", "public, max-age=31536000, immutable"/);
  assert.match(source, /Cross-Origin-Resource-Policy", "same-origin"/);
  assert.match(source, /Content-Type/);
  assert.match(source, /Range/);
  assert.doesNotMatch(source, /arrayBuffer\(/);
  assert.doesNotMatch(source, /formData\(/);
  assert.doesNotMatch(source, /supabase/i);
  assert.doesNotMatch(source, /render/i);
});

test("production runtime release workflow publishes a draft only after payload verification", async () => {
  const source = await readFile(
    ".github/workflows/office-runtime-production.yml",
    "utf8",
  );

  assert.match(source, /permissions:\n  contents: write/);
  assert.match(source, /--draft/);
  assert.match(source, /Verify release asset inventory and sizes/);
  assert.match(source, /Manifest is the publish marker and is uploaded last/);
  assert.match(source, /--draft=false/);
  assert.doesNotMatch(source, /CLOUDFLARE_API_TOKEN/);
  assert.doesNotMatch(source, /CLOUDFLARE_ACCOUNT_ID/);
});
