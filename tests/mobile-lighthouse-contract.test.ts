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

test("Lighthouse workflow uses a production server and independent headed browser samples", () => {
  const workflow = readFileSync(".github/workflows/mobile-lighthouse.yml", "utf8");
  const runner = readFileSync("scripts/run-mobile-lighthouse.mjs", "utf8");
  assert.match(workflow, /lighthouse@13\.5\.0/);
  assert.match(workflow, /chrome-launcher@1\.2\.1/);
  assert.match(workflow, /npm run build/);
  assert.match(
    workflow,
    /npm start -- --hostname 127\.0\.0\.1 --port 8787/,
  );
  assert.match(workflow, /Warm audited routes/);
  assert.match(workflow, /Xvfb :99/);
  assert.match(workflow, /DISPLAY=:99/);
  assert.match(workflow, /include-hidden-files:\s*true/);
  assert.match(runner, /chromeLauncher\.launch/);
  assert.doesNotMatch(runner, /"--headless"/);
  assert.match(runner, /"--start-maximized"/);
  assert.match(runner, /Promise\.resolve\(chrome\.kill\(\)\)/);
  assert.match(runner, /NO_FCP/);
  assert.match(runner, /for \(let attempt = 1; attempt <= 2/);
  assert.match(runner, /median\(/);
  assert.match(runner, /LIGHTHOUSE BUDGET FAIL/);
});
