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
import type { ShapedRun } from "../lib/pdf/edit/harfbuzzShaping.ts";
import type { ShapingReconciliation } from "../lib/pdf/edit/shapingReconciliation.ts";
import {
  validateShapingEvidenceForCharacterCodeWriter,
  type ValidatedShapingWriteEvidence,
} from "../lib/pdf/edit/shapingWriteGuard.ts";

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

test("buildEditPlan: original TJ spacing contributes to the effective preserved advance", () => {
  const { resolvedFont, fontMetrics } = fixedWidthsFont();
  const operator = fixedOperator({
    kind: "TJ",
    strings: [Uint8Array.from([65])], // A = 7pt natural at 10pt
    tjAdjustments: [100], // move back 1pt => effective 6pt
  });

  const plan = buildEditPlan({
    pageIndex: 0,
    contentStreamIndex: 0,
    operatorIndex: 0,
    operator,
    replacementText: "C", // C = 6pt natural
    resolvedFont,
    fontMetrics,
  });

  assert.equal(plan.editable, true);
  assert.equal(plan.originalTjAdjustmentTotal, 100);
  assert.ok(Math.abs(plan.originalWidthPt - 6) < 1e-9);
  assert.ok(Math.abs(plan.replacementWidthPt - 6) < 1e-9);
  assert.ok(Math.abs(plan.tjSpacingDelta) < 1e-9);
});

