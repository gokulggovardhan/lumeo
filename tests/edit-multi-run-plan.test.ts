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
import { buildMultiRunEditPlan } from "../lib/pdf/edit/multiRunEditPlan.ts";
import { applyMultiRunEditPlanToDocument } from "../lib/pdf/edit/applyEditPlan.ts";

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

async function extractPageStrings(pdfBytes: Uint8Array, pageNumber = 1): Promise<string[]> {
  const doc = await pdfjsLib.getDocument({ data: pdfBytes.slice() }).promise;
  const page = await doc.getPage(pageNumber);
  const content = await page.getTextContent();
  return content.items.map((item) => ("str" in item ? item.str : "")).filter((str) => str.length > 0);
}

// Builds a real PDF whose page content stream shows each of `lines` as its
// own operator, one per line (moveText once, then nextLine() before every
// line after the first -- except a line whose `kind` is ' or ", which
// performs its own line move as part of showing text). Mirrors the
// low-level operator-builder approach already proven in earlier PRs'
// content-stream tests.
async function buildMultiOperatorFixture(
  lines: Array<{ text: string; kind: "Tj" | "TJ" | "'" | '"'; wordSpacing?: number; charSpacing?: number }>,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.setFont(font);
  const fontKey = page.node.newFontDictionary(font.name, font.ref);

  const ops = [beginText(), setFontAndSize(fontKey, 18), setLineHeight(20), moveText(50, 700)];
  lines.forEach((line, index) => {
    if (line.kind === "Tj") {
      if (index > 0) ops.push(nextLine());
      ops.push(showText(PDFHexString.of(hexOf(line.text))));
    } else if (line.kind === "TJ") {
      if (index > 0) ops.push(nextLine());
      const array = PDFArray.withContext(doc.context);
      array.push(PDFHexString.of(hexOf(line.text)));
      ops.push(PDFOperator.of(PDFOperatorNames.ShowTextAdjusted, [array]));
    } else if (line.kind === "'") {
      // ' performs its own line move -- no explicit nextLine() needed,
      // even for index 0 (it moves down from wherever moveText left Tm).
      ops.push(PDFOperator.of(PDFOperatorNames.ShowTextLine, [PDFHexString.of(hexOf(line.text))]));
    } else {
      ops.push(
        PDFOperator.of(PDFOperatorNames.ShowTextLineAndSpace, [
          PDFNumber.of(line.wordSpacing ?? 0),
          PDFNumber.of(line.charSpacing ?? 0),
          PDFHexString.of(hexOf(line.text)),
        ]),
      );
    }
  });
  ops.push(endText());

  page.pushOperators(...ops);
  return doc.save();
}

async function buildMultiRunPlanForIndices(pdfBytes: Uint8Array, operatorIndices: number[], replacementText: string) {
  const loaded = await PDFDocument.load(pdfBytes.slice());
  const page = loaded.getPages()[0];
  const fontDict = firstFontDict(page.node.Resources()!, loaded.context);
  const resolvedFont = resolveFont(fontDict, loaded.context);
  const fontMetrics = resolveFontMetrics(fontDict, loaded.context, resolvedFont);

  const streamBytes = await decodedContentStreamBytes(pdfBytes.slice());
  const allOperators = walkTextShowOperators(streamBytes);

  const plan = buildMultiRunEditPlan({
    pageIndex: 0,
    contentStreamIndex: 0,
    allOperators,
    operatorIndices,
    replacementText,
    resolvedFont,
    fontMetrics,
  });
  return { plan, resolvedFont, allOperators };
}

test("multi-run: two consecutive Tj operators merge into one replacement, neighbors untouched", async () => {
  const original = await buildMultiOperatorFixture([
    { text: "First", kind: "Tj" },
    { text: "Middle one", kind: "Tj" },
    { text: "Middle two", kind: "Tj" },
    { text: "Last", kind: "Tj" },
  ]);
  assert.deepEqual(await extractPageStrings(original), ["First", "Middle one", "Middle two", "Last"]);

  const { plan, resolvedFont } = await buildMultiRunPlanForIndices(original, [1, 2], "Combined middle");
  assert.equal(plan.editable, true);
  assert.equal(plan.originalText, "Middle oneMiddle two");
  assert.equal(plan.subPlans.length, 2);

  const editedDoc = await PDFDocument.load(original.slice());
  await applyMultiRunEditPlanToDocument(editedDoc, plan, resolvedFont.bytesPerCode);
  const editedBytes = await editedDoc.save();

  const reloaded = await PDFDocument.load(editedBytes.slice());
  assert.equal(reloaded.getPageCount(), 1);
  assert.deepEqual(await extractPageStrings(editedBytes), ["First", "Combined middle", "Last"]);
});

