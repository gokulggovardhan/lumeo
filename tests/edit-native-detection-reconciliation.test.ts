import assert from "node:assert/strict";
import test from "node:test";
import type { PDFDict } from "pdf-lib";
import type { LocatedTextOperator } from "../lib/pdf/edit/formXObjects.ts";
import type { PdfFontProfile } from "../lib/pdf/edit/fontRegistry.ts";
import {
  buildNativeContentStreamSpans,
  locatedTextOperatorKey,
  nativeDetectedRuns,
} from "../lib/pdf/edit/nativeTextDetection.ts";
import {
  buildTextEditArbitrations,
  finalizeTextEditArbitration,
  reconcileTextSignals,
  reconciliationMatchMap,
} from "../lib/pdf/edit/textReconciliation.ts";
import {
  DocumentTextCapabilityClassifier,
  classifyNativeTextSpan,
  enforceSpanCapabilityOnArbitration,
} from "../lib/pdf/edit/textCapabilityClassifier.ts";

const viewport = [1, 0, 0, -1, 0, 792];

function located({
  kind = "Tj",
  bytes = new Uint8Array([72, 105]),
  renderMode = 0,
  fillOpacity = 1,
  strokeOpacity = 1,
  locator = { kind: "page", contentStreamIndex: 0 } as const,
  operatorIndex = 2,
  textRenderingMatrix = [12, 0, 0, 12, 72, 700] as [number, number, number, number, number, number],
}: {
  kind?: "Tj" | "TJ";
  bytes?: Uint8Array;
  renderMode?: number;
  fillOpacity?: number | null;
  strokeOpacity?: number | null;
  locator?: LocatedTextOperator["locator"];
  operatorIndex?: number;
  textRenderingMatrix?: [number, number, number, number, number, number];
} = {}): LocatedTextOperator {
  return {
    locator,
    operatorIndex,
    operator: {
      kind,
      start: 10,
      end: 20,
      strings: [bytes],
      fontResourceName: "F1",
      fontSizePt: 12,
      textRenderingMatrix,
      textObjectIndex: 0,
      textMatrix: [1, 0, 0, 1, 72, 700],
      textLineMatrix: [1, 0, 0, 1, 72, 700],
      ctm: [1, 0, 0, 1, 0, 0],
      charSpacing: 0,
      wordSpacing: 0,
      horizontalScalingPct: 100,
      leading: 14,
      textRise: 0,
      renderMode,
      fillOpacity,
      strokeOpacity,
    },
    streamBytes: new Uint8Array(),
    resources: {} as PDFDict,
  };
}

function profile(overrides: Partial<PdfFontProfile> = {}): PdfFontProfile {
  return {
    resourceName: "F1",
    kind: "TrueType",
    baseFont: "ABCDEF+DemoSans",
    familyName: "Demo Sans",
    isEmbedded: true,
    isSubset: true,
    encodingSource: "ToUnicode",
    metricsSource: "Widths",
    bytesPerCode: 1,
    weight: 400,
    italic: false,
    serif: false,
    monospace: false,
    descriptorFlags: 32,
    italicAngle: 0,
    ascentRatio: 0.8,
    descentRatio: -0.2,
    capHeightRatio: 0.7,
    fsType: null,
    fallbackPdfFont: "Helvetica",
    cssFallbackFamily: "Arial, Helvetica, sans-serif",
    browserFamilyName: "LumeoPdf_F1_DemoSans",
    browserPreviewPossible: true,
    resourceIdentity: {
      fontObjectRef: null,
      descriptorObjectRef: null,
      descendantObjectRef: null,
      fontProgramObjectRef: null,
      toUnicodeObjectRef: null,
      encodingObjectRef: null,
      descriptorFontName: null,
      descendantSubtype: null,
      descendantBaseFont: null,
      type0Encoding: null,
      writingMode: "unknown",
      cidSystemInfo: null,
      cidToGidMap: null,
    },
    embeddedProgramByteLength: null,
    embeddedProgramSha256: null,
    embeddedGlyphCoverage: null,
    embeddedGlyphEvidence: null,
    resolvedFont: {
      kind: "TrueType",
      baseFont: "ABCDEF+DemoSans",
      isEmbedded: true,
      isSubset: true,
      bytesPerCode: 1,
      encodingSource: "ToUnicode",
      glyphCodeToUnicode: new Map([
        [72, "H"],
        [105, "i"],
      ]),
      unicodeToGlyphCode: new Map([
        ["H", 72],
        ["i", 105],
      ]),
    },
    metrics: {
      bytesPerCode: 1,
      defaultWidth: 500,
      glyphWidths: new Map([
        [72, 600],
        [105, 250],
      ]),
      source: "Widths",
    },
    styleHints: {
      flags: 32,
      fontWeight: 400,
      italicAngle: 0,
      isFixedPitch: false,
      serif: false,
      symbolic: false,
    },
    ...overrides,
  } as PdfFontProfile;
}

