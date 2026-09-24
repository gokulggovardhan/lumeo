import { expect, test } from "@playwright/test";
import type { Download, Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";

async function downloadBytes(download: Download): Promise<Buffer> {
  const path = await download.path();
  if (!path) throw new Error("Downloaded HTML-to-PDF file has no local path.");
  return readFile(path);
}

async function replaceControlledText(
  page: Page,
  label: string,
  value: string,
): Promise<void> {
  const field = page.getByLabel(label);
  await field.click();
  await field.press("ControlOrMeta+A");
  await page.keyboard.insertText(value);
  await expect(field).toHaveValue(value);
}

test("HTML to PDF produces multi-page output and supports repeat generation", async ({ page }, testInfo) => {
  await page.goto("/pdf/html-to-pdf", { waitUntil: "domcontentloaded" });

  const repeatedParagraphs = Array.from(
    { length: 80 },
    (_, index) => `<p>Cross-browser row ${index + 1}: Unicode café résumé 日本語 € ✓.</p>`,
  ).join("");
  const png =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP8z8Dwn4GBgYGJAQoAHxcCAk+Uzr4AAAAASUVORK5CYII=";
  const html = `<!doctype html>
<html>
<head>
<style>
  body { font-family: Arial, sans-serif; color: #222; line-height: 1.45; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; }
  th, td { border: 1px solid #444; padding: 8px; text-align: left; }
  .hero { display: flex; gap: 16px; align-items: center; }
  .hero img { width: 72px; height: 72px; }
  .page-break { break-before: page; page-break-before: always; }
</style>
</head>
<body>
  <div class="hero"><img src="${png}" alt="Synthetic fixture"><div><h1>Cross-browser HTML certification</h1><p>Browser-only export.</p></div></div>
  <table><tr><th>Item</th><th>Qty</th><th>Amount</th></tr><tr><td>Service</td><td>2</td><td>125.00</td></tr></table>
  ${repeatedParagraphs}
  <div class="page-break"></div>
  <h2>Forced second section</h2>
  <p>Page break fidelity marker — © ® ™ ₹.</p>
</body>
</html>`;

  await replaceControlledText(page, "HTML and CSS source", html);
  await page.getByLabel("File name").fill(`HTML Multi Page ${testInfo.project.name}`);
  await expect(page.getByLabel("HTML and CSS source")).toHaveValue(html);

  const generate = page.locator("button.lumeo-primary-action").first();
  await expect(generate).toContainText("Generate PDF");
  let downloadPromise = page.waitForEvent("download");
  await generate.click();
  let download = await downloadPromise;
  await expect(generate).toBeEnabled();

  let bytes = await downloadBytes(download);
  let pdf = await PDFDocument.load(bytes);
  expect(pdf.getPageCount()).toBeGreaterThanOrEqual(2);
  expect(bytes.length).toBeGreaterThan(5_000);

  const repeatHtml =
    "<style>table{border-collapse:collapse}td{border:1px solid #333;padding:6px}</style><h1>Repeat conversion</h1><table><tr><td>Repeat</td><td>Works</td></tr></table><p>Unicode Ω λ 漢字.</p>";
  await replaceControlledText(page, "HTML and CSS source", repeatHtml);
  await page.getByLabel("File name").fill(`HTML Repeat ${testInfo.project.name}`);
  await expect(page.getByLabel("HTML and CSS source")).toHaveValue(repeatHtml);
  downloadPromise = page.waitForEvent("download");
  await generate.click();
  download = await downloadPromise;
  await expect(generate).toBeEnabled();

  bytes = await downloadBytes(download);
  pdf = await PDFDocument.load(bytes);
  expect(pdf.getPageCount()).toBeGreaterThan(0);
  expect(bytes.length).toBeGreaterThan(1_000);
});
