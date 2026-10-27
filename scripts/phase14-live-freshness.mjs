import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { webkit, devices, expect } from "@playwright/test";
import { PDFDocument } from "pdf-lib";

// Isolated, read-only, synthetic-document production acceptance. This QA
// branch is never merged or deployed. No admin or database calls are made.
const expectedSha = process.env.EXPECTED_MAIN_SHA;
assert.match(expectedSha || "", /^[0-9a-f]{40}$/);

const buildResponse = await fetch("https://lumeo.in/api/build-info");
assert.equal(buildResponse.status, 200, "Production build-info must be HTTP 200");
const build = await buildResponse.json();
assert.equal(build.commit, expectedSha, "Live production must match the protected main application SHA");
assert.equal(build.environment, "production", "Must test production, not preview");

const results = [];
const browser = await webkit.launch({ headless: true });
await mkdir("test-results", { recursive: true });

async function replaceControlledText(page, value) {
  const input = page.getByLabel("HTML and CSS source");
  await input.click();
  await input.press("ControlOrMeta+A");
  await page.keyboard.insertText(value);
  await expect(input).toHaveValue(value);
}

async function downloadGeneratedPdf(page, expectedName, minimumPages, minimumBytes) {
  const generate = page.locator("button.lumeo-primary-action").first();
  await expect(generate).toHaveAttribute("data-generate-client-ready", "true", { timeout: 60000 });
  await expect(generate).toBeEnabled();
  await generate.click();
  const fallback = page.getByRole("button", { name: "Download generated PDF" });
  await expect(fallback).toBeVisible({ timeout: 120000 });
  const downloadEvent = page.waitForEvent("download", { timeout: 60000 });
  await fallback.click();
  const download = await downloadEvent;
  assert.equal(download.suggestedFilename(), expectedName);
  const path = await download.path();
  assert.ok(path, "Browser must produce an actual downloadable file");
  const bytes = await readFile(path);
  const pdf = await PDFDocument.load(bytes);
  assert.ok(pdf.getPageCount() >= minimumPages, "Downloaded PDF page count is too small");
  assert.ok(bytes.length > minimumBytes, "Downloaded PDF bytes are too small");
  return {
    name: download.suggestedFilename(),
    bytes: bytes.length,
    pages: pdf.getPageCount(),
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

const paragraphs = Array.from(
  { length: 80 },
  (_, i) => "<p>Production Phase14 first revision row " + (i + 1) + " Unicode cafe.</p>",
).join("");
const firstHtml =
  "<!doctype html><html><head><style>body{font-family:Arial;line-height:1.5}" +
  ".break{break-before:page;page-break-before:always}</style></head><body>" +
  "<h1>Phase14 live first revision</h1>" + paragraphs +
  "<div class='break'></div><h2>Forced second section</h2></body></html>";
const secondHtml =
  "<!doctype html><html><body><h1>Phase14 live SECOND revision</h1>" +
  "<p>This output must be newly generated, not the previous PDF.</p></body></html>";

try {
  for (const deviceName of ["Desktop Safari", "iPhone 15 Pro"]) {
    const device = devices[deviceName];
    const context = await browser.newContext({
      ...device,
      acceptDownloads: true,
      userAgent: device.userAgent + " LumeoSyntheticTest/1",
    });
    const page = await context.newPage();
    try {
      await page.goto("https://lumeo.in/pdf/html-to-pdf", {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
      await replaceControlledText(page, firstHtml);
      await page.getByLabel("File name").fill("phase14-live-first");
      const first = await downloadGeneratedPdf(
        page, "phase14-live-first.pdf", 2, 5000,
      );
      const fallback = page.getByRole("button", { name: "Download generated PDF" });
      const continuation = page.locator('section[aria-label="Continue with this PDF"]');
      await expect(fallback).toBeVisible();
      await expect(continuation).toBeVisible();

      // The crucial Stage10 acceptance: editing must immediately invalidate
      // both the old download and the old Workspace continuation.
      await replaceControlledText(page, secondHtml);
      await expect(fallback).toBeHidden();
      await expect(continuation).toBeHidden();
      await page.getByLabel("File name").fill("phase14-live-second");
      const second = await downloadGeneratedPdf(
        page, "phase14-live-second.pdf", 1, 1000,
      );
      assert.notEqual(second.sha256, first.sha256, "Second download must contain new bytes");
      await expect(continuation).toBeVisible();

      // Changing layout also makes both previous output actions stale.
      await page.getByLabel("Page size").selectOption("letter");
      await expect(fallback).toBeHidden();
      await expect(continuation).toBeHidden();

      const record = {
        device: deviceName,
        passed: true,
        first,
        second,
        invalidatedAfterHtmlEdit: true,
        invalidatedAfterPageSizeEdit: true,
        workspaceHandoffInvalidated: true,
      };
      results.push(record);
      console.log("PASS Phase14 production WebKit: " + JSON.stringify(record));
    } catch (error) {
      await page.screenshot({
        path: "test-results/phase14-" + deviceName.replace(/[^a-z0-9]/gi, "-") + "-failure.png",
        fullPage: true,
      }).catch(() => {});
      throw error;
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
  await writeFile(
    "test-results/phase14-live-freshness.json",
    JSON.stringify({
      testedAt: new Date().toISOString(),
      expectedSha,
      liveBuild: build,
      results,
    }, null, 2) + "\n",
  );
}
assert.equal(results.length, 2, "Both desktop and mobile WebKit must pass");