test("native detector independently decodes and synthesizes a proven simple text run", () => {
  const source = located();
  const spans = buildNativeContentStreamSpans({
    operators: [source],
    viewportTransform: viewport,
    pageWidthPt: 612,
    pageHeightPt: 792,
    resolveFontProfile: () => profile(),
  });

  assert.equal(spans.length, 1);
  assert.equal(spans[0].text, "Hi");
  assert.equal(spans[0].decodeComplete, true);
  assert.equal(spans[0].geometryConfidence, "exact-simple-run");
  assert.ok(spans[0].detectedRun);
  assert.equal(spans[0].detectedRun?.detectionSource, "native");
  assert.equal(spans[0].detectedRun?.nativeSourceKey, locatedTextOperatorKey(source));
  assert.equal(nativeDetectedRuns(spans).length, 1);
});

test("native detector keeps TJ text as source evidence instead of guessing geometry", () => {
  const spans = buildNativeContentStreamSpans({
    operators: [located({ kind: "TJ" })],
    viewportTransform: viewport,
    pageWidthPt: 612,
    pageHeightPt: 792,
    resolveFontProfile: () => profile(),
  });

  assert.equal(spans[0].text, "Hi");
  assert.equal(spans[0].geometryConfidence, "source-only");
  assert.equal(spans[0].detectedRun, null);
  assert.match(spans[0].limitationReason ?? "", /geometry/i);
});

test("reconciliation can recover a high-confidence source match from Unicode plus baseline and angle", () => {
  const source = located();
  const [span] = buildNativeContentStreamSpans({
    operators: [source],
    viewportTransform: viewport,
    pageWidthPt: 612,
    pageHeightPt: 792,
    resolveFontProfile: () => profile(),
  });

  const run = {
    str: "Hi",
    fontName: "g_d0_f1",
    xPct: 10,
    yPct: 10,
    widthPct: 2,
    heightPct: 2,
    fontSizePt: 12,
    rotated: false,
    pdfJsTransform: [12, 0, 0, 12, 72, 700],
    detectionSource: "pdfjs" as const,
  };

  const reconciliations = reconcileTextSignals({
    runs: [run],
    legacyMatches: [null],
    nativeSpans: [span],
    viewportTransform: viewport,
  });

  assert.equal(reconciliations[0].confidence, "high");
  assert.equal(reconciliations[0].agreement, "exact");
  assert.equal(reconciliations[0].source, "evidence-match");
  assert.equal(reconciliationMatchMap(reconciliations, [span]).get(0)?.key, span.key);
});

