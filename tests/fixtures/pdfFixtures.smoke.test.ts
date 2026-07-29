// Throwaway-style smoke coverage ensuring every fixture generator in
// pdfFixtures.ts actually produces a loadable PDF -- catches a broken
// generator immediately rather than only when some future test happens to
// import it.
import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import * as fixtures from "./pdfFixtures.ts";

const generators: Array<[string, () => Promise<ArrayBuffer> | ArrayBuffer]> = [
  ["makeSinglePagePdf", () => fixtures.makeSinglePagePdf()],
  ["makeMediumPdf", () => fixtures.makeMediumPdf()],
  ["makeLargePdf", () => fixtures.makeLargePdf(120)],
  ["makeLandscapePdf", () => fixtures.makeLandscapePdf()],
  ["makeMixedPageSizesPdf", () => fixtures.makeMixedPageSizesPdf()],
  ["makeMixedRotationsPdf", () => fixtures.makeMixedRotationsPdf()],
  ["makeTextHeavyPdf", () => fixtures.makeTextHeavyPdf()],
  ["makeUnicodeMetadataPdf", () => fixtures.makeUnicodeMetadataPdf()],
  ["makeMetadataPdf", () => fixtures.makeMetadataPdf()],
  ["makeTransparencyPdf", () => fixtures.makeTransparencyPdf()],
  ["makeVectorPdf", () => fixtures.makeVectorPdf()],
  ["makeImageOnlyPdf", () => fixtures.makeImageOnlyPdf()],
  ["makeFormFieldPdf", () => fixtures.makeFormFieldPdf()],
  ["makeZeroPagePdf", () => fixtures.makeZeroPagePdf()],
];

for (const [name, make] of generators) {
  test(`fixture smoke: ${name} produces a loadable PDF`, async () => {
    const bytes = await make();
    const doc = await PDFDocument.load(bytes);
    assert.ok(doc.getPageCount() >= 0);
  });
}

test("fixture smoke: makeCorruptedPdfBytes produces bytes pdf-lib rejects", async () => {
  const bytes = await fixtures.makeCorruptedPdfBytes();
  await assert.rejects(() => PDFDocument.load(bytes));
});

test("fixture smoke: makeNonPdfBytes produces bytes pdf-lib rejects", async () => {
  const bytes = fixtures.makeNonPdfBytes();
  await assert.rejects(() => PDFDocument.load(bytes));
});
