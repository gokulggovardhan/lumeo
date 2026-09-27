import assert from "node:assert/strict";
import test from "node:test";
import type { FontMetrics } from "../lib/pdf/edit/fontMetrics.ts";
import type { PdfFontProgramIntelligence } from "../lib/pdf/edit/fontProgramIntelligence.ts";
import type { ShapedRun } from "../lib/pdf/edit/harfbuzzShaping.ts";
import { reconcileShapingWithPdfCharacterCodes } from "../lib/pdf/edit/shapingReconciliation.ts";

function metrics(a = 600, b = 620): FontMetrics {
  return {
    bytesPerCode: 1,
    defaultWidth: 0,
    glyphWidths: new Map([
      [65, a],
      [66, b],
    ]),
    source: "Widths",
  };
}

function intelligence(): PdfFontProgramIntelligence {
  return {
    metadata: {
      engine: "@cantoo/fontkit@2.0.12",
      fontType: "TTF",
      postScriptName: "Synthetic",
      fullName: "Synthetic",
      familyName: "Synthetic",
      subfamilyName: "Regular",
      version: "1",
      unitsPerEm: 1000,
      ascent: 800,
      descent: -200,
      lineGap: 0,
      capHeight: 700,
      xHeight: 500,
      italicAngle: 0,
      bbox: null,
      numGlyphs: 3,
      characterSetCount: 2,
      availableFeatures: [],
    },
    hasGlyphForCodePoint: (codePoint) => codePoint === 65 || codePoint === 66,
    glyphIdForCodePoint: (codePoint) =>
      codePoint === 65 ? 1 : codePoint === 66 ? 2 : null,
    advanceWidthForGlyphId: (glyphId) =>
      glyphId === 1 ? 600 : glyphId === 2 ? 620 : null,
  };
}