test("edit arbitration fails closed when PDF.js and native text disagree", () => {
  const source = located();
  const [span] = buildNativeContentStreamSpans({
    operators: [source],
    viewportTransform: viewport,
    pageWidthPt: 612,
    pageHeightPt: 792,
    resolveFontProfile: () => profile(),
  });
  const run = {
    str: "No",
    fontName: "g_d0_f1",
    xPct: 10,
    yPct: 10,
    widthPct: 2,
    heightPct: 2,
    fontSizePt: 12,
    rotated: false,
    pdfJsTransform: [12, 0, 0, 12, 72, 700],
    detectionSource: "pdfjs" as const,
  };

  const reconciliations = reconcileTextSignals({
    runs: [run],
    legacyMatches: [{ locatedOperator: source, operator: source.operator }],
    nativeSpans: [span],
    viewportTransform: viewport,
  });
  const [arbitration] = buildTextEditArbitrations({
    runs: [run],
    reconciliations,
    nativeSpans: [span],
  });

  assert.equal(reconciliations[0].agreement, "different");
  assert.equal(arbitration.decision, "view-only");
  assert.equal(arbitration.source, "conflict");
  assert.match(arbitration.reason, /conflict|not strong enough/i);
});

test("exact fragmented reconstruction may authorize only when measured geometry also agrees", () => {
  const base = {
    pdfJsRunIndex: 0,
    decision: "view-only" as const,
    nativeSpanKey: "page:0:operator:1",
    source: "conflict" as const,
    reason: "The visible PDF.js run spans more than one native operator.",
  };
  const run = {
    str: "SSN 123-45-6789",
    fontName: "g_d0_f1",
    xPct: 10,
    yPct: 10,
    widthPct: 20,
    heightPct: 2,
    fontSizePt: 12,
    rotated: false,
    baselineXPct: 10,
    baselineYPct: 11.5,
    detectionSource: "pdfjs" as const,
  };
  const reconciliation = {
    pdfJsRunIndex: 0,
    nativeSpanKey: base.nativeSpanKey,
    confidence: "low" as const,
    agreement: "different" as const,
    baselineDistancePt: 0.25,
    angleDeltaDeg: 0,
    source: "legacy-source-match" as const,
    reason: "The first native operator contains only the first fragment.",
  };

  const unchanged = finalizeTextEditArbitration({
    arbitration: base,
    run,
    reconciliation,
    fragmentedReconstructionProven: false,
  });
  assert.equal(unchanged.decision, "view-only");
  assert.equal(unchanged.source, "conflict");

  const promoted = finalizeTextEditArbitration({
    arbitration: base,
    run,
    reconciliation,
    fragmentedReconstructionProven: true,
  });
  assert.equal(promoted.decision, "editable");
  assert.equal(promoted.source, "fragmented-reconstruction");
  assert.match(promoted.reason, /fragmented-run reconstruction.*measured PDF\.js\/native geometry/i);

  const missingGeometry = finalizeTextEditArbitration({
    arbitration: base,
    run,
    reconciliation: {
      ...reconciliation,
      baselineDistancePt: null,
      angleDeltaDeg: null,
    },
    fragmentedReconstructionProven: true,
  });
  assert.equal(missingGeometry.decision, "view-only");
  assert.equal(missingGeometry.source, "conflict");
});

test("edit arbitration requires measured geometry even when text identity matches", () => {
  const source = located();
  const [span] = buildNativeContentStreamSpans({
    operators: [source],
    viewportTransform: viewport,
    pageWidthPt: 612,
    pageHeightPt: 792,
    resolveFontProfile: () => profile(),
  });

  const run = {
    str: "Hi",
    fontName: "g_d0_f1",
    xPct: 10,
    yPct: 10,
    widthPct: 2,
    heightPct: 2,
    fontSizePt: 12,
    rotated: false,
    detectionSource: "pdfjs" as const,
  };

  const reconciliations = reconcileTextSignals({
    runs: [run],
    legacyMatches: [{ locatedOperator: source, operator: source.operator }],
    nativeSpans: [span],
    viewportTransform: viewport,
  });
  const [arbitration] = buildTextEditArbitrations({
    runs: [run],
    reconciliations,
    nativeSpans: [span],
  });

  assert.equal(reconciliations[0].confidence, "high");
  assert.equal(reconciliations[0].baselineDistancePt, null);
  assert.equal(reconciliations[0].angleDeltaDeg, null);
  assert.equal(arbitration.decision, "view-only");
  assert.match(arbitration.reason, /measured PDF\.js\/native geometry/i);
});

