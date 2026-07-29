import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument, degrees } from "pdf-lib";
import { exportCroppedPdf } from "../lib/pdf/crop/export.ts";
import { createDefaultCropConfig, type CropConfig } from "../lib/pdf/crop/config.ts";

function approxEqual(actual: number, expected: number, tolerance = 0.05) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `expected ~${expected}, got ${actual}`);
}

async function makeBlankPdf(sizes: Array<[number, number]>, rotationDeg = 0): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  for (const [w, h] of sizes) {
    const page = doc.addPage([w, h]);
    if (rotationDeg !== 0) page.setRotation(degrees(rotationDeg));
  }
  const bytes = await doc.save();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

test("exportCroppedPdf sets MediaBox and CropBox to the requested rect on an unrotated page", async () => {
  const original = await makeBlankPdf([[612, 792]]);
  const config: CropConfig = {
    ...createDefaultCropConfig(),
    rect: { xPct: 10, yPct: 20, widthPct: 60, heightPct: 40 },
  };
  const { bytes, skippedPages } = await exportCroppedPdf(original, config);
  assert.deepEqual(skippedPages, []);

  const reloaded = await PDFDocument.load(bytes);
  const page = reloaded.getPage(0);
  const mediaBox = page.getMediaBox();
  const cropBox = page.getCropBox();

  // Unrotated page: visual == native. xPct=10% of 612=61.2, widthPct=60%=367.2;
  // native y = nativeHeight - visualY - visualHeight (top-down -> bottom-up flip).
  approxEqual(mediaBox.x, 61.2);
  approxEqual(mediaBox.width, 367.2);
  approxEqual(mediaBox.y, 792 - 792 * 0.2 - 792 * 0.4); // = 792*(1-0.2-0.4) = 316.8
  approxEqual(mediaBox.height, 792 * 0.4);
  approxEqual(cropBox.x, mediaBox.x);
  approxEqual(cropBox.y, mediaBox.y);
  approxEqual(cropBox.width, mediaBox.width);
  approxEqual(cropBox.height, mediaBox.height);
});

test("exportCroppedPdf handles a page range referencing a nonexistent page without throwing", async () => {
  const original = await makeBlankPdf([[612, 792]]);
  const config: CropConfig = { ...createDefaultCropConfig(), scope: { mode: "custom", pages: [0, 5] } };
  const { bytes, skippedPages } = await exportCroppedPdf(original, config);
  assert.deepEqual(skippedPages, []);
  const reloaded = await PDFDocument.load(bytes);
  assert.equal(reloaded.getPageCount(), 1);
});

test("exportCroppedPdf 'current' scope only crops the specified page, leaving others untouched", async () => {
  const original = await makeBlankPdf([
    [612, 792],
    [612, 792],
    [612, 792],
  ]);
  const config: CropConfig = {
    ...createDefaultCropConfig(),
    rect: { xPct: 0, yPct: 0, widthPct: 50, heightPct: 50 },
    scope: { mode: "current", pageIndex: 1 },
  };
  const { bytes } = await exportCroppedPdf(original, config);
  const reloaded = await PDFDocument.load(bytes);

  approxEqual(reloaded.getPage(0).getMediaBox().width, 612);
  approxEqual(reloaded.getPage(1).getMediaBox().width, 306);
  approxEqual(reloaded.getPage(2).getMediaBox().width, 612);
});

// ---------------------------------------------------------------------------
// Mixed page sizes -- the exact regression class Watermark PDF v1.0.0 had to
// fix after release. This module never makes that mistake: the rect is
// percent-based and converted fresh per page inside the export loop (see
// lib/pdf/crop/export.ts), so every page must independently get a
// proportionally-correct crop from its own real dimensions.
// ---------------------------------------------------------------------------

