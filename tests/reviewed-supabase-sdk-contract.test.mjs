import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { assertReviewedSupabaseSdkVersion, REVIEWED_SUPABASE_JS_VERSION } from "../scripts/verify-reviewed-supabase-sdk.mjs";

const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));

test("reviewed Supabase SDK contract is pinned in manifest and lockfile", () => {
  assert.equal(REVIEWED_SUPABASE_JS_VERSION, "2.119.0");
  assert.doesNotThrow(() => assertReviewedSupabaseSdkVersion(manifest, lock));
});

test("SDK version contract rejects unexpected manifest upgrades", () => {
  assert.throws(() => assertReviewedSupabaseSdkVersion({
    ...manifest, dependencies: { ...manifest.dependencies, "@supabase/supabase-js": "^9.0.0" },
  }, lock), /declared version/);
});

test("SDK version contract rejects lockfile range and resolution mismatches", () => {
  const badRoot = { ...lock, packages: { ...lock.packages,
    "": { ...lock.packages[""], dependencies: { ...lock.packages[""].dependencies, "@supabase/supabase-js": "^9.0.0" } },
  } };
  assert.throws(() => assertReviewedSupabaseSdkVersion(manifest, badRoot), /lockfile root/);
  const badResolved = { ...lock, packages: { ...lock.packages,
    "node_modules/@supabase/supabase-js": { ...lock.packages["node_modules/@supabase/supabase-js"], version: "0.0.0" },
  } };
  assert.throws(() => assertReviewedSupabaseSdkVersion(manifest, badResolved), /installed lockfile version/);
});