test("edit arbitration never promotes PDF.js-only text to a native edit target", () => {
  const run = {
    str: "Visible only",
    fontName: "g_d0_f1",
    xPct: 10,
    yPct: 10,
    widthPct: 10,
    heightPct: 2,
    fontSizePt: 12,
    rotated: false,
    pdfJsTransform: [12, 0, 0, 12, 72, 700],
    detectionSource: "pdfjs" as const,
  };

  const reconciliations = reconcileTextSignals({
    runs: [run],
    legacyMatches: [null],
    nativeSpans: [],
    viewportTransform: viewport,
  });
  const [arbitration] = buildTextEditArbitrations({
    runs: [run],
    reconciliations,
    nativeSpans: [],
  });

  assert.equal(reconciliations[0].confidence, "unmatched");
  assert.equal(arbitration.decision, "view-only");
  assert.equal(arbitration.nativeSpanKey, null);
});

test("edit arbitration preserves proven native-only safe synthesis", () => {
  const source = located();
  const spans = buildNativeContentStreamSpans({
    operators: [source],
    viewportTransform: viewport,
    pageWidthPt: 612,
    pageHeightPt: 792,
    resolveFontProfile: () => profile(),
  });
  const [nativeRun] = nativeDetectedRuns(spans);
  assert.ok(nativeRun);

  const [arbitration] = buildTextEditArbitrations({
    runs: [nativeRun],
    reconciliations: [],
    nativeSpans: spans,
  });

  assert.equal(arbitration.decision, "editable");
  assert.equal(arbitration.source, "native-only-safe-synthesis");
  assert.equal(arbitration.nativeSpanKey, spans[0].key);
});

test("reconciliation overrides a wrong positional legacy match when stronger native evidence exists", () => {
  const wrong = located({
    bytes: new Uint8Array([72]),
    operatorIndex: 1,
    textRenderingMatrix: [12, 0, 0, 12, 72, 700],
  });
  const correct = located({
    operatorIndex: 2,
    textRenderingMatrix: [12, 0, 0, 12, 72, 700],
  });
  const spans = buildNativeContentStreamSpans({
    operators: [wrong, correct],
    viewportTransform: viewport,
    pageWidthPt: 612,
    pageHeightPt: 792,
    resolveFontProfile: () => profile(),
  });
  const run = {
    str: "Hi",
    fontName: "g_d0_f1",
    xPct: 10,
    yPct: 10,
    widthPct: 2,
    heightPct: 2,
    fontSizePt: 12,
    rotated: false,
    pdfJsTransform: [12, 0, 0, 12, 72, 700],
    detectionSource: "pdfjs" as const,
  };

  const reconciliations = reconcileTextSignals({
    runs: [run],
    legacyMatches: [{ locatedOperator: wrong, operator: wrong.operator }],
    nativeSpans: spans,
    viewportTransform: viewport,
  });
  const evidence = reconciliationMatchMap(reconciliations, spans).get(0);

  assert.equal(reconciliations[0].confidence, "high");
  assert.equal(reconciliations[0].source, "evidence-match");
  assert.equal(evidence?.key, locatedTextOperatorKey(correct));
});

test("classifier identifies Form XObject text without flattening away its resource scope", () => {
  const [span] = buildNativeContentStreamSpans({
    operators: [
      located({
        locator: { kind: "xobject", formPath: ["Fm1", "Fm2"] },
      }),
    ],
    viewportTransform: viewport,
    pageWidthPt: 612,
    pageHeightPt: 792,
    resolveFontProfile: () => profile(),
  });

  const classification = classifyNativeTextSpan(span);
  assert.equal(classification.category, "FORM_XOBJECT_TEXT");
  assert.equal(classification.safelyRewritable, true);
});

