import { defineConfig, devices } from "@playwright/test";


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
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium-production-conversion",
      use: {
        ...devices["Desktop Chrome"],
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
      name: "webkit-production-conversion",
      use: { ...devices["Desktop Safari"] },
    },
  ],
});
