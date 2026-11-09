import { defineConfig, devices } from "@playwright/test";

/**
 * Real lumeo.in certification for the two user-facing native PDF tools.
 * These synthetic PDF inputs are generated in the browser test and processed
 * locally by Web Workers; no document contents or filenames are sent to CI
 * telemetry or any remote PDF conversion service.
 *
 * Run only the three focused tests already exercised in the PR release gate.
 * This prevents duplicating the broader connected Workspace local suite.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: ["workspace-mobile.spec.ts"],
  grep: /^(Merge PDF worker downloads native rotated pages with searchable text|Compress PDF shared worker creates downloadable valid PDF with native text|Merge PDF optional smart optimisation uses shared worker without changing pages)$/,
  timeout: 180_000,
  expect: { timeout: 90_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "https://lumeo.in",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium-production-pdf-engine",
      use: {
        ...devices["Desktop Chrome"],
        userAgent: `${devices["Desktop Chrome"].userAgent} LumeoSyntheticTest/1`,
        headless: false,
        launchOptions: {
          args: [
            "--use-gl=angle",
            "--use-angle=swiftshader-webgl",
            "--enable-unsafe-swiftshader",
            "--ignore-gpu-blocklist",
            "--enable-gpu",
          ],
        },
      },
    },
    {
      name: "webkit-production-pdf-engine",
      use: {
        ...devices["Desktop Safari"],
        userAgent: `${devices["Desktop Safari"].userAgent} LumeoSyntheticTest/1`,
      },
    },
    {
      name: "webkit-mobile-production-pdf-engine",
      use: {
        ...devices["iPhone 15 Pro"],
        userAgent: `${devices["iPhone 15 Pro"].userAgent} LumeoSyntheticTest/1`,
      },
    },
    {
      name: "firefox-production-pdf-engine",
      use: {
        ...devices["Desktop Firefox"],
        userAgent: `${devices["Desktop Firefox"].userAgent} LumeoSyntheticTest/1`,
      },
    },
  ],
});
