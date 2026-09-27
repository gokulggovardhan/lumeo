import assert from "node:assert/strict";
import test from "node:test";
import type { TextShowOperator } from "../lib/pdf/edit/contentStream.ts";
import {
  buildEditPlan,
  isValidatedEditPlan,
} from "../lib/pdf/edit/editPlan.ts";
import { applyEditPlanToBytes } from "../lib/pdf/edit/applyEditPlan.ts";
import type { ResolvedFont } from "../lib/pdf/edit/fontEncoding.ts";
import type { FontMetrics } from "../lib/pdf/edit/fontMetrics.ts";
import type { PdfFontResourceIdentity } from "../lib/pdf/edit/fontRegistry.ts";
import type { ShapedRun } from "../lib/pdf/edit/harfbuzzShaping.ts";
import type { ShapingReconciliation } from "../lib/pdf/edit/shapingReconciliation.ts";
import {
  isValidatedShapingWriteEvidence,
  validateShapingEvidenceForIdentityCidGlyphWriter,
} from "../lib/pdf/edit/shapingWriteGuard.ts";

function identityResource(
  overrides: Partial<PdfFontResourceIdentity> = {},
): PdfFontResourceIdentity {
  return {
    fontObjectRef: "10 0 R",
    descriptorObjectRef: "11 0 R",
    descendantObjectRef: "12 0 R",
    fontProgramObjectRef: "13 0 R",
    toUnicodeObjectRef: "14 0 R",
    encodingObjectRef: null,
    descriptorFontName: "ABCDEF+DemoShape",
    descendantSubtype: "CIDFontType2",
    descendantBaseFont: "ABCDEF+DemoShape",
    type0Encoding: "Identity-H",
    writingMode: "horizontal",
    cidSystemInfo: {
      registry: "Adobe",
      ordering: "Identity",
      supplement: 0,
    },
    cidToGidMap: {
      kind: "name",
      name: "Identity",
      objectRef: null,
    },
    ...overrides,
  };
}

function type0Font(
  glyphCodeToUnicode: Map<number, string>,
): ResolvedFont {
  const unicodeToGlyphCode = new Map<string, number>();
  for (const [code, text] of glyphCodeToUnicode) {
    if (!unicodeToGlyphCode.has(text)) unicodeToGlyphCode.set(text, code);
  }
  return {
    kind: "Type0",
    baseFont: "ABCDEF+DemoShape",
    isEmbedded: true,
    isSubset: true,
    bytesPerCode: 2,
    encodingSource: "ToUnicode",
    glyphCodeToUnicode,
    unicodeToGlyphCode,
  };
}

function metrics(widths: Array<[number, number]>): FontMetrics {
  return {
    bytesPerCode: 2,
    defaultWidth: 1000,
    glyphWidths: new Map(widths),
    source: "W",
  };
}

function operator(
  sourceCode: number,
  sourceBytesLength: number,
): TextShowOperator {
  return {
    kind: "Tj",
    start: 0,
    end: sourceBytesLength,
    strings: [Uint8Array.from([(sourceCode >> 8) & 0xff, sourceCode & 0xff])],
    fontResourceName: "FShape",
    fontSizePt: 10,
    textRenderingMatrix: [10, 0, 0, 10, 50, 700],
    charSpacing: 0,
    wordSpacing: 0,
    horizontalScalingPct: 100,
    leading: 0,
    textRise: 0,
    renderMode: 0,
  };
}

function shapedLigature(): ShapedRun {
  return {
    text: "fi",
    glyphs: [
      {
        glyphId: 100,
        clusterUtf16: 0,
        flags: 0,
        xAdvance: 500,
        yAdvance: 0,
        xOffset: 0,
        yOffset: 0,
        xAdvanceEm: 0.5,
        yAdvanceEm: 0,
        xOffsetEm: 0,
        yOffsetEm: 0,
      },
    ],
    clusterMap: [
      { startUtf16: 0, endUtf16: 2, text: "fi", glyphIndices: [0] },
    ],
    unitsPerEm: 1000,
    totalAdvance: 500,
    totalAdvanceEm: 0.5,
    totalXAdvance: 500,
    totalYAdvance: 0,
    requestedDirection: "ltr",
    directionWasExplicit: true,
    engine: "harfbuzz",
    engineVersion: "14.5.0",
  };
}

function shapedRequired(
  options: {
    substitution?: boolean;
    positioning?: boolean;
  } = {},
): ShapingReconciliation {
  return {
    kind: "requires-shaped-glyph-write",
    advisoryOnly: true,
    reason: "requires shaped glyph output",
    advanceAgreement: "unavailable",
    harfBuzzAdvanceEm: null,
    pdfAdvanceEm: null,
    advanceDeltaEm: null,
    requiresGlyphSubstitution: options.substitution ?? true,
    requiresPerGlyphPositioning: options.positioning ?? false,
  };
}

