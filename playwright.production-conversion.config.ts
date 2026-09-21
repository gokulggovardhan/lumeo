import { readFileSync } from "node:fs";

import { defineConfig, devices } from "@playwright/test";

const runtimeRelease = JSON.parse(
  readFileSync("config/office-runtime-release.json", "utf8"),
) as { releaseId: string };

export default defineConfig({
  testDir: "./e2e",
  testMatch: "production-conversion-smoke.spec.ts",
  timeout: 480_000,
  expect: { timeout: 120_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "https://lumeo.in",
    extraHTTPHeaders: {
      "x-lumeo-conversion-smoke": runtimeRelease.releaseId,
    },
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium-production-conversion",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "webkit-production-conversion",
      use: { ...devices["Desktop Safari"] },
    },
  ],
});
