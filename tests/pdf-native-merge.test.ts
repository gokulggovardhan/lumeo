import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument, StandardFonts, degrees } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { mergeNativeDocuments, nativePagePlacement } from "../lib/pdf/merge/nativeMerge.ts";

async function fixture(label: string, rotation = 0, width = 400, height = 600) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([width, height]);
  page.drawText(label, { x: 30, y: height - 70, size: 20, font });
  if (rotation) page.setRotation(degrees(rotation));
  const bytes = await pdf.save();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function extractPdfText(bytes: ArrayBuffer): Promise<string> {
  const task = pdfjsLib.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true });
  const doc = await task.promise;
  try {
    const pages: string[] = [];
    for (let index = 1; index <= doc.numPages; index++) {
      const page = await doc.getPage(index);
      const content = await page.getTextContent();
      pages.push(content.items.map((item) => "str" in item ? item.str : "").join(" "));
    }
    return pages.join(" ");
  } finally {
    await doc.destroy();
  }
}

test("native merge preserves selectable text, original page sizes, source order and 90/270 rotations", async () => {
  const merged = await mergeNativeDocuments([
    { name: "a.pdf", bytes: await fixture("SOURCE ALPHA", 0, 400, 600), rotation: 90 },
    { name: "b.pdf", bytes: await fixture("SOURCE BETA", 90, 500, 700), rotation: 180 },
  ], { format: "original", marginPoints: 24 });
  assert.equal(merged.pageCount, 2);
  const doc = await PDFDocument.load(merged.bytes);
  assert.equal(doc.getPageCount(), 2);
  assert.deepEqual(doc.getPages().map((page) => page.getRotation().angle), [90, 270]);
  assert.deepEqual(doc.getPages().map((page) => page.getSize()), [{ width: 400, height: 600 }, { width: 500, height: 700 }]);
  const text = await extractPdfText(merged.bytes);
  assert.match(text, /SOURCE ALPHA/);
  assert.match(text, /SOURCE BETA/);
  assert.ok(text.indexOf("SOURCE ALPHA") < text.indexOf("SOURCE BETA"));
});

test("fitted native merge retains selectable text with mixed sizes and native rotations", async () => {
  const progress: number[] = [];
  const merged = await mergeNativeDocuments([
    { name: "a.pdf", bytes: await fixture("FIT ALPHA", 0, 400, 600), rotation: 90 },
    { name: "b.pdf", bytes: await fixture("FIT BETA", 90, 800, 400), rotation: 270 },
  ], { format: "smartA4Portrait", marginPoints: 24, onProgress: (completed) => progress.push(completed) });
  assert.deepEqual(progress, [1, 2]);
  assert.equal(merged.pageCount, 2);
  const doc = await PDFDocument.load(merged.bytes);
  assert.ok(doc.getPages().every((page) => Math.abs(page.getWidth() - 595.28) < 0.01));
  assert.ok(doc.getPages().every((page) => Math.abs(page.getHeight() - 841.89) < 0.01));
  const text = await extractPdfText(merged.bytes);
  assert.match(text, /FIT ALPHA/);
  assert.match(text, /FIT BETA/);
});

test("native placement stays within selected margins for every supported rotation", () => {
  for (const angle of [0, 90, 180, 270]) {
    const p = nativePagePlacement({
      sourceWidth: 400, sourceHeight: 800, targetWidth: 595, targetHeight: 842,
      marginPoints: 24, clockwiseDegrees: angle,
    });
    assert.ok(p.rotatedWidth <= 595 - 48 + 0.001);
    assert.ok(p.rotatedHeight <= 842 - 48 + 0.001);
    assert.ok(p.width > 0 && p.height > 0);
    assert.ok([0, 90, 180, 270].includes(p.counterClockwise));
  }
  assert.throws(() => nativePagePlacement({
    sourceWidth: 400, sourceHeight: 800, targetWidth: 595, targetHeight: 842,
    marginPoints: 24, clockwiseDegrees: 45,
  }), /rotation/);
});

test("merging refuses unsupported interactive PDF forms rather than silently losing them", async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([300, 400]);
  const field = doc.getForm().createTextField("customer");
  field.addToPage(page);
  const form = await doc.save();
  const formBytes = form.buffer.slice(form.byteOffset, form.byteOffset + form.byteLength) as ArrayBuffer;
  await assert.rejects(
    mergeNativeDocuments([
      { name: "form.pdf", bytes: formBytes, rotation: 0 },
      { name: "plain.pdf", bytes: await fixture("SIMPLE PAGE"), rotation: 0 },
    ], { format: "original", marginPoints: 0 }),
    /protected or interactive document structure/,
  );
});

test("native merger rejects invalid inputs without generating a downloadable PDF", async () => {
  await assert.rejects(mergeNativeDocuments([], { format: "original", marginPoints: 0 }), /at least two/);
  await assert.rejects(mergeNativeDocuments([
    { name: "one.pdf", bytes: await fixture("FIRST"), rotation: 45 },
    { name: "two.pdf", bytes: await fixture("SECOND"), rotation: 0 },
  ], { format: "original", marginPoints: 0 }), /unsupported rotation/);
});
