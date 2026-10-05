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
  assert.match(config, /disable-background-timer-throttling/);
  assert.match(config, /categories:performance/);
  assert.match(config, /categories:accessibility/);
  assert.match(config, /categories:best-practices/);
  assert.match(config, /categories:seo/);
  assert.match(config, /largest-contentful-paint/);
  assert.match(config, /cumulative-layout-shift/);
  assert.match(config, /total-blocking-time/);
});

test("Lighthouse workflow runs against a warmed local production Worker", () => {
  const workflow = readFileSync(".github/workflows/mobile-lighthouse.yml", "utf8");
  assert.match(workflow, /npm run build:vinext/);
  assert.match(workflow, /wrangler dev/);
  assert.match(workflow, /Warm audited routes/);
  assert.match(workflow, /node scripts\/run-mobile-lighthouse\.mjs/);
  assert.match(workflow, /include-hidden-files:\s*true/);
  assert.match(workflow, /mobile-lighthouse-reports/);
});

test("Lighthouse runtime retries never weaken assertion failures", () => {
  const runner = readFileSync("scripts/run-mobile-lighthouse.mjs", "utf8");
  assert.match(runner, /MAX_ATTEMPTS = 2/);
  assert.match(runner, /NO_FCP/);
  assert.match(runner, /isRetryableRuntimeFailure/);
  assert.match(runner, /process\.exit\(result\.code\)/);
});