test("multi-run: two consecutive TJ operators merge into one replacement", async () => {
  const original = await buildMultiOperatorFixture([
    { text: "First", kind: "Tj" },
    { text: "Alpha", kind: "TJ" },
    { text: "Beta", kind: "TJ" },
    { text: "Last", kind: "Tj" },
  ]);

  const { plan, resolvedFont } = await buildMultiRunPlanForIndices(original, [1, 2], "Gamma");
  assert.equal(plan.editable, true);
  assert.equal(plan.originalText, "AlphaBeta");

  const editedDoc = await PDFDocument.load(original.slice());
  await applyMultiRunEditPlanToDocument(editedDoc, plan, resolvedFont.bytesPerCode);
  const editedBytes = await editedDoc.save();

  assert.deepEqual(await extractPageStrings(editedBytes), ["First", "Gamma", "Last"]);
});

test("multi-run: a Tj followed by a TJ merge into one replacement", async () => {
  const original = await buildMultiOperatorFixture([
    { text: "First", kind: "Tj" },
    { text: "PlainPart", kind: "Tj" },
    { text: "AdjustedPart", kind: "TJ" },
    { text: "Last", kind: "Tj" },
  ]);

  const { plan, resolvedFont } = await buildMultiRunPlanForIndices(original, [1, 2], "Merged text");
  assert.equal(plan.editable, true);
  assert.equal(plan.originalText, "PlainPartAdjustedPart");

  const editedDoc = await PDFDocument.load(original.slice());
  await applyMultiRunEditPlanToDocument(editedDoc, plan, resolvedFont.bytesPerCode);
  const editedBytes = await editedDoc.save();

  assert.deepEqual(await extractPageStrings(editedBytes), ["First", "Merged text", "Last"]);
});

test("multi-run: a TJ followed by a ' merge into one replacement, the quote's own line move is preserved", async () => {
  const original = await buildMultiOperatorFixture([
    { text: "First", kind: "Tj" },
    { text: "TjPart", kind: "TJ" },
    { text: "QuotePart", kind: "'" },
    { text: "Last", kind: "Tj" },
  ]);
  assert.deepEqual(await extractPageStrings(original), ["First", "TjPart", "QuotePart", "Last"]);

  const { plan, resolvedFont, allOperators } = await buildMultiRunPlanForIndices(original, [1, 2], "One merged line");
  assert.equal(allOperators.length, 4);
  assert.equal(plan.editable, true);
  assert.equal(plan.originalText, "TjPartQuotePart");

  const editedDoc = await PDFDocument.load(original.slice());
  await applyMultiRunEditPlanToDocument(editedDoc, plan, resolvedFont.bytesPerCode);
  const editedBytes = await editedDoc.save();

  // "Last" must still be on its OWN line, at its original position --
  // proving the emptied ' operator's own line move (which the merge
  // deliberately keeps) still ran, even though it shows no text anymore.
  assert.deepEqual(await extractPageStrings(editedBytes), ["First", "One merged line", "Last"]);

  const editedDoc2 = await pdfjsLib.getDocument({ data: editedBytes.slice() }).promise;
  const editedPage = await editedDoc2.getPage(1);
  const editedContent = await editedPage.getTextContent();
  const lastItem = editedContent.items.find((item) => "str" in item && item.str === "Last") as { transform: number[] } | undefined;
  assert.ok(lastItem);

  const originalDoc2 = await pdfjsLib.getDocument({ data: original.slice() }).promise;
  const originalPage = await originalDoc2.getPage(1);
  const originalContent = await originalPage.getTextContent();
  const originalLastItem = originalContent.items.find((item) => "str" in item && item.str === "Last") as
    | { transform: number[] }
    | undefined;
  assert.ok(originalLastItem);
  assert.equal(lastItem!.transform[5], originalLastItem!.transform[5]);
});

