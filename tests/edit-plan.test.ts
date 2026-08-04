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
import { walkTextShowOperators, type TextShowOperator } from "../lib/pdf/edit/contentStream.ts";
import { resolveFont, type ResolvedFont } from "../lib/pdf/edit/fontEncoding.ts";
import { resolveFontMetrics, type FontMetrics } from "../lib/pdf/edit/fontMetrics.ts";
import { buildEditPlan } from "../lib/pdf/edit/editPlan.ts";

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

// A deterministic, hand-built (not real-font-derived) ResolvedFont +
// FontMetrics pair, matching the exact fixture already proven correct in
// tests/edit-font-metrics.test.ts -- reused here so editPlan.ts's own
// branch logic is tested in isolation from font-resolution concerns
// already covered by that file.
function fixedWidthsFont(): { resolvedFont: ResolvedFont; fontMetrics: FontMetrics } {
  const glyphCodeToUnicode = new Map([
    [65, "A"],
    [66, "B"],
    [67, "C"],
  ]);
  const unicodeToGlyphCode = new Map([
    ["A", 65],
    ["B", 66],
    ["C", 67],
  ]);
  const resolvedFont: ResolvedFont = {
    kind: "Type1",
    baseFont: "CustomFont",
    isEmbedded: false,
    isSubset: false,
    bytesPerCode: 1,
    encodingSource: "WinAnsi",
    glyphCodeToUnicode,
    unicodeToGlyphCode,
  };
  const fontMetrics: FontMetrics = {
    bytesPerCode: 1,
    defaultWidth: 0,
    glyphWidths: new Map([
      [65, 700],
      [66, 720],
      [67, 600],
    ]),
    source: "Widths",
  };
  return { resolvedFont, fontMetrics };
}

function fixedOperator(overrides: Partial<TextShowOperator> = {}): TextShowOperator {
  return {
    kind: "Tj",
    start: 100,
    end: 130,
    strings: [Uint8Array.from([65])], // "A"
    fontResourceName: "F1",
    fontSizePt: 10,
    textRenderingMatrix: [10, 0, 0, 10, 50, 700],
    charSpacing: 0,
    wordSpacing: 0,
    horizontalScalingPct: 100,
    leading: 0,
    textRise: 0,
    renderMode: 0,
    ...overrides,
  };
}

test("buildEditPlan: equal-length replacement (same glyph, no width change)", () => {
  const { resolvedFont, fontMetrics } = fixedWidthsFont();
  const operator = fixedOperator({ strings: [Uint8Array.from([65])] }); // "A"

  const plan = buildEditPlan({
    pageIndex: 0,
    contentStreamIndex: 0,
    operatorIndex: 0,
    operator,
    replacementText: "A",
    resolvedFont,
    fontMetrics,
  });

  assert.equal(plan.editable, true);
  assert.equal(plan.reason, null);
  assert.equal(plan.originalText, "A");
  assert.deepEqual(plan.originalGlyphCodes, [65]);
  assert.deepEqual(plan.replacementGlyphCodes, [65]);
  assert.equal(plan.originalWidthPt, 7); // 700/1000 * 10pt
  assert.equal(plan.replacementWidthPt, 7);
  assert.equal(plan.tjSpacingDelta, 0);
  assert.equal(plan.byteOffset, 100);
  assert.equal(plan.byteLength, 30);
});

test("buildEditPlan: shorter replacement (narrower glyph)", () => {
  const { resolvedFont, fontMetrics } = fixedWidthsFont();
  const operator = fixedOperator({ strings: [Uint8Array.from([65])] }); // "A" (700 units)

  const plan = buildEditPlan({
    pageIndex: 0,
    contentStreamIndex: 0,
    operatorIndex: 0,
    operator,
    replacementText: "C", // 600 units
    resolvedFont,
    fontMetrics,
  });

  assert.equal(plan.editable, true);
  assert.equal(plan.originalWidthPt, 7);
  assert.equal(plan.replacementWidthPt, 6);
  assert.ok(plan.tjSpacingDelta < 0);
});

