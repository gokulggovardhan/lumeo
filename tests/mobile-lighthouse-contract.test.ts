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
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /Mobile Lighthouse homepage budget/);
  assert.match(workflow, /Build Cloudflare Worker from PR branch/);
  assert.match(workflow, /Start local PR Worker/);
  assert.match(workflow, /LIGHTHOUSE_COLLECTOR_SMOKE/);
  assert.match(workflow, /LIGHTHOUSE_BASE_URL:\s*http:\/\/127\.0\.0\.1:8787/);
  assert.match(workflow, /if: github\.event_name != 'pull_request'/);
  assert.match(workflow, /EXPECTED_SHA: \$\{\{ github\.sha \}\}/);
  assert.match(workflow, /https:\/\/lumeo\.in\/api\/build-info/);
  assert.match(workflow, /lighthouse@13\.5\.0/);
  assert.doesNotMatch(workflow, /@lhci\/cli/);
  assert.match(workflow, /runs-on:\s*ubuntu-latest/);
  assert.match(workflow, /runs-on:\s*windows-latest/);
  assert.match(workflow, /browser-actions\/setup-chrome@v2/);
  assert.match(workflow, /steps\.chrome\.outputs\.chrome-path/);
  assert.doesNotMatch(workflow, /Xvfb/);
  assert.match(workflow, /include-hidden-files:\s*true/);

  assert.doesNotMatch(runner, /chromeLauncher\.launch/);
  assert.match(runner, /expectedLighthouseVersion = "13\.5\.0"/);
  assert.match(runner, /lighthouseCli/);
  assert.match(runner, /"lighthouse",\s*"cli",\s*"index\.js"/);
  assert.match(runner, /run\(process\.execPath, \[lighthouseCli, \.\.\.args\]\)/);
  assert.doesNotMatch(runner, /lighthouse\.cmd/);
  assert.match(runner, /--config-path=/);
  assert.match(runner, /--output=json/);
  assert.doesNotMatch(runner, /--headless/);
  assert.doesNotMatch(runner, /--no-sandbox/);
  assert.doesNotMatch(runner, /--disable-dev-shm-usage/);
  assert.match(runner, /LIGHTHOUSE_COLLECTOR_SMOKE/);
  assert.match(runner, /LIGHTHOUSE_BASE_URL/);
  assert.match(runner, /LIGHTHOUSE_CHROME_FLAGS/);
  assert.match(runner, /--chrome-path=/);
  assert.match(runner, /--chrome-flags=/);
  assert.match(runner, /https:\/\/example\.com\//);
  assert.match(runner, /LIGHTHOUSE_ENVIRONMENT_FAILURE/);
  assert.match(runner, /PASS Lighthouse environment control/);
  assert.doesNotMatch(runner, /CalculateNativeWinOcclusion/);
  assert.doesNotMatch(runner, /--window-size=390,844/);
  assert.match(runner, /NO_FCP/);
  assert.match(runner, /maxRuntimeAttemptsPerRoute/);
  assert.match(runner, /runtimeFailures/);
  assert.match(runner, /Discarding transient Lighthouse runtime-invalid attempt/);
  assert.match(runner, /median\(/);
  assert.match(runner, /runsPerRoute = baseConfig\.numberOfRuns/);
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


test("public page entrance motion never blocks first paint", () => {
  const css = readFileSync("app/globals.css", "utf8");
  const pageEnter =
    css.match(/@keyframes lumeo-page-enter\s*\{[\s\S]*?\n\}/)?.[0] ?? "";
  const fadeUp =
    css.match(/@keyframes lumeo-fade-up\s*\{[\s\S]*?\n\}/)?.[0] ?? "";

  assert.match(css, /\.lumeo-page-enter\s*\{[\s\S]*animation:\s*lumeo-page-enter/);
  assert.match(css, /\.lumeo-fade-up\s*\{[\s\S]*animation:\s*lumeo-fade-up/);
  assert.ok(pageEnter.length > 0, "lumeo-page-enter keyframe must exist");
  assert.ok(fadeUp.length > 0, "lumeo-fade-up keyframe must exist");
  assert.doesNotMatch(
    pageEnter,
    /opacity:\s*0/,
    "Public page shells must be paintable even when entrance animations are throttled.",
  );
  assert.doesNotMatch(
    fadeUp,
    /opacity:\s*0/,
    "Primary page content must stay paintable during entrance motion.",
  );
});


test("homepage LCP hero paints immediately without a page-only stylesheet", () => {
  const home = readFileSync("app/page.tsx", "utf8");
  assert.doesNotMatch(home, /home\.module\.css/);
  assert.doesNotMatch(home, /styles\./);
  assert.doesNotMatch(
    home,
    /lumeo-fade-up/,
    "The above-the-fold hero contains the LCP heading and must paint immediately.",
  );
  assert.match(home, /min-\[900px\]:grid-cols-/);
  assert.match(home, /sm:text-\[clamp\(2\.25rem,4\.6vw,3\.75rem\)\]/);
});


test("audited public LCP content is not wrapped in entrance motion", () => {
  const home = readFileSync("app/page.tsx", "utf8");
  const shell = readFileSync("components/PublicPdfChrome.tsx", "utf8");
  const tools = readFileSync("app/pdf-tools/page.tsx", "utf8");

  assert.doesNotMatch(
    home,
    /<main[\s\S]{0,400}lumeo-page-enter/,
    "Homepage LCP must not inherit the 640ms page entrance transform.",
  );
  assert.doesNotMatch(
    shell,
    /<main[\s\S]{0,400}lumeo-page-enter/,
    "Audited public catalog routes must paint their shell immediately.",
  );
  assert.doesNotMatch(
    tools,
    /<section className="[^"]*lumeo-fade-up[^"]*"[^>]*>[\s\S]{0,900}Find the right tool\./,
    "PDF Tools LCP copy must not wait on the 620ms fade-up animation.",
  );
});