test("identity CID shaped writer validates a ligature only when ToUnicode reopens to the exact cluster", () => {
  const resolvedFont = type0Font(
    new Map([
      [3, "X"],
      [100, "fi"],
    ]),
  );
  const result = validateShapingEvidenceForIdentityCidGlyphWriter({
    replacementText: "fi",
    embeddedProgramSha256: "a".repeat(64),
    shaped: shapedLigature(),
    reconciliation: shapedRequired({ substitution: true }),
    resourceName: "FShape",
    resourceIdentity: identityResource(),
    resolvedFont,
    fontMetrics: metrics([
      [3, 500],
      [100, 600],
    ]),
  });

  assert.equal(result.kind, "validated");
  if (result.kind !== "validated") return;
  assert.equal(isValidatedShapingWriteEvidence(result.evidence), true);
  assert.equal(result.evidence.writerMode, "shaped-glyphs");
  assert.deepEqual(result.evidence.shapedGlyphWrite?.glyphCodes, [100]);
  assert.deepEqual(
    result.evidence.shapedGlyphWrite?.glyphTjAdjustments,
    [100],
  );
  assert.equal(
    result.evidence.shapedGlyphWrite?.naturalAdvanceUnits1000,
    500,
  );

  const mismatch = validateShapingEvidenceForIdentityCidGlyphWriter({
    replacementText: "fi",
    embeddedProgramSha256: "a".repeat(64),
    shaped: shapedLigature(),
    reconciliation: shapedRequired({ substitution: true }),
    resourceName: "FShape",
    resourceIdentity: identityResource(),
    resolvedFont: type0Font(
      new Map([
        [3, "X"],
        [100, "fl"],
      ]),
    ),
    fontMetrics: metrics([
      [3, 500],
      [100, 600],
    ]),
  });
  assert.equal(mismatch.kind, "blocked");
  if (mismatch.kind === "blocked") {
    assert.match(mismatch.reason, /ToUnicode|logical source text/i);
  }
});

test("identity CID shaped writer emits a real per-glyph TJ ligature and preserves the original endpoint", () => {
  const source = new TextEncoder().encode("<0003> Tj");
  const resolvedFont = type0Font(
    new Map([
      [3, "X"],
      [100, "fi"],
    ]),
  );
  const fontMetrics = metrics([
    [3, 500],
    [100, 600],
  ]);
  const resourceIdentity = identityResource();
  const proof = validateShapingEvidenceForIdentityCidGlyphWriter({
    replacementText: "fi",
    embeddedProgramSha256: "b".repeat(64),
    shaped: shapedLigature(),
    reconciliation: shapedRequired({ substitution: true, positioning: true }),
    resourceName: "FShape",
    resourceIdentity,
    resolvedFont,
    fontMetrics,
  });
  assert.equal(proof.kind, "validated");
  if (proof.kind !== "validated") return;

  const plan = buildEditPlan({
    pageIndex: 0,
    contentStreamIndex: 0,
    operatorIndex: 0,
    operator: operator(3, source.byteLength),
    replacementText: "fi",
    resolvedFont,
    fontMetrics,
    embeddedProgramSha256: "b".repeat(64),
    shapingWriteEvidence: proof.evidence,
    fontResourceIdentity: resourceIdentity,
  });
  assert.equal(plan.editable, true);
  if (!isValidatedEditPlan(plan)) return;
  assert.deepEqual(plan.replacementGlyphCodes, [100]);
  assert.deepEqual(plan.shapedGlyphTjAdjustments, [100]);
  assert.equal(plan.originalWidthPt, 5);
  assert.equal(plan.replacementWidthPt, 5);
  assert.equal(plan.tjSpacingDelta, 0);

  const rewritten = applyEditPlanToBytes(source, plan, 2);
  assert.equal(new TextDecoder().decode(rewritten), "[<0064> 100] TJ");
});