test("buildEditPlan: longer replacement (more glyphs)", () => {
  const { resolvedFont, fontMetrics } = fixedWidthsFont();
  const operator = fixedOperator({ strings: [Uint8Array.from([65])] }); // "A"

  const plan = buildEditPlan({
    pageIndex: 0,
    contentStreamIndex: 0,
    operatorIndex: 0,
    operator,
    replacementText: "ABC", // A + B + C
    resolvedFont,
    fontMetrics,
  });

  assert.equal(plan.editable, true);
  assert.equal(plan.originalWidthPt, 7);
  assert.equal(plan.replacementWidthPt, (700 + 720 + 600) / 1000 * 10);
  assert.ok(plan.tjSpacingDelta > 0);
});

test("buildEditPlan: TJ operator is supported the same as Tj", () => {
  const { resolvedFont, fontMetrics } = fixedWidthsFont();
  const operator = fixedOperator({ kind: "TJ", strings: [Uint8Array.from([65]), Uint8Array.from([66])] }); // "A","B"

  const plan = buildEditPlan({
    pageIndex: 0,
    contentStreamIndex: 0,
    operatorIndex: 0,
    operator,
    replacementText: "AB",
    resolvedFont,
    fontMetrics,
  });

  assert.equal(plan.editable, true);
  assert.equal(plan.operatorType, "TJ");
  assert.equal(plan.originalText, "AB");
});

// ' and " were unsupported operator kinds when this file was first written
// (PR #196) -- they're now implemented and have their own dedicated
// coverage in tests/edit-plan-quote.test.ts, including buildEditPlan's own
// handling of "'s aw/ac operands.

test("buildEditPlan: a character requiring a fallback font is rejected, no fallback attempted", () => {
  const { resolvedFont, fontMetrics } = fixedWidthsFont();
  const operator = fixedOperator({ strings: [Uint8Array.from([65])] });

  const plan = buildEditPlan({
    pageIndex: 0,
    contentStreamIndex: 0,
    operatorIndex: 0,
    operator,
    replacementText: "Z", // not in this font's unicodeToGlyphCode map at all
    resolvedFont,
    fontMetrics,
  });

  assert.equal(plan.editable, false);
  assert.match(plan.reason ?? "", /fallback font/);
  assert.deepEqual(plan.replacementGlyphCodes, []);
});

test("buildEditPlan: an embedded subset font's nominally-covered character is honestly rejected (requires-fallback, per fontEncoding.ts's own downgrade)", () => {
  const subsetFont: ResolvedFont = {
    kind: "TrueType",
    baseFont: "ABCDEF+CustomFont",
    isEmbedded: true,
    isSubset: true,
    bytesPerCode: 1,
    encodingSource: "WinAnsi",
    glyphCodeToUnicode: new Map([[65, "A"]]),
    unicodeToGlyphCode: new Map([["A", 65]]), // nominally present, but subset+embedded
  };
  const fontMetrics: FontMetrics = {
    bytesPerCode: 1,
    defaultWidth: 0,
    glyphWidths: new Map([[65, 700]]),
    source: "Widths",
  };
  const operator = fixedOperator({ strings: [Uint8Array.from([65])] });

  const plan = buildEditPlan({
    pageIndex: 0,
    contentStreamIndex: 0,
    operatorIndex: 0,
    operator,
    replacementText: "A",
    resolvedFont: subsetFont,
    fontMetrics,
  });

  assert.equal(plan.editable, false);
  assert.match(plan.reason ?? "", /fallback font/);
});