test("exportCroppedPdf with scope 'all' crops every page proportionally to ITS OWN size on a mixed-page-size document", async () => {
  const original = await makeBlankPdf([
    [612, 792], // Letter portrait
    [792, 612], // Letter landscape
    [595.28, 841.89], // A4 portrait
  ]);
  const config: CropConfig = {
    ...createDefaultCropConfig(),
    rect: { xPct: 10, yPct: 10, widthPct: 80, heightPct: 80 },
    scope: { mode: "all" },
  };
  const { bytes, skippedPages } = await exportCroppedPdf(original, config);
  assert.deepEqual(skippedPages, []);

  const reloaded = await PDFDocument.load(bytes);
  const expectedSizes: Array<[number, number]> = [
    [612, 792],
    [792, 612],
    [595.28, 841.89],
  ];
  reloaded.getPages().forEach((page, index) => {
    const [pw, ph] = expectedSizes[index];
    const box = page.getMediaBox();
    approxEqual(box.width, pw * 0.8, 0.5);
    approxEqual(box.height, ph * 0.8, 0.5);
    approxEqual(box.x, pw * 0.1, 0.5);
    approxEqual(box.y, ph * 0.1, 0.5);
  });
});

// ---------------------------------------------------------------------------
// Rotated pages -- toNativeBox must correctly account for a page's own
// native /Rotate value, the same way lib/pdf/watermark/export.ts's
// toNativePoint already does for text/image placement.
// ---------------------------------------------------------------------------

for (const rotation of [90, 180, 270] as const) {
  test(`exportCroppedPdf preserves page rotation metadata (${rotation}deg)`, async () => {
    const original = await makeBlankPdf([[612, 792]], rotation);
    const config = createDefaultCropConfig();
    const { bytes } = await exportCroppedPdf(original, config);
    const reloaded = await PDFDocument.load(bytes);
    assert.equal(reloaded.getPage(0).getRotation().angle, rotation);
  });

  test(`exportCroppedPdf crops the correct VISUAL region on a page rotated ${rotation}deg`, async () => {
    // Top-left-visual quarter of the page, regardless of native rotation --
    // must always occupy the visually-top-left quarter once the viewer
    // applies /Rotate, which means the NATIVE box differs per rotation
    // even though the visual rect (xPct/yPct/widthPct/heightPct) is
    // identical in all four cases.
    const nativeWidth = 612;
    const nativeHeight = 792;
    const original = await makeBlankPdf([[nativeWidth, nativeHeight]], rotation);
    const config: CropConfig = {
      ...createDefaultCropConfig(),
      rect: { xPct: 0, yPct: 0, widthPct: 50, heightPct: 50 },
    };
    const { bytes } = await exportCroppedPdf(original, config);
    const reloaded = await PDFDocument.load(bytes);
    const box = reloaded.getPage(0).getMediaBox();

    const visualWidth = rotation === 90 || rotation === 270 ? nativeHeight : nativeWidth;
    const visualHeight = rotation === 90 || rotation === 270 ? nativeWidth : nativeHeight;
    // At 90/270deg, toNativePoint swaps x<->y (native.x = visualY,
    // native.y = visualX), so the NATIVE box's width comes from the
    // VISUAL box's height and vice versa. At 0/180deg there is no axis
    // swap (only a mirror), so native width/height match visual
    // width/height directly. Both are correct behavior for a
    // rotation-aware box transform -- this is not a bug, it's why
    // toNativeBox exists instead of a naive width/height copy.
    const expectedNativeWidth = rotation === 90 || rotation === 270 ? visualHeight * 0.5 : visualWidth * 0.5;
    const expectedNativeHeight = rotation === 90 || rotation === 270 ? visualWidth * 0.5 : visualHeight * 0.5;
    approxEqual(box.width, expectedNativeWidth, 0.5);
    approxEqual(box.height, expectedNativeHeight, 0.5);
    assert.ok(box.x >= -0.5 && box.x + box.width <= nativeWidth + 0.5, `native box x-range out of bounds: ${JSON.stringify(box)}`);
    assert.ok(box.y >= -0.5 && box.y + box.height <= nativeHeight + 0.5, `native box y-range out of bounds: ${JSON.stringify(box)}`);
  });
}
