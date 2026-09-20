import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "admin-auth.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: {
    timeout: 15_000,
  },
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:8787",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium-desktop-worker",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "chromium-mobile-worker",
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "webkit-iphone-worker",
      use: { ...devices["iPhone 13"] },
    },
  ],
});
