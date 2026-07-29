// tests/pdf-output-validation.test.ts
//
// Automated PDF output validation for the release certification suite
// (docs/RELEASE_CERTIFICATION.md, Part 4). These checks decode generated
// PDFs and assert on MediaBox/CropBox/rotation/page count/transformation
// math directly -- deliberately never a visual screenshot comparison, per
// the certification doc's own rule ("never compare visual screenshots if
// mathematical validation is available"). Reuses the same export functions
// already covered by tests/crop-export.test.ts, tests/watermark-export.test.ts,
// and tests/edit-pdf-export.test.ts -- this file adds cross-cutting
// structural checks (page count, mixed sizes/rotations, corrupted input)
// rather than duplicating each tool's own detailed math assertions.

import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import { exportCroppedPdf } from "../lib/pdf/crop/export.ts";
import { createDefaultCropConfig } from "../lib/pdf/crop/config.ts";
import { exportWatermarkedPdf } from "../lib/pdf/watermark/export.ts";
import { createDefaultTextWatermarkConfig } from "../lib/pdf/watermark/config.ts";
import {
  makeCorruptedPdfBytes,
  makeMediumPdf,
  makeMixedPageSizesPdf,
  makeMixedRotationsPdf,
  makeNonPdfBytes,
  makeSinglePagePdf,
  makeZeroPagePdf,
  PAGE_SIZES,
} from "./fixtures/pdfFixtures.ts";

test("pdf output validation: page count is preserved across Crop export", async () => {
  const original = await makeMediumPdf(12);
  const config = createDefaultCropConfig();
  const { bytes, skippedPages } = await exportCroppedPdf(original, config);
  assert.deepEqual(skippedPages, []);

  const exported = await PDFDocument.load(bytes);
  assert.equal(exported.getPageCount(), 12);
});

test("pdf output validation: mixed page sizes each keep their own independent MediaBox after Crop export", async () => {
  const original = await makeMixedPageSizesPdf();
  const originalDoc = await PDFDocument.load(original);
  const originalSizes = originalDoc.getPages().map((p) => p.getSize());

  // createDefaultCropConfig()'s DEFAULT_CROP_RECT is a centered 80%x80% crop,
  // not a full-page no-op -- so each page should shrink to exactly 80% of
  // its OWN original size, never another page's size. That per-page
  // derivation (not reusing one page's dimensions for all of them) is the
  // exact invariant Watermark v1.0.0 originally shipped a bug against.
  const config = createDefaultCropConfig();
  const { bytes, skippedPages } = await exportCroppedPdf(original, config);
  assert.deepEqual(skippedPages, []);

  const exported = await PDFDocument.load(bytes);
  const exportedSizes = exported.getPages().map((p) => p.getSize());
  assert.equal(exportedSizes.length, originalSizes.length);
  for (let i = 0; i < originalSizes.length; i++) {
    assert.ok(Math.abs(exportedSizes[i].width - originalSizes[i].width * 0.8) < 1);
    assert.ok(Math.abs(exportedSizes[i].height - originalSizes[i].height * 0.8) < 1);
  }
});

test("pdf output validation: each page's /Rotate value survives Watermark export untouched when no rotation is added", async () => {
  const original = await makeMixedRotationsPdf();
  const originalDoc = await PDFDocument.load(original);
  const originalRotations = originalDoc.getPages().map((p) => p.getRotation().angle);

  const config = createDefaultTextWatermarkConfig();
  const { bytes, skippedPages } = await exportWatermarkedPdf(original, config);
  assert.deepEqual(skippedPages, []);

  const exported = await PDFDocument.load(bytes);
  const exportedRotations = exported.getPages().map((p) => p.getRotation().angle);
  assert.deepEqual(exportedRotations, originalRotations);
});

test("pdf output validation: single-page A4 document round-trips through Crop export with an unchanged page count", async () => {
  const original = await makeSinglePagePdf(PAGE_SIZES.a4);
  const config = createDefaultCropConfig();
  const { bytes, skippedPages } = await exportCroppedPdf(original, config);
  assert.deepEqual(skippedPages, []);

  const exported = await PDFDocument.load(bytes);
  assert.equal(exported.getPageCount(), 1);
});

test("pdf output validation: a zero-page document does not crash Crop export", async () => {
  // Note: pdf-lib itself materializes one default A4 page when a zero-page
  // document is saved and reloaded (verified directly against PDFDocument,
  // independent of any Lumeo export code) -- so the meaningful assertion
  // here is that exportCroppedPdf doesn't throw or skip pages on an empty
  // scope, not a specific output page count.
  const original = await makeZeroPagePdf();
  const config = createDefaultCropConfig();
  const { skippedPages } = await exportCroppedPdf(original, config);
  assert.deepEqual(skippedPages, []);
});

test("pdf output validation: corrupted (truncated) input is rejected, not silently accepted", async () => {
  const corrupted = await makeCorruptedPdfBytes();
  await assert.rejects(() => PDFDocument.load(corrupted));
});

test("pdf output validation: a non-PDF file is rejected by pdf-lib's loader", async () => {
  // lib/pdf/uploadValidation.ts's hasPdfMagicBytes() catches this same case
  // earlier in the real upload flow, but isn't imported here: it
  // transitively imports via the "@/" path alias, which the bare Node test
  // runner (no path-alias support) can't resolve -- the same constraint
  // documented in lib/pdf/watermark/export.ts and lib/pdf/crop/export.ts.
  // hasPdfMagicBytes itself currently has no dedicated unit test; see
  // docs/RELEASE_CERTIFICATION.md's "Known limitations" section.
  const notAPdf = makeNonPdfBytes();
  await assert.rejects(() => PDFDocument.load(notAPdf));
});