test("Form XObject classification still fails closed for missing metrics and complex geometry", () => {
  const locator = { kind: "xobject" as const, formPath: ["Fm1"] };

  const fontLimited = buildNativeContentStreamSpans({
    operators: [located({ locator })],
    viewportTransform: viewport,
    pageWidthPt: 612,
    pageHeightPt: 792,
    resolveFontProfile: () =>
      profile({
        metricsSource: "Unknown",
        metrics: {
          ...profile().metrics,
          source: "Unknown",
        },
      }),
  })[0];
  const fontClassification = classifyNativeTextSpan(fontLimited);
  assert.equal(
    fontClassification.category,
    "NATIVE_TEXT_WITH_FONT_LIMITATIONS",
  );
  assert.equal(fontClassification.safelyRewritable, false);

  const skewed = buildNativeContentStreamSpans({
    operators: [
      located({
        locator,
        textRenderingMatrix: [12, 3, 0, 12, 72, 700],
      }),
    ],
    viewportTransform: viewport,
    pageWidthPt: 612,
    pageHeightPt: 792,
    resolveFontProfile: () => profile(),
  })[0];
  const skewClassification = classifyNativeTextSpan(skewed);
  assert.equal(skewClassification.category, "COMPLEX_VECTOR_TEXT");
  assert.equal(skewClassification.safelyRewritable, false);
  assert.equal(
    skewClassification.authorization,
    "needs-measured-reconciliation",
  );

  const skewRun = {
    str: "Hi",
    fontName: "g_d0_f1",
    xPct: 10,
    yPct: 10,
    widthPct: 2,
    heightPct: 2,
    fontSizePt: 12,
    rotated: true,
    baselineXPct: 10,
    baselineYPct: 11.5,
    ascentRatio: 0.8,
    descentRatio: -0.2,
    pdfJsTransform: [12, 3, 0, 12, 72, 700],
    detectionSource: "pdfjs" as const,
  };
  const [skewReconciliation] = reconcileTextSignals({
    runs: [skewRun],
    legacyMatches: [{
      locatedOperator: skewed.locatedOperator,
      operator: skewed.locatedOperator.operator,
    }],
    nativeSpans: [skewed],
    viewportTransform: viewport,
  });
  const [skewArbitration] = buildTextEditArbitrations({
    runs: [skewRun],
    reconciliations: [skewReconciliation],
    nativeSpans: [skewed],
  });
  assert.equal(skewReconciliation.confidence, "high");
  assert.equal(skewArbitration.source, "reconciled");
  assert.equal(
    enforceSpanCapabilityOnArbitration({
      arbitration: skewArbitration,
      spanClassification: skewClassification,
    }).decision,
    "editable",
  );

  const nativeOnlySkew = enforceSpanCapabilityOnArbitration({
    arbitration: {
      pdfJsRunIndex: 0,
      decision: "editable",
      nativeSpanKey: skewed.key,
      source: "native-only-safe-synthesis",
      reason: "Native-only geometry is not independent proof.",
    },
    spanClassification: skewClassification,
  });
  assert.equal(nativeOnlySkew.decision, "view-only");
});

