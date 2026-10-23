import { defineConfig, devices } from "@playwright/test";

// Reuse the maintained recovery suite, excluding controlled failures from live traffic.
export default defineConfig({
  testDir: "./e2e",
  testMatch: "phase11-recovery.spec.ts",
  grepInvert: /@isolated/,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  workers: 1,
  reporter: [["list"], ["json", { outputFile: "test-results/phase11-production.json" }]],
  use: { baseURL: "https://lumeo.in", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "chromium-phase11-live", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit-phase11-live", use: { ...devices["Desktop Safari"] } },
    { name: "firefox-phase11-live", use: { ...devices["Desktop Firefox"] } },
  ],
});
