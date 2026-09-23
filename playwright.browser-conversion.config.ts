import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "browser-conversion-validation.spec.ts",
  timeout: 480_000,
  expect: { timeout: 120_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3100",
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "chromium-conversion", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit-conversion", use: { ...devices["Desktop Safari"] } },
    {
      name: "webkit-mobile-conversion",
      use: { ...devices["iPhone 15 Pro"] },
    },
    { name: "firefox-conversion", use: { ...devices["Desktop Firefox"] } },
  ],
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100/internal/conversion-lab",
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
