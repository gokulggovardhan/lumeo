import assert from "node:assert/strict";
import test from "node:test";
import {
  PDFDocument,
  decodePDFRawStream,
  PDFRawStream,
  PDFArray,
  PDFStream,
  PDFDict,
  PDFName,
  StandardFonts,
} from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { walkTextShowOperators } from "../lib/pdf/edit/contentStream.ts";
import { resolveFont } from "../lib/pdf/edit/fontEncoding.ts";
import { resolveFontMetrics } from "../lib/pdf/edit/fontMetrics.ts";
import { buildEditPlan, type EditPlan } from "../lib/pdf/edit/editPlan.ts";
import { applyEditPlanToBytes, applyEditPlanToDocument, EditPlanRejectedError } from "../lib/pdf/edit/applyEditPlan.ts";

async function decodedContentStreamBytes(pdfBytes: Uint8Array): Promise<Uint8Array> {
  const loaded = await PDFDocument.load(pdfBytes);
  const page = loaded.getPages()[0];
  const contents = page.node.Contents();
  const streams: PDFStream[] =
    contents instanceof PDFArray
      ? Array.from({ length: contents.size() }, (_unused, i) => loaded.context.lookup(contents.get(i), PDFStream))
      : [contents as PDFStream];
  const parts = streams.map((stream) => {
    if (!(stream instanceof PDFRawStream)) throw new Error("Expected a raw content stream.");
    return decodePDFRawStream(stream).decode();
  });
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    combined.set(part, offset);
    offset += part.length;
  }
  return combined;
}

function firstFontDict(pageResources: PDFDict, context: import("pdf-lib").PDFContext): PDFDict {
  const fontResources = pageResources.lookup(PDFName.of("Font"), PDFDict);
  return context.lookup(fontResources.get(fontResources.keys()[0]), PDFDict);
}

async function buildPlanForSoleTjOperator(pdfBytes: Uint8Array, replacementText: string) {
  const loaded = await PDFDocument.load(pdfBytes.slice());
  const page = loaded.getPages()[0];
  const fontDict = firstFontDict(page.node.Resources()!, loaded.context);
  const resolvedFont = resolveFont(fontDict, loaded.context);
  const fontMetrics = resolveFontMetrics(fontDict, loaded.context, resolvedFont);

  const streamBytes = await decodedContentStreamBytes(pdfBytes.slice());
  const operators = walkTextShowOperators(streamBytes);
  assert.equal(operators.length, 1, "fixture must have exactly one text-show operator");

  const plan = buildEditPlan({
    pageIndex: 0,
    contentStreamIndex: 0,
    operatorIndex: 0,
    operator: operators[0],
    replacementText,
    resolvedFont,
    fontMetrics,
  });
  return { plan, resolvedFont };
}

async function extractPageText(pdfBytes: Uint8Array, pageNumber = 1): Promise<string> {
  const doc = await pdfjsLib.getDocument({ data: pdfBytes.slice() }).promise;
  const page = await doc.getPage(pageNumber);
  const content = await page.getTextContent();
  return content.items.map((item) => ("str" in item ? item.str : "")).join("");
}

test("applyEditPlanToDocument: equal-length replacement produces a real, reopenable PDF with the new text", async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText("Hello", { x: 50, y: 700, size: 18, font });
  const original = await doc.save();

  const { plan, resolvedFont } = await buildPlanForSoleTjOperator(original, "World"); // same length
  assert.equal(plan.editable, true);

  const editedDoc = await PDFDocument.load(original.slice());
  await applyEditPlanToDocument(editedDoc, plan, resolvedFont.bytesPerCode);
  const editedBytes = await editedDoc.save();

  // Re-opens cleanly via pdf-lib (a real, structurally valid PDF).
  const reloaded = await PDFDocument.load(editedBytes.slice());
  assert.equal(reloaded.getPageCount(), 1);

  // Re-opens and re-extracts cleanly via real pdfjs too, with the new text.
  const text = await extractPageText(editedBytes);
  assert.equal(text, "World");
});

