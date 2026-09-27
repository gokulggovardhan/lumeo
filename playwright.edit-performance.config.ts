import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "edit-performance.spec.ts",
  timeout: 1_200_000,
  expect: { timeout: 180_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:8787",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium-edit-performance",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