test("multi-run: shorter replacement produces valid, correctly-extractable text", async () => {
  const original = await buildMultiOperatorFixture([
    { text: "First", kind: "Tj" },
    { text: "A much longer piece of text", kind: "Tj" },
    { text: "and even more text here", kind: "Tj" },
    { text: "Last", kind: "Tj" },
  ]);

  const { plan, resolvedFont } = await buildMultiRunPlanForIndices(original, [1, 2], "Short");
  assert.equal(plan.editable, true);
  assert.ok(plan.subPlans[0].replacementWidthPt < plan.subPlans[0].originalWidthPt);

  const editedDoc = await PDFDocument.load(original.slice());
  await applyMultiRunEditPlanToDocument(editedDoc, plan, resolvedFont.bytesPerCode);
  const editedBytes = await editedDoc.save();

  assert.deepEqual(await extractPageStrings(editedBytes), ["First", "Short", "Last"]);
});

test("multi-run: longer replacement produces valid, correctly-extractable text", async () => {
  const original = await buildMultiOperatorFixture([
    { text: "First", kind: "Tj" },
    { text: "Sm", kind: "Tj" },
    { text: "all", kind: "Tj" },
    { text: "Last", kind: "Tj" },
  ]);

  const { plan, resolvedFont } = await buildMultiRunPlanForIndices(original, [1, 2], "A dramatically longer replacement string");
  assert.equal(plan.editable, true);
  assert.ok(plan.subPlans[0].replacementWidthPt > plan.subPlans[0].originalWidthPt);

  const editedDoc = await PDFDocument.load(original.slice());
  await applyMultiRunEditPlanToDocument(editedDoc, plan, resolvedFont.bytesPerCode);
  const editedBytes = await editedDoc.save();

  assert.deepEqual(await extractPageStrings(editedBytes), ["First", "A dramatically longer replacement string", "Last"]);
});

test("multi-run: partial selection (a middle span of a longer document) leaves everything outside the span untouched", async () => {
  const original = await buildMultiOperatorFixture([
    { text: "Line one", kind: "Tj" },
    { text: "Line two", kind: "Tj" },
    { text: "Span part A", kind: "Tj" },
    { text: "Span part B", kind: "TJ" },
    { text: "Line five", kind: "Tj" },
    { text: "Line six", kind: "Tj" },
  ]);
  assert.deepEqual(await extractPageStrings(original), [
    "Line one",
    "Line two",
    "Span part A",
    "Span part B",
    "Line five",
    "Line six",
  ]);

  // Only operators 2 and 3 (of 6) are selected -- a proper subset.
  const { plan, resolvedFont } = await buildMultiRunPlanForIndices(original, [2, 3], "Replaced span");
  assert.equal(plan.editable, true);

  const editedDoc = await PDFDocument.load(original.slice());
  await applyMultiRunEditPlanToDocument(editedDoc, plan, resolvedFont.bytesPerCode);
  const editedBytes = await editedDoc.save();

  assert.deepEqual(await extractPageStrings(editedBytes), [
    "Line one",
    "Line two",
    "Replaced span",
    "Line five",
    "Line six",
  ]);
});

test("multi-run: rejects a discontinuous selection honestly, without guessing at a merge", async () => {
  const original = await buildMultiOperatorFixture([
    { text: "First", kind: "Tj" },
    { text: "Skip me", kind: "Tj" },
    { text: "Second", kind: "Tj" },
  ]);

  // Indices 0 and 2 skip operator 1 -- discontinuous.
  const { plan } = await buildMultiRunPlanForIndices(original, [0, 2], "Should not apply");
  assert.equal(plan.editable, false);
  assert.match(plan.reason ?? "", /discontinuous/);
});

test("multi-run: rejects a single-operator selection (use buildEditPlan instead)", async () => {
  const original = await buildMultiOperatorFixture([
    { text: "Only", kind: "Tj" },
  ]);
  const { plan } = await buildMultiRunPlanForIndices(original, [0], "Replacement");
  assert.equal(plan.editable, false);
  assert.match(plan.reason ?? "", /at least two operators/);
});