test("applyEditPlanToDocument: shorter replacement still produces valid, correctly-extractable text", async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText("Hello", { x: 50, y: 700, size: 18, font });
  const original = await doc.save();

  const { plan, resolvedFont } = await buildPlanForSoleTjOperator(original, "Hi");
  assert.equal(plan.editable, true);
  assert.ok(plan.replacementWidthPt < plan.originalWidthPt);

  const editedDoc = await PDFDocument.load(original.slice());
  await applyEditPlanToDocument(editedDoc, plan, resolvedFont.bytesPerCode);
  const editedBytes = await editedDoc.save();

  const text = await extractPageText(editedBytes);
  assert.equal(text, "Hi");
});

test("applyEditPlanToDocument: longer replacement still produces valid, correctly-extractable text", async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText("Hi", { x: 50, y: 700, size: 18, font });
  const original = await doc.save();

  const { plan, resolvedFont } = await buildPlanForSoleTjOperator(original, "Hello there");
  assert.equal(plan.editable, true);
  assert.ok(plan.replacementWidthPt > plan.originalWidthPt);

  const editedDoc = await PDFDocument.load(original.slice());
  await applyEditPlanToDocument(editedDoc, plan, resolvedFont.bytesPerCode);
  const editedBytes = await editedDoc.save();

  const text = await extractPageText(editedBytes);
  assert.equal(text, "Hello there");
});

test("applyEditPlanToDocument: original layout is unchanged except the edited run -- other text and page geometry survive byte-for-byte-equivalent", async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText("First line", { x: 50, y: 700, size: 18, font });
  page.drawText("Second line", { x: 50, y: 650, size: 18, font });
  page.drawText("Third line", { x: 50, y: 600, size: 18, font });
  const original = await doc.save();

  // Edit only the SECOND operator (index 1) -- confirmed against the real
  // parsed operator list, not assumed.
  const loaded = await PDFDocument.load(original.slice());
  const loadedPage = loaded.getPages()[0];
  const fontDict = firstFontDict(loadedPage.node.Resources()!, loaded.context);
  const resolvedFont = resolveFont(fontDict, loaded.context);
  const fontMetrics = resolveFontMetrics(fontDict, loaded.context, resolvedFont);
  const streamBytes = await decodedContentStreamBytes(original.slice());
  const operators = walkTextShowOperators(streamBytes);
  assert.equal(operators.length, 3);

  const plan = buildEditPlan({
    pageIndex: 0,
    contentStreamIndex: 0,
    operatorIndex: 1,
    operator: operators[1],
    replacementText: "Middle line",
    resolvedFont,
    fontMetrics,
  });
  assert.equal(plan.editable, true);

  const editedDoc = await PDFDocument.load(original.slice());
  await applyEditPlanToDocument(editedDoc, plan, resolvedFont.bytesPerCode);
  const editedBytes = await editedDoc.save();

  // pdfjs reports items in document order -- first and third lines must be
  // completely untouched, and page dimensions must be identical.
  const editedDoc2 = await pdfjsLib.getDocument({ data: editedBytes.slice() }).promise;
  const editedPage = await editedDoc2.getPage(1);
  const editedContent = await editedPage.getTextContent();
  const strs = editedContent.items.map((item) => ("str" in item ? item.str : ""));
  assert.deepEqual(strs, ["First line", "Middle line", "Third line"]);

  const originalDoc2 = await pdfjsLib.getDocument({ data: original.slice() }).promise;
  const originalPage = await originalDoc2.getPage(1);
  const originalViewport = originalPage.getViewport({ scale: 1 });
  const editedViewport = editedPage.getViewport({ scale: 1 });
  assert.equal(editedViewport.width, originalViewport.width);
  assert.equal(editedViewport.height, originalViewport.height);
});

