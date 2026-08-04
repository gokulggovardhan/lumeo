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
  PDFNumber,
  PDFHexString,
  PDFOperator,
  PDFOperatorNames,
  StandardFonts,
  beginText,
  endText,
  setFontAndSize,
  moveText,
} from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { walkTextShowOperators } from "../lib/pdf/edit/contentStream.ts";
import { resolveFont } from "../lib/pdf/edit/fontEncoding.ts";
import { resolveFontMetrics } from "../lib/pdf/edit/fontMetrics.ts";
import { buildEditPlan } from "../lib/pdf/edit/editPlan.ts";
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

function hexOf(text: string): string {
  return Buffer.from(text, "ascii").toString("hex");
}

// Builds a real PDF whose page's content stream is exactly one TJ
// operator with the given [string | number] array entries, using
// pdf-lib's own low-level operator builders (not hand-written PDF text)
// -- the same approach already proven in tests/edit-content-stream.test.ts.
async function buildTjFixture(entries: Array<string | number>): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.setFont(font);
  const fontKey = page.node.newFontDictionary(font.name, font.ref);

  const tjArray = PDFArray.withContext(doc.context);
  for (const entry of entries) {
    tjArray.push(typeof entry === "string" ? PDFHexString.of(hexOf(entry)) : PDFNumber.of(entry));
  }

  page.pushOperators(
    beginText(),
    setFontAndSize(fontKey, 18),
    moveText(50, 700),
    PDFOperator.of(PDFOperatorNames.ShowTextAdjusted, [tjArray]),
    endText(),
  );

  return doc.save();
}

async function buildPlanForOperatorIndex(pdfBytes: Uint8Array, operatorIndex: number, replacementText: string) {
  const loaded = await PDFDocument.load(pdfBytes.slice());
  const page = loaded.getPages()[0];
  const fontDict = firstFontDict(page.node.Resources()!, loaded.context);
  const resolvedFont = resolveFont(fontDict, loaded.context);
  const fontMetrics = resolveFontMetrics(fontDict, loaded.context, resolvedFont);

  const streamBytes = await decodedContentStreamBytes(pdfBytes.slice());
  const operators = walkTextShowOperators(streamBytes);

  const plan = buildEditPlan({
    pageIndex: 0,
    contentStreamIndex: 0,
    operatorIndex,
    operator: operators[operatorIndex],
    replacementText,
    resolvedFont,
    fontMetrics,
  });
  return { plan, resolvedFont, operators, streamBytes };
}

async function extractPageText(pdfBytes: Uint8Array, pageNumber = 1): Promise<string> {
  const doc = await pdfjsLib.getDocument({ data: pdfBytes.slice() }).promise;
  const page = await doc.getPage(pageNumber);
  const content = await page.getTextContent();
  return content.items.map((item) => ("str" in item ? item.str : "")).join("");
}

test("TJ rewrite: equal-length replacement produces a clean array with no stray adjustment number", async () => {
  // A genuinely equal-WIDTH replacement, not just equal character count --
  // "BA" is the exact same two glyphs as "AB", so their real AFM widths
  // are trivially identical regardless of what those widths actually are.
  const original = await buildTjFixture(["AB"]);
  const { plan, resolvedFont } = await buildPlanForOperatorIndex(original, 0, "BA");
  assert.equal(plan.editable, true);
  assert.equal(plan.operatorType, "TJ");
  assert.equal(plan.originalWidthPt, plan.replacementWidthPt);

  const editedDoc = await PDFDocument.load(original.slice());
  await applyEditPlanToDocument(editedDoc, plan, resolvedFont.bytesPerCode);
  const editedBytes = await editedDoc.save();

  const text = await extractPageText(editedBytes);
  assert.equal(text, "BA");

  const editedStreamBytes = await decodedContentStreamBytes(editedBytes.slice());
  const editedOperators = walkTextShowOperators(editedStreamBytes);
  assert.equal(editedOperators.length, 1);
  // Equal width -> negligible delta -> no adjustment number in the array.
  const slice = Buffer.from(editedStreamBytes.subarray(editedOperators[0].start, editedOperators[0].end)).toString("latin1");
  assert.match(slice, /^\[<[0-9a-f]+>\] TJ$/);
});