function shapedAB(overrides: Partial<ShapedRun> = {}): ShapedRun {
  const glyphs = [
    {
      glyphId: 1,
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
    {
      glyphId: 2,
      clusterUtf16: 1,
      flags: 0,
      xAdvance: 620,
      yAdvance: 0,
      xOffset: 0,
      yOffset: 0,
      xAdvanceEm: 0.62,
      yAdvanceEm: 0,
      xOffsetEm: 0,
      yOffsetEm: 0,
    },
  ];
  return {
    text: "AB",
    glyphs,
    clusterMap: [
      { startUtf16: 0, endUtf16: 1, text: "A", glyphIndices: [0] },
      { startUtf16: 1, endUtf16: 2, text: "B", glyphIndices: [1] },
    ],
    unitsPerEm: 1000,
    totalAdvance: 1220,
    totalAdvanceEm: 1.22,
    totalXAdvance: 1220,
    totalYAdvance: 0,
    requestedDirection: "ltr",
    directionWasExplicit: true,
    engine: "harfbuzz",
    engineVersion: "14.5.0",
    ...overrides,
  };
}

const resolved = {
  unicodeToGlyphCode: new Map([
    ["A", 65],
    ["B", 66],
  ]),
};

test("shaping reconciliation recognizes a simple one-codepoint one-glyph path without becoming write authority", () => {
  const result = reconcileShapingWithPdfCharacterCodes({
    text: "AB",
    shaped: shapedAB(),
    resolvedFont: resolved,
    fontMetrics: metrics(),
    intelligence: intelligence(),
  });

  assert.equal(result.kind, "compatible-character-codes");
  assert.equal(result.advisoryOnly, true);
  assert.equal(result.requiresGlyphSubstitution, false);
  assert.equal(result.requiresPerGlyphPositioning, false);
  assert.equal(result.advanceAgreement, "matched");
  assert.equal(result.harfBuzzAdvanceEm, 1.22);
  assert.equal(result.pdfAdvanceEm, 1.22);
});

test("shaping reconciliation requires a shaped writer for ligatures or multi-codepoint clusters", () => {
  const shaped = shapedAB({
    text: "fi",
    glyphs: [
      {
        ...shapedAB().glyphs[0],
        glyphId: 7,
        xAdvance: 570,
        xAdvanceEm: 0.57,
      },
    ],
    clusterMap: [
      { startUtf16: 0, endUtf16: 2, text: "fi", glyphIndices: [0] },
    ],
    totalAdvance: 570,
    totalAdvanceEm: 0.57,
    totalXAdvance: 570,
  });

  const result = reconcileShapingWithPdfCharacterCodes({
    text: "fi",
    shaped,
    resolvedFont: {
      unicodeToGlyphCode: new Map([
        ["f", 102],
        ["i", 105],
      ]),
    },
    fontMetrics: metrics(),
    intelligence: intelligence(),
  });

  assert.equal(result.kind, "requires-shaped-glyph-write");
  assert.equal(result.requiresGlyphSubstitution, true);
  assert.match(result.reason, /combined or expanded|shaped cluster/i);
});

test("shaping reconciliation detects glyph substitution even when the source cluster is one code point", () => {
  const shaped = shapedAB({
    glyphs: [{ ...shapedAB().glyphs[0], glyphId: 9 }],
    clusterMap: [{ startUtf16: 0, endUtf16: 1, text: "A", glyphIndices: [0] }],
    totalAdvance: 600,
    totalAdvanceEm: 0.6,
    totalXAdvance: 600,
    text: "A",
  });

  const result = reconcileShapingWithPdfCharacterCodes({
    text: "A",
    shaped,
    resolvedFont: { unicodeToGlyphCode: new Map([["A", 65]]) },
    fontMetrics: metrics(),
    intelligence: {
      ...intelligence(),
      advanceWidthForGlyphId: (glyphId) => (glyphId === 9 ? 600 : null),
    },
  });

  assert.equal(result.kind, "requires-shaped-glyph-write");
  assert.equal(result.requiresGlyphSubstitution, true);
});

test("shaping reconciliation detects per-glyph kerning or GPOS adjustments", () => {
  const shaped = shapedAB({
    glyphs: [
      { ...shapedAB().glyphs[0], xAdvance: 560, xAdvanceEm: 0.56 },
      shapedAB().glyphs[1],
    ],
    totalAdvance: 1180,
    totalAdvanceEm: 1.18,
    totalXAdvance: 1180,
  });

  const result = reconcileShapingWithPdfCharacterCodes({
    text: "AB",
    shaped,
    resolvedFont: resolved,
    fontMetrics: metrics(),
    intelligence: intelligence(),
  });

  assert.equal(result.kind, "requires-shaped-glyph-write");
  assert.equal(result.requiresPerGlyphPositioning, true);
  assert.match(result.reason, /per-glyph positioning/i);
});

test("shaping reconciliation reports PDF width divergence without overriding PDF advance authority", () => {
  const result = reconcileShapingWithPdfCharacterCodes({
    text: "AB",
    shaped: shapedAB(),
    resolvedFont: resolved,
    fontMetrics: metrics(590, 610),
    intelligence: intelligence(),
  });

  assert.equal(result.kind, "compatible-character-codes");
  assert.equal(result.advanceAgreement, "diverged");
  assert.equal(result.advisoryOnly, true);
  assert.match(result.reason, /PDF width table/i);
});

test("shaping reconciliation fails closed when the PDF encoding cannot represent a source character", () => {
  const result = reconcileShapingWithPdfCharacterCodes({
    text: "AB",
    shaped: shapedAB(),
    resolvedFont: { unicodeToGlyphCode: new Map([["A", 65]]) },
    fontMetrics: metrics(),
    intelligence: intelligence(),
  });

  assert.equal(result.kind, "unresolved");
  assert.match(result.reason, /PDF encoding does not authorize/i);
});

test("shaping reconciliation does not pretend auto, RTL, or vertical ordering is supported by the current writer", () => {
  const auto = reconcileShapingWithPdfCharacterCodes({
    text: "AB",
    shaped: shapedAB({
      requestedDirection: "auto",
      directionWasExplicit: false,
      totalAdvance: null,
      totalAdvanceEm: null,
    }),
    resolvedFont: resolved,
    fontMetrics: metrics(),
    intelligence: intelligence(),
  });
  assert.equal(auto.kind, "unresolved");

  const rtl = reconcileShapingWithPdfCharacterCodes({
    text: "AB",
    shaped: shapedAB({ requestedDirection: "rtl" }),
    resolvedFont: resolved,
    fontMetrics: metrics(),
    intelligence: intelligence(),
  });
  assert.equal(rtl.kind, "requires-shaped-glyph-write");
  assert.match(rtl.reason, /RTL or vertical/i);
});

test("shaping reconciliation fails closed when font engines disagree on units-per-em", () => {
  const badIntelligence = intelligence();
  badIntelligence.metadata.unitsPerEm = 2048;

  const result = reconcileShapingWithPdfCharacterCodes({
    text: "AB",
    shaped: shapedAB(),
    resolvedFont: resolved,
    fontMetrics: metrics(),
    intelligence: badIntelligence,
  });

  assert.equal(result.kind, "unresolved");
  assert.match(result.reason, /units-per-em/i);
});


test("shaping reconciliation rejects empty shaping evidence for non-empty source text", () => {
  const result = reconcileShapingWithPdfCharacterCodes({
    text: "AB",
    shaped: shapedAB({
      glyphs: [],
      clusterMap: [],
      totalAdvance: 0,
      totalAdvanceEm: 0,
      totalXAdvance: 0,
    }),
    resolvedFont: resolved,
    fontMetrics: metrics(),
    intelligence: intelligence(),
  });

  assert.equal(result.kind, "unresolved");
  assert.match(result.reason, /no shaping clusters or glyphs/i);
});

test("shaping reconciliation rejects gapped or mismatched cluster coverage", () => {
  const result = reconcileShapingWithPdfCharacterCodes({
    text: "AB",
    shaped: shapedAB({
      clusterMap: [
        { startUtf16: 0, endUtf16: 1, text: "A", glyphIndices: [0] },
        { startUtf16: 2, endUtf16: 2, text: "", glyphIndices: [1] },
      ],
    }),
    resolvedFont: resolved,
    fontMetrics: metrics(),
    intelligence: intelligence(),
  });

  assert.equal(result.kind, "unresolved");
  assert.match(result.reason, /cluster coverage/i);
});

test("shaping reconciliation rejects duplicated glyph ownership across clusters", () => {
  const result = reconcileShapingWithPdfCharacterCodes({
    text: "AB",
    shaped: shapedAB({
      clusterMap: [
        { startUtf16: 0, endUtf16: 1, text: "A", glyphIndices: [0] },
        { startUtf16: 1, endUtf16: 2, text: "B", glyphIndices: [0] },
      ],
    }),
    resolvedFont: resolved,
    fontMetrics: metrics(),
    intelligence: intelligence(),
  });

  assert.equal(result.kind, "unresolved");
  assert.match(result.reason, /invalid or duplicated shaped glyph/i);
});

test("shaping reconciliation rejects unowned shaped glyphs", () => {
  const result = reconcileShapingWithPdfCharacterCodes({
    text: "A",
    shaped: shapedAB({
      text: "A",
      clusterMap: [
        { startUtf16: 0, endUtf16: 1, text: "A", glyphIndices: [0] },
      ],
      totalAdvance: 600,
      totalAdvanceEm: 0.6,
      totalXAdvance: 600,
    }),
    resolvedFont: { unicodeToGlyphCode: new Map([["A", 65]]) },
    fontMetrics: metrics(),
    intelligence: intelligence(),
  });

  assert.equal(result.kind, "unresolved");
  assert.match(result.reason, /exactly once/i);
});
