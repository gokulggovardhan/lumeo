import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("mobile Lighthouse config protects the primary production surfaces", () => {
  const config = readFileSync(".lighthouserc.cjs", "utf8");
  for (const route of ["/", "/pdf", "/pdf-tools", "/pdf/edit"]) {
    assert.ok(config.includes(`https://lumeo.in${route}`));
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

test("Lighthouse certification waits for the exact deployed main revision", () => {
  const workflow = readFileSync(".github/workflows/mobile-lighthouse.yml", "utf8");
  const runner = readFileSync("scripts/run-mobile-lighthouse.mjs", "utf8");

  assert.match(workflow, /push:/);
  assert.match(workflow, /branches:[\s\S]*main/);
  assert.doesNotMatch(workflow, /pull_request:/);
  assert.match(workflow, /EXPECTED_SHA: \$\{\{ github\.sha \}\}/);
  assert.match(workflow, /https:\/\/lumeo\.in\/api\/build-info/);
  assert.match(workflow, /lighthouse@13\.5\.0/);
  assert.match(workflow, /chrome-launcher@1\.2\.1/);
  assert.match(workflow, /Xvfb :99/);
  assert.match(workflow, /include-hidden-files:\s*true/);

  assert.match(runner, /chromeLauncher\.launch/);
  assert.doesNotMatch(runner, /"--headless"/);
  assert.match(runner, /"--start-maximized"/);
  assert.match(runner, /CalculateNativeWinOcclusion/);
  assert.match(runner, /Promise\.resolve\(chrome\.kill\(\)\)/);
  assert.match(runner, /NO_FCP/);
  assert.match(runner, /maxRuntimeAttemptsPerRoute/);
  assert.match(runner, /runtimeFailures/);
  assert.match(runner, /Discarding transient Lighthouse runtime-invalid attempt/);
  assert.match(runner, /median\(/);
  assert.match(runner, /LIGHTHOUSE BUDGET FAIL/);
});


test("mobile navigation brand mark is pre-optimized and bypasses runtime image transforms", () => {
  const brand = readFileSync("components/BrandMark.tsx", "utf8");
  const prep = readFileSync("scripts/prepare-brand-assets.mjs", "utf8");
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));

  assert.match(brand, /lumeo-pdf-mark-96\.webp/);
  assert.doesNotMatch(brand, /src="\/brand\/lumeo-pdf-mark\.png"/);
  assert.match(brand, /unoptimized/);
  assert.match(prep, /resize\(96, 96/);
  assert.match(prep, /webp\(/);
  assert.match(prep, /MAX_BYTES = 20_000/);
  assert.equal(pkg.scripts["prepare:brand-assets"], "node scripts/prepare-brand-assets.mjs");
  assert.match(pkg.scripts["build:vinext"], /prepare:brand-assets/);
  assert.match(pkg.scripts.build, /prepare:brand-assets/);
});
