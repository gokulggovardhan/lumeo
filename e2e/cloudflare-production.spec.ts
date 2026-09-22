import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { TEXT_ONLY_PDF, writeFixtures } from "./fixtures.ts";

const EDITABLE_RUN = 'div[role="button"][aria-label^="Editable text"]';

function jpegDimensions(bytes: Buffer): { width: number; height: number } {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new Error("Not a JPEG");
  }

  const sof = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
    0xcf,
  ]);
  let offset = 2;

  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++];
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 1 >= bytes.length) break;

    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) break;
    if (sof.has(marker)) {
      return {
        height: bytes.readUInt16BE(offset + 3),
        width: bytes.readUInt16BE(offset + 5),
      };
    }
    offset += length;
  }

  throw new Error("JPEG dimensions not found");
}

function collectProductionAssetFailures(page: import("@playwright/test").Page) {
  const failures: string[] = [];
  page.on("requestfailed", (request) => {
    const url = new URL(request.url());
    if (
      url.hostname === "lumeo.in" &&
      /\.(?:js|mjs|wasm)(?:\?|$)/i.test(url.pathname)
    ) {
      failures.push(`${url.pathname}: ${request.failure()?.errorText ?? "failed"}`);
    }
  });
  return failures;
}

test.beforeAll(async () => {
  await writeFixtures();
});

