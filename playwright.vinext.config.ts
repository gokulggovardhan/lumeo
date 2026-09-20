import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "edit-vinext.spec.ts",
  timeout: 120_000,
  expect: { timeout: 90_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:8787",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium-vinext", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit-vinext", use: { ...devices["Desktop Safari"] } },
    { name: "firefox-vinext", use: { ...devices["Desktop Firefox"] } },
  ],
});
