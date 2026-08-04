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
  setLineHeight,
  moveText,
  nextLine,
  showText,
} from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { walkTextShowOperators } from "../lib/pdf/edit/contentStream.ts";
import { resolveFont } from "../lib/pdf/edit/fontEncoding.ts";
import { resolveFontMetrics } from "../lib/pdf/edit/fontMetrics.ts";
import { buildEditPlan } from "../lib/pdf/edit/editPlan.ts";
import { applyEditPlanToDocument } from "../lib/pdf/edit/applyEditPlan.ts";

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

// Builds a real PDF whose page's content stream is BT ... ET containing,
// in order: a plain Tj ("First" -- establishes a starting line/position,
// no line move of its own), then one ' or " operator showing `text` (with
// word/char spacing for ") -- ' and " each perform their own text-line
// move (equivalent to T*) as part of showing text, so no separate T* is
// needed before them -- then a T* plus a plain Tj ("Last", which needs an
// explicit move first since Tj never moves on its own). Mirrors the
// low-level operator-builder approach already proven in
// tests/edit-content-stream.test.ts and edit-apply-plan-tj.test.ts.
async function buildQuoteFixture(kind: "'" | '"', text: string, wordSpacing = 0, charSpacing = 0): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.setFont(font);
  const fontKey = page.node.newFontDictionary(font.name, font.ref);

  const showOperator =
    kind === "'"
      ? PDFOperator.of(PDFOperatorNames.ShowTextLine, [PDFHexString.of(hexOf(text))])
      : PDFOperator.of(PDFOperatorNames.ShowTextLineAndSpace, [
          PDFNumber.of(wordSpacing),
          PDFNumber.of(charSpacing),
          PDFHexString.of(hexOf(text)),
        ]);

  page.pushOperators(
    beginText(),
    setFontAndSize(fontKey, 18),
    setLineHeight(20),
    moveText(50, 700),
    showText(PDFHexString.of(hexOf("First"))),
    showOperator,
    nextLine(),
    showText(PDFHexString.of(hexOf("Last"))),
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

async function extractPageStrings(pdfBytes: Uint8Array, pageNumber = 1): Promise<string[]> {
  const doc = await pdfjsLib.getDocument({ data: pdfBytes.slice() }).promise;
  const page = await doc.getPage(pageNumber);
  const content = await page.getTextContent();
  return content.items.map((item) => ("str" in item ? item.str : ""));
}

test("' rewrite: equal-length replacement, neighboring Tj operators untouched", async () => {
  const original = await buildQuoteFixture("'", "Middle");
  assert.deepEqual(await extractPageStrings(original), ["First", "Middle", "Last"]);

  const { plan, resolvedFont, operators } = await buildPlanForOperatorIndex(original, 1, "Center");
  assert.equal(operators.length, 3);
  assert.equal(plan.operatorType, "'");
  assert.equal(plan.editable, true);
  assert.equal(plan.originalText, "Middle");

  const editedDoc = await PDFDocument.load(original.slice());
  await applyEditPlanToDocument(editedDoc, plan, resolvedFont.bytesPerCode);
  const editedBytes = await editedDoc.save();

  const reloaded = await PDFDocument.load(editedBytes.slice());
  assert.equal(reloaded.getPageCount(), 1);
  assert.deepEqual(await extractPageStrings(editedBytes), ["First", "Center", "Last"]);
});

test("' rewrite: shorter and longer replacements both produce valid, correctly-extractable text", async () => {
  const originalShort = await buildQuoteFixture("'", "Middle line");
  const { plan: shortPlan, resolvedFont: shortFont } = await buildPlanForOperatorIndex(originalShort, 1, "Mid");
  assert.equal(shortPlan.editable, true);
  const shortDoc = await PDFDocument.load(originalShort.slice());
  await applyEditPlanToDocument(shortDoc, shortPlan, shortFont.bytesPerCode);
  assert.deepEqual(await extractPageStrings(await shortDoc.save()), ["First", "Mid", "Last"]);

  const originalLong = await buildQuoteFixture("'", "Mid");
  const { plan: longPlan, resolvedFont: longFont } = await buildPlanForOperatorIndex(originalLong, 1, "A much longer middle line");
  assert.equal(longPlan.editable, true);
  const longDoc = await PDFDocument.load(originalLong.slice());
  await applyEditPlanToDocument(longDoc, longPlan, longFont.bytesPerCode);
  assert.deepEqual(await extractPageStrings(await longDoc.save()), ["First", "A much longer middle line", "Last"]);
});

test('" rewrite: preserves its own word/char spacing operands verbatim', async () => {
  // Small, realistic spacing values -- a large character spacing (tried
  // first at 5/2) makes pdfjs's own text-extraction heuristic reinterpret
  // the wide inter-glyph gaps as word boundaries and split "Center" into
  // individual space-separated letters in its extracted str, which is a
  // property of THAT heuristic, not of what bytes were actually written
  // (independently confirmed correct below via the raw operator bytes).
  const original = await buildQuoteFixture('"', "Middle", 1, 0.3);
  const { plan, resolvedFont, operators } = await buildPlanForOperatorIndex(original, 1, "Center");
  assert.equal(plan.operatorType, '"');
  assert.equal(plan.wordSpacing, 1);
  assert.equal(plan.charSpacing, 0.3);
  assert.equal(operators[1].wordSpacing, 1);
  assert.equal(operators[1].charSpacing, 0.3);

  const editedDoc = await PDFDocument.load(original.slice());
  await applyEditPlanToDocument(editedDoc, plan, resolvedFont.bytesPerCode);
  const editedBytes = await editedDoc.save();

  assert.deepEqual(await extractPageStrings(editedBytes), ["First", "Center", "Last"]);

  const editedStreamBytes = await decodedContentStreamBytes(editedBytes.slice());
  const editedOperators = walkTextShowOperators(editedStreamBytes);
  const rewritten = editedOperators.find((op) => op.kind === '"');
  assert.ok(rewritten);
  const slice = Buffer.from(editedStreamBytes.subarray(rewritten!.start, rewritten!.end)).toString("latin1");
  // The rewritten " invocation must still carry the SAME aw/ac numbers
  // (1 and 0.3) verbatim, per spec order: aw ac string ".
  assert.match(slice, /^1 0\.3 <[0-9a-f]+> "$/);
});

test('" rewrite: shorter and longer replacements both produce valid, correctly-extractable text', async () => {
  const originalShort = await buildQuoteFixture('"', "Middle line", 3, 1);
  const { plan: shortPlan, resolvedFont: shortFont } = await buildPlanForOperatorIndex(originalShort, 1, "Mid");
  assert.equal(shortPlan.editable, true);
  const shortDoc = await PDFDocument.load(originalShort.slice());
  await applyEditPlanToDocument(shortDoc, shortPlan, shortFont.bytesPerCode);
  assert.deepEqual(await extractPageStrings(await shortDoc.save()), ["First", "Mid", "Last"]);

  const originalLong = await buildQuoteFixture('"', "Mid", 3, 1);
  const { plan: longPlan, resolvedFont: longFont } = await buildPlanForOperatorIndex(originalLong, 1, "A much longer middle line");
  assert.equal(longPlan.editable, true);
  const longDoc = await PDFDocument.load(originalLong.slice());
  await applyEditPlanToDocument(longDoc, longPlan, longFont.bytesPerCode);
  assert.deepEqual(await extractPageStrings(await longDoc.save()), ["First", "A much longer middle line", "Last"]);
});

test("mixed page with Tj, TJ, ', and \" -- editing one operator leaves every other kind untouched", async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.setFont(font);
  const fontKey = page.node.newFontDictionary(font.name, font.ref);

  const tjArray = PDFArray.withContext(doc.context);
  tjArray.push(PDFHexString.of(hexOf("TJ")));
  tjArray.push(PDFNumber.of(20));
  tjArray.push(PDFHexString.of(hexOf(" line")));

  page.pushOperators(
    beginText(),
    setFontAndSize(fontKey, 18),
    setLineHeight(20),
    moveText(50, 700),
    showText(PDFHexString.of(hexOf("Tj line"))),
    nextLine(),
    PDFOperator.of(PDFOperatorNames.ShowTextAdjusted, [tjArray]),
    // ' and " each perform their own line move as part of showing text --
    // no extra nextLine() needed before either.
    PDFOperator.of(PDFOperatorNames.ShowTextLine, [PDFHexString.of(hexOf("Quote line"))]),
    PDFOperator.of(PDFOperatorNames.ShowTextLineAndSpace, [PDFNumber.of(2), PDFNumber.of(1), PDFHexString.of(hexOf("Dquote line"))]),
    endText(),
  );
  const original = await doc.save();

  assert.deepEqual(await extractPageStrings(original), ["Tj line", "TJ line", "Quote line", "Dquote line"]);

  const streamBytes = await decodedContentStreamBytes(original.slice());
  const operators = walkTextShowOperators(streamBytes);
  assert.equal(operators.length, 4);
  assert.deepEqual(
    operators.map((op) => op.kind),
    ["Tj", "TJ", "'", '"'],
  );

  // Edit only the ' (index 2) operator.
  const loaded = await PDFDocument.load(original.slice());
  const fontDict = firstFontDict(loaded.getPages()[0].node.Resources()!, loaded.context);
  const resolvedFont = resolveFont(fontDict, loaded.context);
  const fontMetrics = resolveFontMetrics(fontDict, loaded.context, resolvedFont);
  const plan = buildEditPlan({
    pageIndex: 0,
    contentStreamIndex: 0,
    operatorIndex: 2,
    operator: operators[2],
    replacementText: "Edited quote",
    resolvedFont,
    fontMetrics,
  });
  assert.equal(plan.editable, true);

  const editedDoc = await PDFDocument.load(original.slice());
  await applyEditPlanToDocument(editedDoc, plan, resolvedFont.bytesPerCode);
  const editedBytes = await editedDoc.save();

  assert.deepEqual(await extractPageStrings(editedBytes), ["Tj line", "TJ line", "Edited quote", "Dquote line"]);
});