test("buildEditPlan: repeated compensated TJ remains anchored instead of forgetting its prior adjustment", () => {
  const { resolvedFont, fontMetrics } = fixedWidthsFont();
  const operator = fixedOperator({
    kind: "TJ",
    strings: [Uint8Array.from([67])], // C = 6pt natural
    tjAdjustments: [-100], // move forward 1pt => effective 7pt
  });

  const plan = buildEditPlan({
    pageIndex: 0,
    contentStreamIndex: 0,
    operatorIndex: 0,
    operator,
    replacementText: "B", // B = 7.2pt natural
    resolvedFont,
    fontMetrics,
  });

  assert.equal(plan.editable, true);
  assert.equal(plan.originalTjAdjustmentTotal, -100);
  assert.ok(Math.abs(plan.originalWidthPt - 7) < 1e-9);
  assert.ok(Math.abs(plan.tjSpacingDelta - 20) < 1e-9);
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
    writingMode: "horizontal",
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


test("buildEditPlan: direct formatting measures replacement under the requested text state", () => {
  const { resolvedFont, fontMetrics } = fixedWidthsFont();
  const operator = fixedOperator({
    kind: "TJ",
    strings: [Uint8Array.from([65, 66])], // AB
    fontSizePt: 10,
    charSpacing: 0,
    wordSpacing: 0,
    horizontalScalingPct: 100,
  });

  const plan = buildEditPlan({
    pageIndex: 0,
    contentStreamIndex: 0,
    operatorIndex: 0,
    operator,
    replacementText: "AB",
    resolvedFont,
    fontMetrics,
    replacementTextState: {
      fontSizePt: 12,
      charSpacing: 0.4,
      wordSpacing: 0,
      horizontalScalingPct: 95,
    },
  });

  assert.equal(plan.editable, true);
  assert.deepEqual(plan.replacementTextState, {
    fontSizePt: 12,
    charSpacing: 0.4,
    wordSpacing: 0,
    horizontalScalingPct: 95,
  });
  assert.equal(plan.fontSizePt, 10, "original text state remains the restoration state");
  assert.equal(plan.horizontalScalingPct, 100);
  assert.notEqual(plan.replacementWidthPt, plan.originalWidthPt);
  assert.notEqual(plan.tjSpacingDelta, 0);
});

test("buildEditPlan: direct formatting validates ranges and rejects quote operators honestly", () => {
  const { resolvedFont, fontMetrics } = fixedWidthsFont();

  const invalidScale = buildEditPlan({
    pageIndex: 0,
    contentStreamIndex: 0,
    operatorIndex: 0,
    operator: fixedOperator(),
    replacementText: "A",
    resolvedFont,
    fontMetrics,
    replacementTextState: { horizontalScalingPct: 0 },
  });
  assert.equal(invalidScale.editable, false);
  assert.match(invalidScale.reason ?? "", /horizontal scale/i);

  const quote = buildEditPlan({
    pageIndex: 0,
    contentStreamIndex: 0,
    operatorIndex: 0,
    operator: fixedOperator({ kind: "'" }),
    replacementText: "A",
    resolvedFont,
    fontMetrics,
    replacementTextState: { fontSizePt: 11 },
  });
  assert.equal(quote.editable, false);
  assert.match(quote.reason ?? "", /quote operators/i);
});

test("buildEditPlan: unchanged direct-format values collapse back to the established text-only path", () => {
  const { resolvedFont, fontMetrics } = fixedWidthsFont();
  const operator = fixedOperator();
  const plan = buildEditPlan({
    pageIndex: 0,
    contentStreamIndex: 0,
    operatorIndex: 0,
    operator,
    replacementText: "A",
    resolvedFont,
    fontMetrics,
    replacementTextState: {
      fontSizePt: operator.fontSizePt,
      charSpacing: operator.charSpacing,
      wordSpacing: operator.wordSpacing,
      horizontalScalingPct: operator.horizontalScalingPct,
    },
  });
  assert.equal(plan.editable, true);
  assert.equal(plan.replacementTextState, null);
});


test("buildEditPlan: embedded TrueType subset stays in the original font when cmap and width evidence both prove the replacement glyph", () => {
  const resolvedFont: ResolvedFont = {
    kind: "TrueType",
    baseFont: "ABCDEF+DemoSans",
    isEmbedded: true,
    isSubset: true,
    bytesPerCode: 1,
    encodingSource: "WinAnsi",
    glyphCodeToUnicode: new Map([
      [65, "A"],
      [66, "B"],
    ]),
    unicodeToGlyphCode: new Map([
      ["A", 65],
      ["B", 66],
    ]),
  };
  const fontMetrics: FontMetrics = {
    bytesPerCode: 1,
    defaultWidth: 0,
    glyphWidths: new Map([
      [65, 600],
      [66, 610],
    ]),
    source: "Widths",
  };

  const plan = buildEditPlan({
    pageIndex: 0,
    contentStreamIndex: 0,
    operatorIndex: 0,
    operator: fixedOperator(),
    replacementText: "B",
    resolvedFont,
    fontMetrics,
    embeddedGlyphEvidence: {
      safeForSimplePdfEncoding: true,
      hasUnicodeCodePoint: (codePoint) => codePoint === 0x41 || codePoint === 0x42,
    },
  });

  assert.equal(plan.editable, true);
  assert.equal(plan.reason, null);
  assert.equal(plan.fallbackFont, null);
  assert.deepEqual(plan.replacementGlyphCodes, [66]);
});

test("buildEditPlan: embedded subset remains blocked when the cmap does not prove the glyph", () => {
  const resolvedFont: ResolvedFont = {
    kind: "TrueType",
    baseFont: "ABCDEF+DemoSans",
    isEmbedded: true,
    isSubset: true,
    bytesPerCode: 1,
    encodingSource: "WinAnsi",
    glyphCodeToUnicode: new Map([
      [65, "A"],
      [66, "B"],
    ]),
    unicodeToGlyphCode: new Map([
      ["A", 65],
      ["B", 66],
    ]),
  };
  const fontMetrics: FontMetrics = {
    bytesPerCode: 1,
    defaultWidth: 0,
    glyphWidths: new Map([
      [65, 600],
      [66, 610],
    ]),
    source: "Widths",
  };

  const plan = buildEditPlan({
    pageIndex: 0,
    contentStreamIndex: 0,
    operatorIndex: 0,
    operator: fixedOperator(),
    replacementText: "B",
    resolvedFont,
    fontMetrics,
    embeddedGlyphEvidence: {
      safeForSimplePdfEncoding: true,
      hasUnicodeCodePoint: (codePoint) => codePoint === 0x41,
    },
  });

  assert.equal(plan.editable, false);
  assert.match(plan.reason ?? "", /verified glyph/i);
});

test("buildEditPlan: embedded subset with proven glyph still fails closed when PDF width evidence is missing", () => {
  const resolvedFont: ResolvedFont = {
    kind: "TrueType",
    baseFont: "ABCDEF+DemoSans",
    isEmbedded: true,
    isSubset: true,
    bytesPerCode: 1,
    encodingSource: "WinAnsi",
    glyphCodeToUnicode: new Map([
      [65, "A"],
      [66, "B"],
    ]),
    unicodeToGlyphCode: new Map([
      ["A", 65],
      ["B", 66],
    ]),
  };
  const fontMetrics: FontMetrics = {
    bytesPerCode: 1,
    defaultWidth: 0,
    glyphWidths: new Map([[65, 600]]),
    source: "Widths",
  };

  const plan = buildEditPlan({
    pageIndex: 0,
    contentStreamIndex: 0,
    operatorIndex: 0,
    operator: fixedOperator(),
    replacementText: "B",
    resolvedFont,
    fontMetrics,
    embeddedGlyphEvidence: {
      safeForSimplePdfEncoding: true,
      hasUnicodeCodePoint: () => true,
    },
  });

  assert.equal(plan.editable, false);
  assert.match(plan.reason ?? "", /verified glyph/i);
});


function thaiType0Fixture(): {
  resolvedFont: ResolvedFont;
  fontMetrics: FontMetrics;
  operator: TextShowOperator;
} {
  const resolvedFont: ResolvedFont = {
    kind: "Type0",
    baseFont: "ABCDEF+ThaiDemo",
    isEmbedded: true,
    isSubset: true,
    bytesPerCode: 2,
    encodingSource: "ToUnicode",
    writingMode: "horizontal",
    glyphCodeToUnicode: new Map([[3, "ก"]]),
    unicodeToGlyphCode: new Map([["ก", 3]]),
  };
  const fontMetrics: FontMetrics = {
    bytesPerCode: 2,
    defaultWidth: 1000,
    glyphWidths: new Map([[3, 600]]),
    source: "W",
  };
  const operator = fixedOperator({
    strings: [Uint8Array.from([0x00, 0x03])],
    fontSizePt: 12,
  });
  return { resolvedFont, fontMetrics, operator };
}

function compatibleThaiShaping(): {
  shaped: ShapedRun;
  reconciliation: ShapingReconciliation;
} {
  return {
    shaped: {
      text: "ก",
      glyphs: [
        {
          glyphId: 3,
          clusterUtf16: 0,
          flags: 0,
          xAdvance: 600,
          yAdvance: 0,
          xOffset: 0,
          yOffset: 0,
          xAdvanceEm: 0.6,
          yAdvanceEm: 0,
          xOffsetEm: 0,
          yOffsetEm: 0,
        },
      ],
      clusterMap: [
        { startUtf16: 0, endUtf16: 1, text: "ก", glyphIndices: [0] },
      ],
      unitsPerEm: 1000,
      totalAdvance: 600,
      totalAdvanceEm: 0.6,
      totalXAdvance: 600,
      totalYAdvance: 0,
      requestedDirection: "ltr",
      directionWasExplicit: true,
      engine: "harfbuzz",
      engineVersion: "14.5.0",
    },
    reconciliation: {
      kind: "compatible-character-codes",
      advisoryOnly: true,
      reason:
        "HarfBuzz keeps a one-codepoint/one-glyph sequence with no required per-glyph shaping offsets.",
      advanceAgreement: "matched",
      harfBuzzAdvanceEm: 0.6,
      pdfAdvanceEm: 0.6,
      advanceDeltaEm: 0,
      requiresPerGlyphPositioning: false,
      requiresGlyphSubstitution: false,
    },
  };
}

test("buildEditPlan: complex-script replacement is blocked until exact shaping proof is supplied", () => {
  const { resolvedFont, fontMetrics, operator } = thaiType0Fixture();

  const plan = buildEditPlan({
    pageIndex: 0,
    contentStreamIndex: 0,
    operatorIndex: 0,
    operator,
    replacementText: "ก",
    resolvedFont,
    fontMetrics,
  });

  assert.equal(plan.editable, false);
  assert.match(plan.reason ?? "", /HarfBuzz evidence|canonical shaping/i);
});

test("buildEditPlan: plain-object shaping claims cannot cross the native writer authority boundary", () => {
  const { resolvedFont, fontMetrics, operator } = thaiType0Fixture();
  const forged = {
    replacementText: "ก",
    embeddedProgramSha256: "a".repeat(64),
    engineVersion: "forged",
    advanceAgreement: "matched",
  } as unknown as ValidatedShapingWriteEvidence;

  const plan = buildEditPlan({
    pageIndex: 0,
    contentStreamIndex: 0,
    operatorIndex: 0,
    operator,
    replacementText: "ก",
    resolvedFont,
    fontMetrics,
    embeddedProgramSha256: "a".repeat(64),
    shapingWriteEvidence: forged,
  });

  assert.equal(plan.editable, false);
  assert.match(plan.reason ?? "", /validated planner-issued proof/i);
});

test("buildEditPlan: shaping proof is bound to the exact embedded font fingerprint", () => {
  const { resolvedFont, fontMetrics, operator } = thaiType0Fixture();
  const { shaped, reconciliation } = compatibleThaiShaping();
  const result = validateShapingEvidenceForCharacterCodeWriter({
    replacementText: "ก",
    embeddedProgramSha256: "a".repeat(64),
    shaped,
    reconciliation,
  });
  assert.equal(result.kind, "validated");
  if (result.kind !== "validated") return;

  const stale = buildEditPlan({
    pageIndex: 0,
    contentStreamIndex: 0,
    operatorIndex: 0,
    operator,
    replacementText: "ก",
    resolvedFont,
    fontMetrics,
    embeddedProgramSha256: "b".repeat(64),
    shapingWriteEvidence: result.evidence,
  });

  assert.equal(stale.editable, false);
  assert.match(stale.reason ?? "", /does not match.*font fingerprint|cannot be reused/i);
});

test("buildEditPlan: exact compatible shaping proof closes only the shaping gap", () => {
  const { resolvedFont, fontMetrics, operator } = thaiType0Fixture();
  const fingerprint = "a".repeat(64);
  const { shaped, reconciliation } = compatibleThaiShaping();
  const result = validateShapingEvidenceForCharacterCodeWriter({
    replacementText: "ก",
    embeddedProgramSha256: fingerprint,
    shaped,
    reconciliation,
  });
  assert.equal(result.kind, "validated");
  if (result.kind !== "validated") return;

  const plan = buildEditPlan({
    pageIndex: 0,
    contentStreamIndex: 0,
    operatorIndex: 0,
    operator,
    replacementText: "ก",
    resolvedFont,
    fontMetrics,
    embeddedProgramSha256: fingerprint,
    shapingWriteEvidence: result.evidence,
  });

  assert.equal(plan.editable, true);
  assert.equal(plan.reason, null);
  assert.deepEqual(plan.replacementGlyphCodes, [3]);
  assert.equal(plan.fallbackFont, null);
});


test("buildEditPlan: Type3 text is blocked even when its simple encoding is fully decodable", () => {
  const { resolvedFont: simple, fontMetrics } = fixedWidthsFont();
  const resolvedFont: ResolvedFont = {
    ...simple,
    kind: "Type3",
    writingMode: "horizontal",
  };
  const plan = buildEditPlan({
    pageIndex: 0,
    contentStreamIndex: 0,
    operatorIndex: 0,
    operator: fixedOperator(),
    replacementText: "A",
    resolvedFont,
    fontMetrics,
  });

  assert.equal(plan.editable, false);
  assert.match(plan.reason ?? "", /Type3.*not proven safe|Type3 fonts draw glyphs/i);
});

test("buildEditPlan: vertical Type0 text is blocked even with complete ToUnicode and width evidence", () => {
  const resolvedFont: ResolvedFont = {
    kind: "Type0",
    baseFont: "ABCDEF+VerticalDemo",
    isEmbedded: true,
    isSubset: true,
    bytesPerCode: 2,
    encodingSource: "ToUnicode",
    writingMode: "vertical",
    glyphCodeToUnicode: new Map([[3, "H"]]),
    unicodeToGlyphCode: new Map([["H", 3]]),
  };
  const fontMetrics: FontMetrics = {
    bytesPerCode: 2,
    defaultWidth: 1000,
    glyphWidths: new Map([[3, 600]]),
    source: "W",
  };
  const plan = buildEditPlan({
    pageIndex: 0,
    contentStreamIndex: 0,
    operatorIndex: 0,
    operator: fixedOperator({
      strings: [Uint8Array.from([0x00, 0x03])],
      fontSizePt: 12,
    }),
    replacementText: "H",
    resolvedFont,
    fontMetrics,
  });

  assert.equal(plan.editable, false);
  assert.match(plan.reason ?? "", /vertical writing|vertical CID metrics/i);
});

test("buildEditPlan: Type0 text with unknown writing mode fails closed instead of assuming horizontal", () => {
  const resolvedFont: ResolvedFont = {
    kind: "Type0",
    baseFont: "ABCDEF+CustomCMap",
    isEmbedded: true,
    isSubset: true,
    bytesPerCode: 2,
    encodingSource: "ToUnicode",
    writingMode: "unknown",
    glyphCodeToUnicode: new Map([[3, "H"]]),
    unicodeToGlyphCode: new Map([["H", 3]]),
  };
  const fontMetrics: FontMetrics = {
    bytesPerCode: 2,
    defaultWidth: 1000,
    glyphWidths: new Map([[3, 600]]),
    source: "W",
  };
  const plan = buildEditPlan({
    pageIndex: 0,
    contentStreamIndex: 0,
    operatorIndex: 0,
    operator: fixedOperator({
      strings: [Uint8Array.from([0x00, 0x03])],
      fontSizePt: 12,
    }),
    replacementText: "H",
    resolvedFont,
    fontMetrics,
  });

  assert.equal(plan.editable, false);
  assert.match(plan.reason ?? "", /cannot be proven horizontal|will not assume/i);
});

test("buildEditPlan: materially skewed native text is independently blocked", () => {
  const { resolvedFont, fontMetrics } = fixedWidthsFont();
  const plan = buildEditPlan({
    pageIndex: 0,
    contentStreamIndex: 0,
    operatorIndex: 0,
    operator: fixedOperator({
      textRenderingMatrix: [10, 0, 2, 10, 50, 700],
    }),
    replacementText: "A",
    resolvedFont,
    fontMetrics,
  });

  assert.equal(plan.editable, false);
  assert.match(plan.reason ?? "", /materially skewed|skewed PDF transform/i);
});

test("buildEditPlan: ordinary rotation is not mistaken for skew", () => {
  const { resolvedFont, fontMetrics } = fixedWidthsFont();
  const plan = buildEditPlan({
    pageIndex: 0,
    contentStreamIndex: 0,
    operatorIndex: 0,
    operator: fixedOperator({
      textRenderingMatrix: [0, 10, -10, 0, 50, 700],
    }),
    replacementText: "A",
    resolvedFont,
    fontMetrics,
  });

  assert.equal(plan.editable, true);
});