test("applyEditPlanToBytes rejects a plan whose editable flag is false (invalid-glyph rejection is enforced, not silently attempted)", () => {
  const notEditablePlan: EditPlan = {
    pageIndex: 0,
    contentStreamIndex: 0,
    operatorIndex: 0,
    operatorType: "Tj",
    fontResourceName: "F1",
    fontSizePt: 12,
    originalText: "A",
    replacementText: "Z",
    originalGlyphCodes: [65],
    replacementGlyphCodes: [],
    originalWidthPt: 0,
    replacementWidthPt: 0,
    tjSpacingDelta: 0,
    byteOffset: 0,
    byteLength: 10,
    editable: false,
    reason: "Character \"Z\" cannot be encoded in this font at all.",
  };

  assert.throws(
    () => applyEditPlanToBytes(new Uint8Array(20), notEditablePlan, 1),
    (error: unknown) => error instanceof EditPlanRejectedError && /cannot be encoded/.test((error as Error).message),
  );
});

test("applyEditPlanToBytes rejects a subset-font requires-fallback plan the same way", () => {
  const subsetRejectedPlan: EditPlan = {
    pageIndex: 0,
    contentStreamIndex: 0,
    operatorIndex: 0,
    operatorType: "Tj",
    fontResourceName: "F1",
    fontSizePt: 12,
    originalText: "A",
    replacementText: "A",
    originalGlyphCodes: [65],
    replacementGlyphCodes: [],
    originalWidthPt: 0,
    replacementWidthPt: 0,
    tjSpacingDelta: 0,
    byteOffset: 0,
    byteLength: 10,
    editable: false,
    reason: "Character \"A\" is not a verified glyph in this font (would need a fallback font, which this planner does not implement).",
  };

  assert.throws(
    () => applyEditPlanToBytes(new Uint8Array(20), subsetRejectedPlan, 1),
    (error: unknown) => error instanceof EditPlanRejectedError && /fallback font/.test((error as Error).message),
  );
});

test("applyEditPlanToBytes rejects a TJ-targeting plan -- TJ rewriting is explicitly out of scope for this slice", () => {
  const tjPlan: EditPlan = {
    pageIndex: 0,
    contentStreamIndex: 0,
    operatorIndex: 0,
    operatorType: "TJ",
    fontResourceName: "F1",
    fontSizePt: 12,
    originalText: "AB",
    replacementText: "AB",
    originalGlyphCodes: [65, 66],
    replacementGlyphCodes: [65, 66],
    originalWidthPt: 10,
    replacementWidthPt: 10,
    tjSpacingDelta: 0,
    byteOffset: 0,
    byteLength: 10,
    editable: true,
    reason: null,
  };

  assert.throws(
    () => applyEditPlanToBytes(new Uint8Array(20), tjPlan, 1),
    (error: unknown) => error instanceof EditPlanRejectedError && /only supports Tj/.test((error as Error).message),
  );
});

test("applyEditPlanToBytes replaces exactly the operator's byte range and nothing else", () => {
  const streamText = "q\nBT\n/F1 12 Tf\n1 0 0 1 50 700 Tm\n<41> Tj\nET\nQ";
  const bytes = new TextEncoder().encode(streamText);
  const start = streamText.indexOf("<41> Tj");
  const end = start + "<41> Tj".length;

  const plan: EditPlan = {
    pageIndex: 0,
    contentStreamIndex: 0,
    operatorIndex: 0,
    operatorType: "Tj",
    fontResourceName: "F1",
    fontSizePt: 12,
    originalText: "A",
    replacementText: "B",
    originalGlyphCodes: [0x41],
    replacementGlyphCodes: [0x42],
    originalWidthPt: 0,
    replacementWidthPt: 0,
    tjSpacingDelta: 0,
    byteOffset: start,
    byteLength: end - start,
    editable: true,
    reason: null,
  };

  const result = applyEditPlanToBytes(bytes, plan, 1);
  const resultText = new TextDecoder().decode(result);
  assert.equal(resultText, "q\nBT\n/F1 12 Tf\n1 0 0 1 50 700 Tm\n<42> Tj\nET\nQ");
});
