import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("client bundle budget measures JavaScript actually loaded by representative routes", () => {
  const source = readFileSync("scripts/check-client-bundle-budget.mjs", "utf8");
  for (const route of ["/", "/pdf", "/pdf-tools", "/pdf/edit"]) {
    assert.ok(source.includes(`"${route}"`));
  }
  assert.match(source, /@playwright\/test/);
  assert.match(source, /page\.on\("response"/);
  assert.match(source, /\/_next\/static\//);
  assert.match(source, /gzipSync/);
  assert.match(source, /networkidle/);
  assert.match(source, /routeBudgets/);
  assert.match(source, /maxSingleGzipBytes/);
  assert.doesNotMatch(source, /walk\(/);
  assert.doesNotMatch(source, /dist\/client\/_next\/static\/chunks/);
});

test("bundle budget workflow audits a real local Cloudflare Worker route load", () => {
  const workflow = readFileSync(".github/workflows/bundle-budget.yml", "utf8");
  assert.match(workflow, /npm run build:vinext/);
  assert.match(workflow, /playwright install --with-deps chromium/);
  assert.match(workflow, /wrangler dev/);
  assert.match(workflow, /LUMEO_BUNDLE_BASE_URL/);
  assert.match(workflow, /npm run verify:bundle-budget/);
  assert.match(workflow, /client-route-bundle-budget/);
});

test("package exposes the bundle budget verifier", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(
    pkg.scripts["verify:bundle-budget"],
    "node scripts/check-client-bundle-budget.mjs",
  );
});
