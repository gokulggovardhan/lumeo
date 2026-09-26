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
  reconcileTextSignals,
  reconciliationMatchMap,
} from "../lib/pdf/edit/textReconciliation.ts";
import {
  DocumentTextCapabilityClassifier,
  classifyNativeTextSpan,
} from "../lib/pdf/edit/textCapabilityClassifier.ts";

const viewport = [1, 0, 0, -1, 0, 792];

function located({
  kind = "Tj",
  bytes = new Uint8Array([72, 105]),
  renderMode = 0,
  locator = { kind: "page", contentStreamIndex: 0 } as const,
  operatorIndex = 2,
  textRenderingMatrix = [12, 0, 0, 12, 72, 700] as [number, number, number, number, number, number],
}: {
  kind?: "Tj" | "TJ";
  bytes?: Uint8Array;
  renderMode?: number;
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

test("classifier detects vertical Type0 text from retained font CMap evidence", () => {
  const [span] = buildNativeContentStreamSpans({
    operators: [located()],
    viewportTransform: viewport,
    pageWidthPt: 612,
    pageHeightPt: 792,
    resolveFontProfile: () =>
      profile({
        kind: "Type0",
        bytesPerCode: 2,
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

  const clipped = buildNativeContentStreamSpans({
    operators: [located({ renderMode: 7 })],
    viewportTransform: viewport,
    pageWidthPt: 612,
    pageHeightPt: 792,
    resolveFontProfile: () => profile(),
  })[0];
  assert.equal(classifyNativeTextSpan(clipped).category, "CLIPPED_TEXT");
  assert.equal(classifyNativeTextSpan(clipped).safelyRewritable, false);
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