test("classifier detects vertical Type0 text from retained font CMap evidence", () => {
  const [span] = buildNativeContentStreamSpans({
    operators: [located({ bytes: new Uint8Array([0, 3]) })],
    viewportTransform: viewport,
    pageWidthPt: 612,
    pageHeightPt: 792,
    resolveFontProfile: () =>
      profile({
        kind: "Type0",
        bytesPerCode: 2,
        embeddedProgramByteLength: 4096,
        embeddedProgramSha256: "a".repeat(64),
        resolvedFont: {
          ...profile().resolvedFont,
          kind: "Type0",
          bytesPerCode: 2,
          glyphCodeToUnicode: new Map([[3, "Hi"]]),
          unicodeToGlyphCode: new Map([["Hi", 3]]),
        },
        metrics: {
          bytesPerCode: 2,
          defaultWidth: 1000,
          glyphWidths: new Map([[3, 1000]]),
          source: "Widths",
        },
        resourceIdentity: {
          ...profile().resourceIdentity,
          type0Encoding: "Identity-V",
          writingMode: "vertical",
          descendantSubtype: "CIDFontType2",
        },
      }),
  });

  const classification = classifyNativeTextSpan(span);
  assert.equal(classification.category, "VERTICAL_TEXT");
  assert.equal(classification.safelyRewritable, false);
  assert.equal(
    classification.authorization,
    "needs-vertical-writer-proof",
  );

  const reconciled = enforceSpanCapabilityOnArbitration({
    arbitration: {
      pdfJsRunIndex: 0,
      decision: "editable",
      nativeSpanKey: span.key,
      source: "reconciled",
      reason: "Exact text and measured geometry agree.",
    },
    spanClassification: classification,
  });
  assert.equal(reconciled.decision, "editable");

  const unmeasured = enforceSpanCapabilityOnArbitration({
    arbitration: {
      pdfJsRunIndex: 0,
      decision: "editable",
      nativeSpanKey: span.key,
      source: "native-only-safe-synthesis",
      reason: "Native-only geometry is not independent proof.",
    },
    spanClassification: classification,
  });
  assert.equal(unmeasured.decision, "view-only");
});

test("classifier refuses unknown encoding and clipping instead of claiming safe editability", () => {
  const encodingLimited = buildNativeContentStreamSpans({
    operators: [located()],
    viewportTransform: viewport,
    pageWidthPt: 612,
    pageHeightPt: 792,
    resolveFontProfile: () =>
      profile({
        encodingSource: "Unknown",
        resolvedFont: {
          ...profile().resolvedFont,
          encodingSource: "Unknown",
          glyphCodeToUnicode: new Map(),
          unicodeToGlyphCode: new Map(),
        },
      }),
  })[0];
  assert.equal(
    classifyNativeTextSpan(encodingLimited).category,
    "NATIVE_TEXT_WITH_ENCODING_LIMITATIONS",
  );
  assert.equal(classifyNativeTextSpan(encodingLimited).safelyRewritable, false);

  const invisible = buildNativeContentStreamSpans({
    operators: [located({ renderMode: 3 })],
    viewportTransform: viewport,
    pageWidthPt: 612,
    pageHeightPt: 792,
    resolveFontProfile: () => profile(),
  })[0];
  const invisibleClassification = classifyNativeTextSpan(invisible);
  assert.equal(invisibleClassification.category, "INVISIBLE_TEXT_LAYER");
  assert.equal(invisibleClassification.safelyRewritable, false);
  assert.equal(invisibleClassification.authorization, "blocked");

  const invisibleArbitration = enforceSpanCapabilityOnArbitration({
    arbitration: {
      pdfJsRunIndex: 0,
      decision: "editable",
      nativeSpanKey: invisible.key,
      source: "reconciled",
      reason: "Strong visible/native identity agreement.",
    },
    spanClassification: invisibleClassification,
  });
  assert.equal(invisibleArbitration.decision, "view-only");
  assert.equal(invisibleArbitration.source, "conflict");
  assert.match(invisibleArbitration.reason, /invisible|rendering mode 3/i);

  for (const transparentOperator of [
    located({ renderMode: 0, fillOpacity: 0 }),
    located({ renderMode: 1, strokeOpacity: 0 }),
    located({ renderMode: 2, fillOpacity: 0, strokeOpacity: 0 }),
  ]) {
    const transparent = buildNativeContentStreamSpans({
      operators: [transparentOperator],
      viewportTransform: viewport,
      pageWidthPt: 612,
      pageHeightPt: 792,
      resolveFontProfile: () => profile(),
    })[0];
    const transparentClassification = classifyNativeTextSpan(transparent);
    assert.equal(transparentClassification.category, "INVISIBLE_TEXT_LAYER");
    assert.equal(transparentClassification.safelyRewritable, false);
    assert.equal(transparentClassification.authorization, "blocked");
    assert.match(transparentClassification.reason, /zero effective alpha/i);
  }

  const partlyVisible = buildNativeContentStreamSpans({
    operators: [located({ renderMode: 2, fillOpacity: 0, strokeOpacity: 1 })],
    viewportTransform: viewport,
    pageWidthPt: 612,
    pageHeightPt: 792,
    resolveFontProfile: () => profile(),
  })[0];
  assert.notEqual(
    classifyNativeTextSpan(partlyVisible).category,
    "INVISIBLE_TEXT_LAYER",
  );

  const clipped = buildNativeContentStreamSpans({
    operators: [located({ renderMode: 7 })],
    viewportTransform: viewport,
    pageWidthPt: 612,
    pageHeightPt: 792,
    // Model the real standard-font fixture: deterministic widths exist, but
    // the PDF does not expose descriptor ascent/descent.
    resolveFontProfile: () =>
      profile({
        ascentRatio: null,
        descentRatio: null,
      }),
  })[0];
  assert.equal(classifyNativeTextSpan(clipped).category, "CLIPPED_TEXT");
  assert.equal(classifyNativeTextSpan(clipped).safelyRewritable, false);

  // Clipping changes rewrite safety, not the ability to locate the native
  // glyph box. Missing vertical font metrics may use the explicit approximate
  // display box, but that confidence can never authorize an edit.
  assert.equal(clipped.geometryConfidence, "fallback-box");
  assert.ok(clipped.detectedRun);
  assert.match(clipped.limitationReason ?? "", /clipping rendering mode/i);
  const [clippedRun] = nativeDetectedRuns([clipped]);
  assert.ok(clippedRun);

  const [arbitration] = buildTextEditArbitrations({
    runs: [clippedRun],
    reconciliations: [],
    nativeSpans: [clipped],
  });
  assert.equal(arbitration.decision, "view-only");
  assert.equal(arbitration.nativeSpanKey, clipped.key);
});

