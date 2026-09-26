import assert from "node:assert/strict";
import test from "node:test";
import type { PDFDict } from "pdf-lib";
import type { PdfTextSpan } from "../lib/pdf/edit/documentModel.ts";
import type { LocatedTextOperator } from "../lib/pdf/edit/formXObjects.ts";
import type { ResolvedFont } from "../lib/pdf/edit/fontEncoding.ts";
import type { FontMetrics } from "../lib/pdf/edit/fontMetrics.ts";
import {
  buildCaretRetypePlan,
  captureCaretTextStyleSnapshot,
  replacementTextStateFromCaretSnapshot,
  validateCaretTextStyleSnapshot,
} from "../lib/pdf/edit/caretTextStyleSnapshot.ts";

function asciiFont(chars: string): {
  resolvedFont: ResolvedFont;
  fontMetrics: FontMetrics;
} {
  const glyphCodeToUnicode = new Map<number, string>();
  const unicodeToGlyphCode = new Map<string, number>();
  const glyphWidths = new Map<number, number>();
  for (const char of new Set(chars)) {
    const code = char.charCodeAt(0);
    glyphCodeToUnicode.set(code, char);
    unicodeToGlyphCode.set(char, code);
    glyphWidths.set(code, 500);
  }
  return {
    resolvedFont: {
      kind: "TrueType",
      baseFont: "DemoSans",
      isEmbedded: false,
      isSubset: false,
      bytesPerCode: 1,
      encodingSource: "WinAnsi",
      glyphCodeToUnicode,
      unicodeToGlyphCode,
    },
    fontMetrics: {
      bytesPerCode: 1,
      defaultWidth: 500,
      glyphWidths,
      source: "Widths",
    },
  };
}

function located(text = "Invoice"): LocatedTextOperator {
  return {
    locator: { kind: "page", contentStreamIndex: 0 },
    operatorIndex: 4,
    operator: {
      kind: "Tj",
      start: 20,
      end: 40,
      strings: [Uint8Array.from([...text].map((char) => char.charCodeAt(0)))],
      fontResourceName: "F1",
      fontSizePt: 12,
      textRenderingMatrix: [12, 0, 0, 12, 72, 700],
      textObjectIndex: 0,
      textMatrix: [1, 0, 0, 1, 72, 700],
      textLineMatrix: [1, 0, 0, 1, 72, 700],
      ctm: [1, 0, 0, 1, 0, 0],
      charSpacing: 0.25,
      wordSpacing: 1.5,
      horizontalScalingPct: 97,
      leading: 14,
      textRise: 2,
      renderMode: 0,
      fillColor: {
        colorSpace: "DeviceRGB",
        components: [0.2, 0.4, 0.6],
        cssHex: "#336699",
      },
      strokeColor: {
        colorSpace: "DeviceGray",
        components: [0.25],
        cssHex: "#404040",
      },
      fillOpacity: 0.8,
      strokeOpacity: 0.7,
    },
    streamBytes: new Uint8Array(),
    resources: {} as PDFDict,
  };
}

function span(): PdfTextSpan {
  return {
    id: "p0-span-0",
    pageIndex: 0,
    sourceRunIndex: 0,
    originalText: "Invoice",
    text: "Invoice",
    boundsPct: { xPct: 10, yPct: 10, widthPct: 12, heightPct: 2 },
    boundsPt: { xPt: 61.2, yPt: 79.2, widthPt: 73.44, heightPt: 15.84 },
    baselinePt: 92,
    geometryConfidence: "exact",
    sourceMatrix: [12, 0, 0, 12, 72, 700],
    rotationDeg: 0,
    writingDirection: "ltr",
    sourceLocator: { kind: "page", contentStreamIndex: 0 },
    sourceOperatorIndex: 4,
    sourceOperatorKind: "Tj",
    style: {
      fontResourceName: "F1",
      fontFamily: "Demo Sans",
      fontSubtype: "TrueType",
      baseFont: "DemoSans",
      embedded: false,
      subset: false,
      fontSizePt: 12,
      weight: 400,
      italic: false,
      charSpacingPt: 0.25,
      wordSpacingPt: 1.5,
      horizontalScalingPct: 97,
      textRisePt: 2,
      renderingMode: 0,
      fillColor: {
        colorSpace: "DeviceRGB",
        components: [0.2, 0.4, 0.6],
        cssHex: "#336699",
      },
      strokeColor: {
        colorSpace: "DeviceGray",
        components: [0.25],
        cssHex: "#404040",
      },
      fillOpacity: 0.8,
      strokeOpacity: 0.7,
    },
    fontProfile: null,
    capability: "native-editable",
    capabilityReason: null,
  };
}

