import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "cloudflare-production.spec.ts",
  timeout: 180_000,
  expect: { timeout: 90_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "https://lumeo.in",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium-production", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit-production", use: { ...devices["Desktop Safari"] } },
    { name: "firefox-production", use: { ...devices["Desktop Firefox"] } },
  ],
});