test("missing ascent/descent exposes approximate native geometry but remains font-limited and read-only", () => {
  const [span] = buildNativeContentStreamSpans({
    operators: [located()],
    viewportTransform: viewport,
    pageWidthPt: 612,
    pageHeightPt: 792,
    resolveFontProfile: () =>
      profile({
        ascentRatio: null,
        descentRatio: null,
      }),
  });

  assert.equal(span.geometryConfidence, "fallback-box");
  assert.ok(span.detectedRun);
  assert.equal(span.detectedRun.ascentRatio, 0.85);
  assert.equal(span.detectedRun.descentRatio, -0.15);
  assert.match(span.limitationReason ?? "", /approximate fallback/i);

  const classification = classifyNativeTextSpan(span);
  assert.equal(classification.category, "NATIVE_TEXT_WITH_FONT_LIMITATIONS");
  assert.equal(classification.safelyRewritable, false);
  assert.equal(classification.authorization, "needs-measured-reconciliation");

  const [run] = nativeDetectedRuns([span]);
  assert.ok(run);
  const [arbitration] = buildTextEditArbitrations({
    runs: [run],
    reconciliations: [],
    nativeSpans: [span],
  });
  assert.equal(arbitration.decision, "view-only");
});

test("measured PDF.js/native reconciliation can satisfy fallback-box geometry without promoting native-only fallback", () => {
  const [span] = buildNativeContentStreamSpans({
    operators: [located()],
    viewportTransform: viewport,
    pageWidthPt: 612,
    pageHeightPt: 792,
    resolveFontProfile: () =>
      profile({
        ascentRatio: null,
        descentRatio: null,
      }),
  });

  const run = {
    str: "Hi",
    fontName: "g_d0_f1",
    xPct: 10,
    yPct: 10,
    widthPct: 2,
    heightPct: 2,
    fontSizePt: 12,
    rotated: false,
    baselineXPct: 10,
    baselineYPct: 11.5,
    ascentRatio: 0.8,
    descentRatio: -0.2,
    pdfJsTransform: [12, 0, 0, 12, 72, 700],
    detectionSource: "pdfjs" as const,
  };

  const reconciliations = reconcileTextSignals({
    runs: [run],
    legacyMatches: [{ locatedOperator: span.locatedOperator, operator: span.locatedOperator.operator }],
    nativeSpans: [span],
    viewportTransform: viewport,
  });
  const [arbitration] = buildTextEditArbitrations({
    runs: [run],
    reconciliations,
    nativeSpans: [span],
  });

  assert.equal(reconciliations[0].confidence, "high");
  assert.notEqual(reconciliations[0].baselineDistancePt, null);
  assert.notEqual(reconciliations[0].angleDeltaDeg, null);
  assert.equal(arbitration.decision, "editable");
  assert.equal(arbitration.source, "reconciled");

  const guarded = enforceSpanCapabilityOnArbitration({
    arbitration,
    spanClassification: classifyNativeTextSpan(span),
  });
  assert.equal(guarded.decision, "editable");
  assert.equal(guarded.source, "reconciled");
});