test("buildEditPlan: a CID (2-byte) font's replacement is planned in CID code units", () => {
  const resolvedFont: ResolvedFont = {
    kind: "Type0",
    baseFont: "MyCIDFont",
    isEmbedded: false,
    isSubset: false,
    bytesPerCode: 2,
    encodingSource: "ToUnicode",
    glyphCodeToUnicode: new Map([
      [3, "H"],
      [4, "e"],
    ]),
    unicodeToGlyphCode: new Map([
      ["H", 3],
      ["e", 4],
    ]),
  };
  const fontMetrics: FontMetrics = {
    bytesPerCode: 2,
    defaultWidth: 1000,
    glyphWidths: new Map([
      [3, 800],
      [4, 500],
    ]),
    source: "W",
  };
  // "He" as two 2-byte codes: 0x0003, 0x0004.
  const operator = fixedOperator({
    strings: [Uint8Array.from([0x00, 0x03, 0x00, 0x04])],
    fontSizePt: 12,
  });

  const plan = buildEditPlan({
    pageIndex: 0,
    contentStreamIndex: 0,
    operatorIndex: 0,
    operator,
    replacementText: "He", // same text, round-trip
    resolvedFont,
    fontMetrics,
  });

  assert.equal(plan.editable, true);
  assert.deepEqual(plan.originalGlyphCodes, [3, 4]);
  assert.deepEqual(plan.replacementGlyphCodes, [3, 4]);
  assert.equal(plan.originalText, "He");
  assert.equal(plan.originalWidthPt, ((800 + 500) / 1000) * 12);
});

test("buildEditPlan: impossible edit -- font encoding entirely unresolved", () => {
  const resolvedFont: ResolvedFont = {
    kind: "Type1",
    baseFont: "MysteryFont",
    isEmbedded: false,
    isSubset: false,
    bytesPerCode: 1,
    encodingSource: "Unknown",
    glyphCodeToUnicode: new Map(),
    unicodeToGlyphCode: new Map(),
  };
  const fontMetrics: FontMetrics = { bytesPerCode: 1, defaultWidth: 0, glyphWidths: new Map(), source: "Unknown" };
  const operator = fixedOperator({ strings: [Uint8Array.from([65])] });

  const plan = buildEditPlan({
    pageIndex: 0,
    contentStreamIndex: 0,
    operatorIndex: 0,
    operator,
    replacementText: "A",
    resolvedFont,
    fontMetrics,
  });

  assert.equal(plan.editable, false);
  assert.match(plan.reason ?? "", /encoding could not be resolved/);
});

// --- End-to-end integration: real PDF -> real content-stream parsing ->
// real font resolution -> buildEditPlan, proving the full pipeline wires
// together correctly, not just editPlan.ts's own branch logic in isolation.

test("buildEditPlan end-to-end: a real pdf-lib-authored Tj operator plans a valid same-font replacement", async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText("Hello", { x: 50, y: 700, size: 18, font });
  const pdfBytes = await doc.save();

  const loaded = await PDFDocument.load(pdfBytes.slice());
  const loadedPage = loaded.getPages()[0];
  const fontDict = firstFontDict(loadedPage.node.Resources()!, loaded.context);
  const resolvedFont = resolveFont(fontDict, loaded.context);
  const fontMetrics = resolveFontMetrics(fontDict, loaded.context, resolvedFont);

  const streamBytes = await decodedContentStreamBytes(pdfBytes.slice());
  const operators = walkTextShowOperators(streamBytes);
  assert.equal(operators.length, 1);

  const plan = buildEditPlan({
    pageIndex: 0,
    contentStreamIndex: 0,
    operatorIndex: 0,
    operator: operators[0],
    replacementText: "World",
    resolvedFont,
    fontMetrics,
  });

  assert.equal(plan.editable, true);
  assert.equal(plan.originalText, "Hello");
  assert.equal(plan.replacementText, "World");
  assert.equal(plan.originalGlyphCodes.length, 5);
  assert.equal(plan.replacementGlyphCodes.length, 5);
  assert.ok(plan.originalWidthPt > 0);
  assert.ok(plan.replacementWidthPt > 0);
  // The exact byte slice this plan targets must reproduce the operator
  // this project's own contentStream.ts test already proved correct.
  const slice = Buffer.from(streamBytes.subarray(plan.byteOffset, plan.byteOffset + plan.byteLength)).toString(
    "latin1",
  );
  assert.ok(slice.endsWith("Tj"));
});