test("production Edit PDF detects, edits, exports and reopens native text", async ({
  page,
}) => {
  const assetFailures = collectProductionAssetFailures(page);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/pdf/edit", { waitUntil: "domcontentloaded" });
  await page.locator('input[type="file"]').first().setInputFiles(TEXT_ONLY_PDF);

  const editableRuns = page.locator(EDITABLE_RUN);
  await expect(editableRuns.first()).toBeVisible({ timeout: 90_000 });
  await expect(page.locator("[data-edit-page-capability]")).toHaveAttribute(
    "data-edit-page-capability",
    /native-editable|mixed/,
  );

  const labels = await editableRuns.evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("aria-label") ?? "").join(" "),
  );
  expect(labels).toContain("Employee record");
  expect(labels).toContain("123-45-6789");

  const employeeRun = page
    .locator('div[role="button"][aria-label^="Editable text"][aria-label*="Employee record"]')
    .first();
  await employeeRun.click();

  const editor = page.getByRole("textbox", { name: "Edit text" });
  await expect(editor).toBeVisible();
  await editor.fill("Employee file");
  await page.getByRole("button", { name: "Apply edit" }).click();

  const changedRun = page.locator(
    'div[role="button"][aria-label^="Editable text"][aria-label*="Employee file"]',
  );
  await expect(changedRun).toBeVisible({ timeout: 90_000 });

  await page.getByRole("button", { name: "Export PDF" }).click();
  const downloadButton = page.getByRole("button", { name: "Download edited PDF" });
  await expect(downloadButton).toBeVisible({ timeout: 90_000 });

  const downloadPromise = page.waitForEvent("download");
  await downloadButton.click();
  const outputPath = await (await downloadPromise).path();
  expect(outputPath).not.toBeNull();

  const bytes = await readFile(outputPath!);
  expect(bytes.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  const exported = await PDFDocument.load(bytes);
  expect(exported.getPageCount()).toBe(1);

  const textDoc = await pdfjsLib.getDocument({ data: new Uint8Array(bytes) }).promise;
  const textPage = await textDoc.getPage(1);
  const content = await textPage.getTextContent();
  const extracted = content.items
    .map((item) => ("str" in item ? item.str : ""))
    .join(" ");
  expect(extracted).toContain("Employee file");
  expect(extracted).not.toContain("Employee record");
  await textDoc.destroy();

  expect(assetFailures).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test("production HEIC/HEIF worker preserves full-resolution output and download", async ({
  page,
}, testInfo) => {
  const fixturePath = process.env.HEIC_RESOLUTION_FIXTURE;
  test.skip(!fixturePath, "HEIC production fixture was not generated.");

  const assetFailures = collectProductionAssetFailures(page);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const source = await readFile(fixturePath!);
  const useHeifName = testInfo.project.name.includes("webkit");
  const name = useHeifName ? "CLOUDFLARE-PROD.HEIF" : "CLOUDFLARE-PROD.HEIC";
  const mimeType = useHeifName ? "image/heif" : "image/heic";

  await page.goto("/heic-to-jpeg", { waitUntil: "domcontentloaded" });
  await page.locator('input[type="file"]').setInputFiles({
    name,
    mimeType,
    buffer: source,
  });
  await expect(page.getByRole("heading", { name: "1 photo detected" })).toBeVisible();

  await page.getByLabel("Quality").selectOption("92");
  await page.getByRole("button", { name: "Convert to JPEG" }).click();

  const asset = page.locator('[data-photo-asset][data-status="done"]').first();
  await expect(asset).toHaveAttribute("data-primary-dimensions", "6048x8064");
  await expect(asset).toHaveAttribute("data-decoded-dimensions", "6048x8064");
  await expect(asset).toHaveAttribute("data-output-dimensions", "6048x8064");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download JPEG", exact: true }).first().click();
  const download = await downloadPromise;
  const outputPath = await download.path();
  expect(outputPath).not.toBeNull();

  const output = await readFile(outputPath!);
  expect([...output.subarray(0, 3)]).toEqual([255, 216, 255]);
  expect(jpegDimensions(output)).toEqual({ width: 6048, height: 8064 });

  expect(assetFailures).toEqual([]);
  expect(pageErrors).toEqual([]);
});


test("production HEIC batch isolates corrupt input, recovers, and ZIP preserves full resolution", async ({
  page,
}, testInfo) => {
  test.skip(
    !testInfo.project.name.includes("chromium"),
    "full-resolution corruption/ZIP production smoke runs once in Chromium",
  );

  const fixturePath = process.env.HEIC_RESOLUTION_FIXTURE;
  test.skip(!fixturePath, "HEIC production fixture was not generated.");

  const assetFailures = collectProductionAssetFailures(page);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const heic = await readFile(fixturePath!);
  await page.goto("/heic-to-jpeg", { waitUntil: "domcontentloaded" });
  await page.locator('input[type="file"]').setInputFiles([
    { name: "VALID-BEFORE.HEIC", mimeType: "image/heic", buffer: heic },
    { name: "BROKEN.HEIC", mimeType: "image/heic", buffer: Buffer.from("corrupt input") },
    { name: "VALID-AFTER.HEIC", mimeType: "image/heic", buffer: heic },
  ]);

  await page.getByLabel("Quality").selectOption("92");
  await page.getByRole("button", { name: "Convert to JPEG" }).click();
  await expect(page.getByText("2 converted, 1 failed.", { exact: false })).toBeVisible({
    timeout: 120_000,
  });

  const successful = page.locator('[data-photo-asset][data-status="done"]');
  const failed = page.locator('[data-photo-asset][data-status="failed"]');
  await expect(successful).toHaveCount(2);
  await expect(failed).toHaveCount(1);

  for (let index = 0; index < 2; index += 1) {
    await expect(successful.nth(index)).toHaveAttribute(
      "data-primary-dimensions",
      "6048x8064",
    );
    await expect(successful.nth(index)).toHaveAttribute(
      "data-decoded-dimensions",
      "6048x8064",
    );
    await expect(successful.nth(index)).toHaveAttribute(
      "data-output-dimensions",
      "6048x8064",
    );
  }

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download all (2)" }).click();
  const download = await downloadPromise;
  const outputPath = await download.path();
  expect(outputPath).not.toBeNull();

  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(await readFile(outputPath!));
  expect(Object.keys(zip.files).sort()).toEqual([
    "VALID-AFTER.jpg",
    "VALID-BEFORE.jpg",
  ]);

  for (const name of ["VALID-BEFORE.jpg", "VALID-AFTER.jpg"]) {
    const bytes = await zip.file(name)!.async("nodebuffer");
    expect(jpegDimensions(bytes)).toEqual({ width: 6048, height: 8064 });
  }

  expect(assetFailures).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test("production HEIC workspace remains usable on a narrow mobile viewport", async ({
  page,
}, testInfo) => {
  test.skip(
    !testInfo.project.name.includes("chromium"),
    "mobile production layout smoke runs once in Chromium",
  );

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/heic-to-jpeg", { waitUntil: "domcontentloaded" });

  await expect(page.getByText("Choose photos", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Your photos are processed in your browser.", { exact: false }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByText("Choose photos", { exact: true }).click();
  const chooser = await chooserPromise;
  expect(chooser.isMultiple()).toBe(true);
});


async function expectDownloadedPdf(
  page: import("@playwright/test").Page,
  action: () => Promise<void>,
  expectedPages: number,
) {
  const downloadPromise = page.waitForEvent("download");
  await action();
  const download = await downloadPromise;
  const outputPath = await download.path();
  expect(outputPath).not.toBeNull();

  const bytes = await readFile(outputPath!);
  expect(bytes.length).toBeGreaterThan(500);
  expect(bytes.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  const document = await PDFDocument.load(bytes);
  expect(document.getPageCount()).toBe(expectedPages);
}

test("production Merge PDF processes and downloads a real two-page result", async ({
  page,
}, testInfo) => {
  test.skip(
    !testInfo.project.name.includes("chromium"),
    "representative PDF-tool output smoke runs once in Chromium",
  );

  const assetFailures = collectProductionAssetFailures(page);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const fixture = await readFile(TEXT_ONLY_PDF);
  await page.goto("/pdf/merge", { waitUntil: "domcontentloaded" });
  await page.locator('input[type="file"]').first().setInputFiles([
    { name: "merge-a.pdf", mimeType: "application/pdf", buffer: fixture },
    { name: "merge-b.pdf", mimeType: "application/pdf", buffer: fixture },
  ]);

  const merge = page.getByRole("button", { name: "Merge PDFs" });
  await expect(merge).toBeEnabled({ timeout: 60_000 });
  await merge.click();

  const download = page.getByRole("button", { name: "Download merged PDF" });
  await expect(download).toBeVisible({ timeout: 90_000 });
  await expectDownloadedPdf(page, () => download.click(), 2);

  expect(assetFailures).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test("production Crop PDF exports a valid PDF", async ({ page }, testInfo) => {
  test.skip(
    !testInfo.project.name.includes("chromium"),
    "representative PDF-tool output smoke runs once in Chromium",
  );

  const assetFailures = collectProductionAssetFailures(page);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/pdf/crop", { waitUntil: "domcontentloaded" });
  await page.locator('input[type="file"]').first().setInputFiles(TEXT_ONLY_PDF);

  const apply = page.getByRole("button", { name: "Apply Crop" });
  await expect(apply).toBeEnabled({ timeout: 60_000 });
  await apply.click();

  const download = page.getByRole("button", { name: "Download cropped PDF" });
  await expect(download).toBeVisible({ timeout: 90_000 });
  await expectDownloadedPdf(page, () => download.click(), 1);

  expect(assetFailures).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test("production Watermark PDF exports a valid text-watermarked PDF", async ({
  page,
}, testInfo) => {
  test.skip(
    !testInfo.project.name.includes("chromium"),
    "representative PDF-tool output smoke runs once in Chromium",
  );

  const assetFailures = collectProductionAssetFailures(page);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/pdf/watermark", { waitUntil: "domcontentloaded" });
  await page.locator('input[type="file"]').first().setInputFiles(TEXT_ONLY_PDF);

  const watermarkText = page.getByLabel("Text", { exact: true });
  await expect(watermarkText).toBeVisible({ timeout: 60_000 });
  await watermarkText.fill("CLOUDFLARE");

  const apply = page.getByRole("button", { name: "Add Watermark" });
  await expect(apply).toBeEnabled();
  await apply.click();

  const download = page.getByRole("button", { name: "Download watermarked PDF" });
  await expect(download).toBeVisible({ timeout: 90_000 });
  await expectDownloadedPdf(page, () => download.click(), 1);

  expect(assetFailures).toEqual([]);
  expect(pageErrors).toEqual([]);
});