test("TJ rewrite: shorter replacement inserts a compensating adjustment", async () => {
  const original = await buildTjFixture(["Hello there"]);
  const { plan, resolvedFont } = await buildPlanForOperatorIndex(original, 0, "Hi");
  assert.equal(plan.editable, true);
  assert.ok(plan.replacementWidthPt < plan.originalWidthPt);

  const editedDoc = await PDFDocument.load(original.slice());
  await applyEditPlanToDocument(editedDoc, plan, resolvedFont.bytesPerCode);
  const editedBytes = await editedDoc.save();

  assert.equal(await extractPageText(editedBytes), "Hi");

  const editedStreamBytes = await decodedContentStreamBytes(editedBytes.slice());
  const editedOperators = walkTextShowOperators(editedStreamBytes);
  const slice = Buffer.from(editedStreamBytes.subarray(editedOperators[0].start, editedOperators[0].end)).toString("latin1");
  assert.match(slice, /^\[<[0-9a-f]+> -?[\d.]+\] TJ$/);
});

test("TJ rewrite: longer replacement inserts a compensating adjustment", async () => {
  const original = await buildTjFixture(["Hi"]);
  const { plan, resolvedFont } = await buildPlanForOperatorIndex(original, 0, "Hello there");
  assert.equal(plan.editable, true);
  assert.ok(plan.replacementWidthPt > plan.originalWidthPt);

  const editedDoc = await PDFDocument.load(original.slice());
  await applyEditPlanToDocument(editedDoc, plan, resolvedFont.bytesPerCode);
  const editedBytes = await editedDoc.save();

  assert.equal(await extractPageText(editedBytes), "Hello there");
});

test("TJ rewrite: original TJ with a positive kerning number is replaced cleanly (old number dropped, not duplicated)", async () => {
  // Positive TJ numbers tighten the gap (per spec, subtracted from
  // position) -- a real, common kerning pattern.
  const original = await buildTjFixture(["Fi", 50, "re"]); // "Fire" with tightened "Fi|re" kerning
  const originalText = await extractPageText(original);
  assert.equal(originalText, "Fire");

  const { plan, resolvedFont } = await buildPlanForOperatorIndex(original, 0, "Fire!");
  assert.equal(plan.editable, true);
  assert.equal(plan.originalText, "Fire");

  const editedDoc = await PDFDocument.load(original.slice());
  await applyEditPlanToDocument(editedDoc, plan, resolvedFont.bytesPerCode);
  const editedBytes = await editedDoc.save();

  assert.equal(await extractPageText(editedBytes), "Fire!");

  const editedStreamBytes = await decodedContentStreamBytes(editedBytes.slice());
  const editedOperators = walkTextShowOperators(editedStreamBytes);
  assert.equal(editedOperators.length, 1);
  // Exactly one string, one (or zero) numeric adjustment -- the original
  // kerning number (50) between "Fi" and "re" is gone, not left dangling
  // alongside a new one. Match only OUTSIDE the <...> hex string, since
  // hex digits themselves can contain plain digit characters.
  const slice = Buffer.from(editedStreamBytes.subarray(editedOperators[0].start, editedOperators[0].end)).toString("latin1");
  const numberMatch = /^\[<[0-9a-f]+>(?: (-?[\d.]+))?\] TJ$/.exec(slice);
  assert.ok(numberMatch, `expected a well-formed single-string TJ array, got: ${slice}`);
  const numberCount = numberMatch && numberMatch[1] !== undefined ? 1 : 0;
  assert.ok(numberCount <= 1, `expected at most one numeric operand, got: ${slice}`);
});

