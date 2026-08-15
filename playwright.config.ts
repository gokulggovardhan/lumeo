import { defineConfig, devices } from "@playwright/test";

// Browser-level tests, kept OUT of `npm test` (which is node --test over
// tests/*.ts and must stay fast and dependency-free). These live in e2e/ and
// run with `npm run test:e2e`.
//
// The reason these exist at all: the drag surface, the confirmation modal
// and the redaction outcome panel cannot be verified from Node, and manual
// browser passes in this environment kept being defeated by a backgrounded
// window (requestAnimationFrame stops firing, pdfjs's render loop stalls,
// and every symptom looks like an application bug). Headless Chromium runs
// rAF normally, so these assertions are both possible and repeatable --
// which a manual pass never was.
export default defineConfig({
  testDir: "./e2e",
  // Page rendering plus pdfjs text detection is genuinely slow on a cold
  // dev server; a tight timeout here produces flakes that look like defects.
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    ...devices["Desktop Chrome"],
    viewport: { width: 1600, height: 1000 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000/pdf/edit",
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
