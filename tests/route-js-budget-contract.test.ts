import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Step 5 measures JavaScript actually loaded by representative routes", () => {
  const source = readFileSync("scripts/check-route-js-budget.mjs", "utf8");

  for (const route of ["/", "/pdf", "/pdf-tools", "/pdf/edit"]) {
    assert.ok(source.includes(`"${route}"`));
  }

  assert.match(source, /BASELINE_SHA = "abfe1059256329488eae4d3dc83eaed0ef2037d2"/);
  assert.match(source, /page\.on\("response"/);
  assert.match(source, /response\s*\.body\(\)/);
  assert.match(source, /gzipSync/);
  assert.match(source, /Network\.loadingFinished/);
  assert.match(source, /encodedDataLength/);
  assert.match(source, /Network\.setCacheDisabled/);
  assert.match(source, /next-router-prefetch/);
  assert.match(source, /purpose\.includes\("prefetch"\)/);
  assert.match(source, /routeHandler\.abort\("blockedbyclient"\)/);
  assert.doesNotMatch(source, /waitForLoadState\("networkidle"/);
  assert.match(source, /minimumRouteObservationMs\s*=\s*1_500/);
  assert.match(source, /javascriptQuietWindowMs\s*=\s*1_000/);
  assert.match(source, /maximumRouteObservationMs\s*=\s*15_000/);
  assert.match(source, /javaScriptQuietFor\s*>=\s*javascriptQuietWindowMs/);
  assert.match(source, /route JavaScript did not stabilize within/);
  assert.match(source, /maxRawBytes/);
  assert.match(source, /maxGzipBytes/);
  assert.match(source, /maxTransferBytes/);
  assert.match(source, /maxScripts/);
  assert.doesNotMatch(source, /dist\/client\/_next\/static\/chunks/);
  assert.doesNotMatch(source, /readdir|walk\(/);
});

test("Step 5 budgets are grounded in current exact-production Lighthouse evidence", () => {
  const source = readFileSync("scripts/check-route-js-budget.mjs", "utf8");

  assert.match(source, /baselineScripts:\s*40/);
  assert.match(source, /baselineRawBytes:\s*867_903/);
  assert.match(source, /baselineTransferBytes:\s*281_114/);
  assert.match(source, /baselineScripts:\s*49/);
  assert.match(source, /baselineRawBytes:\s*914_532/);
  assert.match(source, /baselineTransferBytes:\s*301_691/);
  assert.match(source, /baselineScripts:\s*37/);
  assert.match(source, /baselineRawBytes:\s*880_055/);
  assert.match(source, /baselineTransferBytes:\s*283_304/);
  assert.match(source, /baselineScripts:\s*76/);
  assert.match(source, /baselineRawBytes:\s*1_742_752/);
  assert.match(source, /baselineTransferBytes:\s*619_955/);
});

test("Step 5 CI gates both PR Worker loads and exact deployed production", () => {
  const workflow = readFileSync(".github/workflows/route-js-budget.yml", "utf8");

  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /push:/);
  assert.match(workflow, /Build production Cloudflare Worker/);
  assert.match(workflow, /wrangler dev/);
  assert.match(workflow, /LUMEO_ROUTE_JS_BASE_URL:\s*http:\/\/127\.0\.0\.1:8787/);
  assert.match(workflow, /LUMEO_ROUTE_JS_ENFORCE_TRANSFER:\s*"0"/);
  assert.match(workflow, /Wait for exact Cloudflare production revision/);
  assert.match(workflow, /https:\/\/lumeo\.in\/api\/build-info/);
  assert.match(workflow, /LUMEO_ROUTE_JS_BASE_URL:\s*https:\/\/lumeo\.in/);
  assert.match(workflow, /LUMEO_ROUTE_JS_ENFORCE_TRANSFER:\s*"1"/);
  assert.match(workflow, /route-js-budget-production/);
});

test("package exposes the Step 5 route JavaScript verifier", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(
    pkg.scripts["verify:route-js-budget"],
    "node scripts/check-route-js-budget.mjs",
  );
});
