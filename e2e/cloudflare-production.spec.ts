import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { PDFDocument, StandardFonts } from "pdf-lib";

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

test("production Edit PDF loads the deployed pdf.js worker and detects text", async ({
  page,
}) => {
  const assetFailures = collectProductionAssetFailures(page);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const pdfPage = pdf.addPage([595, 842]);
  pdfPage.drawText("Cloudflare production PDF worker smoke", {
    x: 60,
    y: 720,
    size: 18,
    font,
  });
  const bytes = Buffer.from(await pdf.save());

  await page.goto("/pdf/edit", { waitUntil: "domcontentloaded" });
  await page.locator('input[type="file"]').first().setInputFiles({
    name: "cloudflare-production-smoke.pdf",
    mimeType: "application/pdf",
    buffer: bytes,
  });

  await expect(page.locator(EDITABLE_RUN).first()).toBeVisible();
  await expect(
    page.locator(
      'div[role="button"][aria-label*="Cloudflare production PDF worker smoke"]',
    ),
  ).toBeVisible();

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
  await page.getByRole("button", { name: "Download JPEG", exact: true }).click();
  const download = await downloadPromise;
  const outputPath = await download.path();
  expect(outputPath).not.toBeNull();

  const output = await readFile(outputPath!);
  expect([...output.subarray(0, 3)]).toEqual([255, 216, 255]);
  expect(jpegDimensions(output)).toEqual({ width: 6048, height: 8064 });

  expect(assetFailures).toEqual([]);
  expect(pageErrors).toEqual([]);
});