test("TJ rewrite: original TJ with a negative kerning number is replaced cleanly", async () => {
  // Negative TJ numbers widen the gap.
  const original = await buildTjFixture(["A", -80, "B"]);
  const originalText = await extractPageText(original);
  assert.equal(originalText, "AB");

  const { plan, resolvedFont } = await buildPlanForOperatorIndex(original, 0, "XY");
  assert.equal(plan.editable, true);

  const editedDoc = await PDFDocument.load(original.slice());
  await applyEditPlanToDocument(editedDoc, plan, resolvedFont.bytesPerCode);
  const editedBytes = await editedDoc.save();

  assert.equal(await extractPageText(editedBytes), "XY");
});

test("TJ rewrite: a mixed multi-string/multi-number array flattens correctly into one replacement", async () => {
  const original = await buildTjFixture(["A", 20, "B", -30, "C", 10, "D"]);
  const { plan, resolvedFont } = await buildPlanForOperatorIndex(original, 0, "WXYZ");
  assert.equal(plan.editable, true);
  assert.equal(plan.originalText, "ABCD");
  assert.equal(plan.originalGlyphCodes.length, 4);
  assert.equal(plan.replacementGlyphCodes.length, 4);

  const editedDoc = await PDFDocument.load(original.slice());
  await applyEditPlanToDocument(editedDoc, plan, resolvedFont.bytesPerCode);
  const editedBytes = await editedDoc.save();

  assert.equal(await extractPageText(editedBytes), "WXYZ");
});

test("TJ rewrite: editing one of several TJ operators leaves the others completely untouched", async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.setFont(font);
  const fontKey = page.node.newFontDictionary(font.name, font.ref);

  function tjOperators(y: number, entries: Array<string | number>) {
    const array = PDFArray.withContext(doc.context);
    for (const entry of entries) array.push(typeof entry === "string" ? PDFHexString.of(hexOf(entry)) : PDFNumber.of(entry));
    return [
      beginText(),
      setFontAndSize(fontKey, 18),
      moveText(50, y),
      PDFOperator.of(PDFOperatorNames.ShowTextAdjusted, [array]),
      endText(),
    ];
  }

  page.pushOperators(...tjOperators(700, ["First", 30, " line"]));
  page.pushOperators(...tjOperators(650, ["Second", -20, " line"]));
  page.pushOperators(...tjOperators(600, ["Third", 10, " line"]));
  const original = await doc.save();

  const { plan, resolvedFont, operators } = await buildPlanForOperatorIndex(original, 1, "Middle line");
  assert.equal(operators.length, 3);
  assert.equal(plan.editable, true);

  const editedDoc = await PDFDocument.load(original.slice());
  await applyEditPlanToDocument(editedDoc, plan, resolvedFont.bytesPerCode);
  const editedBytes = await editedDoc.save();

  // Save + reload, then extract via real pdfjs -- confirms structural
  // validity and that only the targeted operator's text changed.
  const reloaded = await PDFDocument.load(editedBytes.slice());
  assert.equal(reloaded.getPageCount(), 1);

  const editedDoc2 = await pdfjsLib.getDocument({ data: editedBytes.slice() }).promise;
  const editedPage = await editedDoc2.getPage(1);
  const editedContent = await editedPage.getTextContent();
  const strs = editedContent.items.map((item) => ("str" in item ? item.str : ""));
  assert.deepEqual(strs, ["First line", "Middle line", "Third line"]);
});

test("applyEditPlanToBytes rejects an attempt to replace a TJ run with empty text", async () => {
  const original = await buildTjFixture(["Hello"]);
  const { plan, resolvedFont } = await buildPlanForOperatorIndex(original, 0, "");
  // editPlan.ts still marks this editable (an empty replacement has no
  // unsupported characters) -- applyEditPlan's own invariant check must
  // catch it independently.
  assert.equal(plan.editable, true);
  assert.equal(plan.replacementGlyphCodes.length, 0);

  const streamBytes = await decodedContentStreamBytes(original.slice());
  assert.throws(
    () => applyEditPlanToBytes(streamBytes, plan, resolvedFont.bytesPerCode),
    (error: unknown) => error instanceof EditPlanRejectedError && /empty text/.test((error as Error).message),
  );
});