test("identity CID shaped writer carries horizontal GPOS advance as per-glyph TJ positioning", () => {
  const shaped: ShapedRun = {
    text: "AV",
    glyphs: [
      {
        glyphId: 10,
        clusterUtf16: 0,
        flags: 0,
        xAdvance: 550,
        yAdvance: 0,
        xOffset: 0,
        yOffset: 0,
        xAdvanceEm: 0.55,
        yAdvanceEm: 0,
        xOffsetEm: 0,
        yOffsetEm: 0,
      },
      {
        glyphId: 11,
        clusterUtf16: 1,
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
      { startUtf16: 0, endUtf16: 1, text: "A", glyphIndices: [0] },
      { startUtf16: 1, endUtf16: 2, text: "V", glyphIndices: [1] },
    ],
    unitsPerEm: 1000,
    totalAdvance: 1150,
    totalAdvanceEm: 1.15,
    totalXAdvance: 1150,
    totalYAdvance: 0,
    requestedDirection: "ltr",
    directionWasExplicit: true,
    engine: "harfbuzz",
    engineVersion: "14.5.0",
  };
  const resolvedFont = type0Font(
    new Map([
      [3, "X"],
      [10, "A"],
      [11, "V"],
    ]),
  );
  const fontMetrics = metrics([
    [3, 1150],
    [10, 600],
    [11, 600],
  ]);
  const resourceIdentity = identityResource();
  const proof = validateShapingEvidenceForIdentityCidGlyphWriter({
    replacementText: "AV",
    embeddedProgramSha256: "c".repeat(64),
    shaped,
    reconciliation: shapedRequired({ substitution: false, positioning: true }),
    resourceName: "FShape",
    resourceIdentity,
    resolvedFont,
    fontMetrics,
  });
  assert.equal(proof.kind, "validated");
  if (proof.kind !== "validated") return;

  const source = new TextEncoder().encode("<0003> Tj");
  const plan = buildEditPlan({
    pageIndex: 0,
    contentStreamIndex: 0,
    operatorIndex: 0,
    operator: operator(3, source.byteLength),
    replacementText: "AV",
    resolvedFont,
    fontMetrics,
    embeddedProgramSha256: "c".repeat(64),
    shapingWriteEvidence: proof.evidence,
    fontResourceIdentity: resourceIdentity,
  });
  assert.equal(plan.editable, true);
  if (!isValidatedEditPlan(plan)) return;
  assert.deepEqual(plan.shapedGlyphTjAdjustments, [50, 0]);
  assert.equal(plan.tjSpacingDelta, 0);
  assert.equal(
    new TextDecoder().decode(applyEditPlanToBytes(source, plan, 2)),
    "[<000a> 50 <000b>] TJ",
  );
});

test("identity CID shaped writer keeps non-identity maps, RTL, offsets and resource mismatches read-only", () => {
  const resolvedFont = type0Font(
    new Map([
      [3, "X"],
      [100, "fi"],
    ]),
  );
  const fontMetrics = metrics([
    [3, 500],
    [100, 600],
  ]);
  const common = {
    replacementText: "fi",
    embeddedProgramSha256: "d".repeat(64),
    reconciliation: shapedRequired({ substitution: true, positioning: true }),
    resourceName: "FShape",
    resolvedFont,
    fontMetrics,
  } as const;

  const nonIdentity = validateShapingEvidenceForIdentityCidGlyphWriter({
    ...common,
    shaped: shapedLigature(),
    resourceIdentity: identityResource({
      cidToGidMap: { kind: "stream", name: null, objectRef: "20 0 R" },
    }),
  });
  assert.equal(nonIdentity.kind, "blocked");

  const rtlShape: ShapedRun = {
    ...shapedLigature(),
    requestedDirection: "rtl",
  };
  const rtl = validateShapingEvidenceForIdentityCidGlyphWriter({
    ...common,
    shaped: rtlShape,
    resourceIdentity: identityResource(),
  });
  assert.equal(rtl.kind, "blocked");

  const offsetShape: ShapedRun = {
    ...shapedLigature(),
    glyphs: [{ ...shapedLigature().glyphs[0], xOffset: 20, xOffsetEm: 0.02 }],
  };
  const offset = validateShapingEvidenceForIdentityCidGlyphWriter({
    ...common,
    shaped: offsetShape,
    resourceIdentity: identityResource(),
  });
  assert.equal(offset.kind, "blocked");

  const proof = validateShapingEvidenceForIdentityCidGlyphWriter({
    ...common,
    shaped: shapedLigature(),
    resourceIdentity: identityResource(),
  });
  assert.equal(proof.kind, "validated");
  if (proof.kind !== "validated") return;

  const plan = buildEditPlan({
    pageIndex: 0,
    contentStreamIndex: 0,
    operatorIndex: 0,
    operator: operator(3, new TextEncoder().encode("<0003> Tj").byteLength),
    replacementText: "fi",
    resolvedFont,
    fontMetrics,
    embeddedProgramSha256: "d".repeat(64),
    shapingWriteEvidence: proof.evidence,
    fontResourceIdentity: identityResource({
      toUnicodeObjectRef: "99 0 R",
    }),
  });
  assert.equal(plan.editable, false);
  assert.match(plan.reason ?? "", /exact PDF font resource identity/i);
});