test("capability guard keeps reconciled clipping text read-only and preserves safe native text", () => {
  const clipped = buildNativeContentStreamSpans({
    operators: [located({ renderMode: 4 })],
    viewportTransform: viewport,
    pageWidthPt: 612,
    pageHeightPt: 792,
    resolveFontProfile: () => profile(),
  })[0];
  const safe = buildNativeContentStreamSpans({
    operators: [located({ renderMode: 0 })],
    viewportTransform: viewport,
    pageWidthPt: 612,
    pageHeightPt: 792,
    resolveFontProfile: () => profile(),
  })[0];

  const reconciled = {
    pdfJsRunIndex: 0,
    decision: "editable" as const,
    nativeSpanKey: clipped.key,
    source: "reconciled" as const,
    reason: "Strong Unicode and geometry agreement.",
  };

  const clippedGuard = enforceSpanCapabilityOnArbitration({
    arbitration: reconciled,
    spanClassification: classifyNativeTextSpan(clipped),
  });
  assert.equal(clippedGuard.decision, "view-only");
  assert.equal(clippedGuard.source, "conflict");
  assert.match(clippedGuard.reason, /capability classification/i);
  assert.match(clippedGuard.reason, /clipping/i);

  const safeGuard = enforceSpanCapabilityOnArbitration({
    arbitration: {
      ...reconciled,
      nativeSpanKey: safe.key,
    },
    spanClassification: classifyNativeTextSpan(safe),
  });
  assert.equal(safeGuard.decision, "editable");
  assert.equal(safeGuard.source, "reconciled");

  const missingClassificationGuard = enforceSpanCapabilityOnArbitration({
    arbitration: {
      ...reconciled,
      nativeSpanKey: safe.key,
    },
    spanClassification: null,
  });
  assert.equal(missingClassificationGuard.decision, "view-only");
  assert.equal(missingClassificationGuard.source, "conflict");
  assert.match(missingClassificationGuard.reason, /classification is missing/i);
});

test("page classifier distinguishes native-only evidence from an unsupported empty page", () => {
  const [span] = buildNativeContentStreamSpans({
    operators: [located({ kind: "TJ" })],
    viewportTransform: viewport,
    pageWidthPt: 612,
    pageHeightPt: 792,
    resolveFontProfile: () => profile(),
  });
  const classifier = new DocumentTextCapabilityClassifier();

  const nativePage = classifier.classifyPage({
    nativeSpans: [span],
    pdfJsRunCount: 0,
    reconciliations: [],
  });
  assert.equal(nativePage.category, "NATIVE_TEXT");
  assert.equal(nativePage.nativeOnlySpanCount, 1);

  const unknownPage = classifier.classifyPage({
    nativeSpans: [],
    pdfJsRunCount: 0,
    reconciliations: [],
  });
  assert.equal(unknownPage.category, "UNKNOWN_OR_UNSAFE");
});
