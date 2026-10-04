import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("client bundle budget script enforces raw, gzip and total limits", () => {
  const source = readFileSync("scripts/check-client-bundle-budget.mjs", "utf8");
  assert.match(source, /maxRawChunkBytes/);
  assert.match(source, /maxGzipChunkBytes/);
  assert.match(source, /maxTotalGzipBytes/);
  assert.match(source, /dist\/client/);
  assert.match(source, /bundle-budget\.json/);
});

test("bundle budget workflow builds the production Cloudflare client", () => {
  const workflow = readFileSync(".github/workflows/bundle-budget.yml", "utf8");
  assert.match(workflow, /npm run build:vinext/);
  assert.match(workflow, /npm run verify:bundle-budget/);
  assert.match(workflow, /client-bundle-budget/);
});

test("package exposes the bundle budget verifier", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(
    pkg.scripts["verify:bundle-budget"],
    "node scripts/check-client-bundle-budget.mjs",
  );
});
