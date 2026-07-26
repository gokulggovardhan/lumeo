import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import { exportEditedPdf } from "../lib/pdf/edit/export.ts";
import { createShapeElement, createTextElement, createWhiteoutElement } from "../lib/pdf/edit/elements.ts";

async function makeBlankPdf(pageCount: number): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i += 1) doc.addPage([612, 792]);
  const bytes = await doc.save();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

test("exportEditedPdf returns valid PDF bytes with no elements", async () => {
  const original = await makeBlankPdf(1);
  const { bytes, skippedPages } = await exportEditedPdf(original, []);
  const reloaded = await PDFDocument.load(bytes);
  assert.equal(reloaded.getPageCount(), 1);
  assert.deepEqual(skippedPages, []);
});

test("exportEditedPdf draws a text element onto its page", async () => {
  const original = await makeBlankPdf(1);
  const element = createTextElement("t1", 0, 20, 20);
  const withText = { ...element, text: "Hello" };
  const { bytes } = await exportEditedPdf(original, [withText]);
  const reloaded = await PDFDocument.load(bytes);
  assert.equal(reloaded.getPageCount(), 1);
  // A page with real drawn text/graphics content is larger than a blank one.
  assert.ok(bytes.byteLength > original.byteLength);
});

test("exportEditedPdf draws shape and whiteout elements", async () => {
  const original = await makeBlankPdf(1);
  const rect = createShapeElement("s1", 0, 10, 10, "rect");
  const whiteout = createWhiteoutElement("w1", 0, 40, 40);
  const { bytes, skippedPages } = await exportEditedPdf(original, [rect, whiteout]);
  const reloaded = await PDFDocument.load(bytes);
  assert.equal(reloaded.getPageCount(), 1);
  assert.deepEqual(skippedPages, []);
  assert.ok(bytes.byteLength > original.byteLength);
});

test("exportEditedPdf skips a page whose index doesn't exist, without throwing", async () => {
  const original = await makeBlankPdf(1);
  const outOfRange = createTextElement("t2", 5, 10, 10);
  const withText = { ...outOfRange, text: "orphaned" };
  const { bytes, skippedPages } = await exportEditedPdf(original, [withText]);
  const reloaded = await PDFDocument.load(bytes);
  assert.equal(reloaded.getPageCount(), 1);
  assert.deepEqual(skippedPages, []); // out-of-range elements are silently skipped per-element, not counted as a page failure
});

test("exportEditedPdf ignores an empty text element (nothing to draw)", async () => {
  const original = await makeBlankPdf(1);
  const empty = createTextElement("t3", 0, 10, 10); // text: ""
  const { bytes } = await exportEditedPdf(original, [empty]);
  const reloaded = await PDFDocument.load(bytes);
  assert.equal(reloaded.getPageCount(), 1);
  assert.ok(bytes.byteLength >= original.byteLength);
});
