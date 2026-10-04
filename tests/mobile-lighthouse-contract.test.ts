import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("mobile Lighthouse config protects the primary public surfaces", () => {
  const config = readFileSync(".lighthouserc.cjs", "utf8");
  for (const route of ["/", "/pdf", "/pdf-tools", "/pdf/edit"]) {
    assert.ok(config.includes(`http://127.0.0.1:8787${route}`));
  }
  assert.match(config, /numberOfRuns:\s*3/);
  assert.match(config, /formFactor:\s*"mobile"/);
  assert.match(config, /categories:performance/);
  assert.match(config, /categories:accessibility/);
  assert.match(config, /categories:best-practices/);
  assert.match(config, /categories:seo/);
  assert.match(config, /largest-contentful-paint/);
  assert.match(config, /cumulative-layout-shift/);
  assert.match(config, /total-blocking-time/);
});

test("Lighthouse workflow runs against a local production Worker", () => {
  const workflow = readFileSync(".github/workflows/mobile-lighthouse.yml", "utf8");
  assert.match(workflow, /npm run build:vinext/);
  assert.match(workflow, /wrangler dev/);
  assert.match(workflow, /@lhci\/cli@0\.15\.1/);
  assert.match(workflow, /mobile-lighthouse-reports/);
});