test("caret snapshot retains exact native resource, style, paint and geometry evidence", () => {
  const snapshot = captureCaretTextStyleSnapshot({
    span: span(),
    locatedOperator: located(),
  });

  assert.equal(snapshot.target.fontResourceName, "F1");
  assert.deepEqual(snapshot.target.locator, { kind: "page", contentStreamIndex: 0 });
  assert.equal(snapshot.target.operatorIndex, 4);
  assert.equal(snapshot.textState.fontSizePt, 12);
  assert.equal(snapshot.textState.charSpacing, 0.25);
  assert.equal(snapshot.textState.wordSpacing, 1.5);
  assert.equal(snapshot.textState.horizontalScalingPct, 97);
  assert.equal(snapshot.textState.textRisePt, 2);
  assert.equal(snapshot.paint.fillColor?.cssHex, "#336699");
  assert.equal(snapshot.paint.strokeColor?.cssHex, "#404040");
  assert.deepEqual(snapshot.geometry.sourceMatrix, [12, 0, 0, 12, 72, 700]);
  assert.equal(snapshot.geometry.confidence, "exact");
  assert.deepEqual(replacementTextStateFromCaretSnapshot(snapshot), {
    fontSizePt: 12,
    charSpacing: 0.25,
    wordSpacing: 1.5,
    horizontalScalingPct: 97,
  });
});

test("delete then retype stays in the same PDF font resource through normal EditPlan authority", () => {
  const source = located();
  const snapshot = captureCaretTextStyleSnapshot({
    span: span(),
    locatedOperator: source,
  });
  const { resolvedFont, fontMetrics } = asciiFont("InvoiceReceipt");

  const result = buildCaretRetypePlan({
    snapshot,
    locatedOperator: source,
    replacementText: "Receipt",
    resolvedFont,
    fontMetrics,
  });

  assert.equal(result.kind, "planned");
  if (result.kind !== "planned") return;
  assert.equal(result.plan.editable, true);
  assert.equal(result.plan.fontResourceName, "F1");
  assert.equal(result.plan.fallbackFont, null);
  assert.equal(result.plan.originalText, "Invoice");
  assert.equal(result.plan.replacementText, "Receipt");
  assert.equal(
    result.plan.replacementTextState,
    null,
    "snapshot text state normalizes away when it exactly matches the native operator",
  );
});

test("caret snapshot does not bypass the existing glyph-safety ladder", () => {
  const source = located();
  const snapshot = captureCaretTextStyleSnapshot({
    span: span(),
    locatedOperator: source,
  });
  const { resolvedFont, fontMetrics } = asciiFont("InvoiceReceipt");

  const result = buildCaretRetypePlan({
    snapshot,
    locatedOperator: source,
    replacementText: "Receipt🙂",
    resolvedFont,
    fontMetrics,
  });

  assert.equal(result.kind, "planned");
  if (result.kind !== "planned") return;
  assert.equal(result.plan.editable, false);
  assert.match(result.plan.reason ?? "", /verified glyph|cannot be encoded|fallback/i);
});

test("caret snapshot fails closed if the native font resource changes", () => {
  const source = located();
  const snapshot = captureCaretTextStyleSnapshot({
    span: span(),
    locatedOperator: source,
  });
  const changed = located();
  changed.operator.fontResourceName = "F2";

  const validation = validateCaretTextStyleSnapshot(snapshot, changed);
  assert.equal(validation.valid, false);
  if (validation.valid) return;
  assert.match(validation.reason, /font resource changed/i);
});

test("caret snapshot fails closed on approximate fallback baseline geometry", () => {
  const fallbackSpan = span();
  fallbackSpan.geometryConfidence = "fallback";
  const source = located();
  const snapshot = captureCaretTextStyleSnapshot({
    span: fallbackSpan,
    locatedOperator: source,
  });

  const validation = validateCaretTextStyleSnapshot(snapshot, source);
  assert.equal(validation.valid, false);
  if (validation.valid) return;
  assert.match(validation.reason, /baseline is only approximate/i);
});
