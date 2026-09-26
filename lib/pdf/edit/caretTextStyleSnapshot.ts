import type { Matrix2x3, PdfPaintColor } from "./contentStream.ts";
import type { PdfTextGeometryConfidence, PdfTextSpan } from "./documentModel.ts";
import type { EmbeddedGlyphEvidence, ResolvedFont } from "./fontEncoding.ts";
import type { FontMetrics } from "./fontMetrics.ts";
import type { LocatedTextOperator, StreamLocator } from "./formXObjects.ts";
import type { FallbackStyleHints } from "./fallbackFont.ts";
import { buildEditPlan, type EditPlan } from "./editPlan.ts";

export type CaretTextStyleSnapshot = {
  version: 1;
  spanId: string;
  pageIndex: number;
  originalText: string;
  target: {
    locator: StreamLocator;
    operatorIndex: number;
    fontResourceName: string | null;
  };
  font: {
    familyName: string;
    baseFont: string;
    embedded: boolean;
    subset: boolean;
    fontObjectRef: string | null;
    fontProgramSha256: string | null;
  };
  textState: {
    fontSizePt: number;
    charSpacing: number;
    wordSpacing: number;
    horizontalScalingPct: number;
    textRisePt: number;
    renderMode: number;
  };
  paint: {
    fillColor: PdfPaintColor | null;
    strokeColor: PdfPaintColor | null;
    fillOpacity: number | null;
    strokeOpacity: number | null;
  };
  geometry: {
    boundsPct: {
      xPct: number;
      yPct: number;
      widthPct: number;
      heightPct: number;
    };
    baselinePt: number;
    sourceMatrix: Matrix2x3 | null;
    rotationDeg: number;
    confidence: PdfTextGeometryConfidence;
  };
};

export type CaretRetypeValidation =
  | { valid: true }
  | { valid: false; reason: string };

export type CaretRetypePlanResult =
  | { kind: "planned"; plan: EditPlan }
  | { kind: "blocked"; reason: string };

function clonePaint(color: PdfPaintColor | null | undefined): PdfPaintColor | null {
  return color
    ? {
        colorSpace: color.colorSpace,
        components: [...color.components],
        cssHex: color.cssHex,
      }
    : null;
}

function cloneLocator(locator: StreamLocator): StreamLocator {
  return locator.kind === "page"
    ? { kind: "page", contentStreamIndex: locator.contentStreamIndex }
    : { kind: "xobject", formPath: [...locator.formPath] };
}

function sameLocator(a: StreamLocator, b: StreamLocator): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "page" && b.kind === "page") {
    return a.contentStreamIndex === b.contentStreamIndex;
  }
  if (a.kind === "xobject" && b.kind === "xobject") {
    return (
      a.formPath.length === b.formPath.length &&
      a.formPath.every((part, index) => part === b.formPath[index])
    );
  }
  return false;
}

function sameNumber(a: number | null | undefined, b: number | null | undefined): boolean {
  if (a === null || a === undefined || b === null || b === undefined) {
    return (a ?? null) === (b ?? null);
  }
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 1e-9;
}

function sameMatrix(a: Matrix2x3 | null, b: Matrix2x3 | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  return a.every((value, index) => sameNumber(value, b[index]));
}

function samePaint(a: PdfPaintColor | null, b: PdfPaintColor | null | undefined): boolean {
  const right = b ?? null;
  if (!a || !right) return a === right;
  return (
    a.colorSpace === right.colorSpace &&
    a.cssHex === right.cssHex &&
    a.components.length === right.components.length &&
    a.components.every((value, index) => sameNumber(value, right.components[index]))
  );
}

/**
 * Captures the exact native style/resource/geometry intent the moment a
 * single editable span is emptied in the inline editor. This is browser-local
 * state only; it never serializes font bytes or sends document content away.
 */
export function captureCaretTextStyleSnapshot({
  span,
  locatedOperator,
}: {
  span: PdfTextSpan;
  locatedOperator: LocatedTextOperator;
}): CaretTextStyleSnapshot {
  const operator = locatedOperator.operator;
  return {
    version: 1,
    spanId: span.id,
    pageIndex: span.pageIndex,
    originalText: span.text,
    target: {
      locator: cloneLocator(locatedOperator.locator),
      operatorIndex: locatedOperator.operatorIndex,
      fontResourceName: operator.fontResourceName,
    },
    font: {
      familyName: span.style.fontFamily,
      baseFont: span.style.baseFont,
      embedded: span.style.embedded,
      subset: span.style.subset,
      fontObjectRef: span.fontProfile?.resourceIdentity.fontObjectRef ?? null,
      fontProgramSha256: span.fontProfile?.embeddedProgramSha256 ?? null,
    },
    textState: {
      fontSizePt: operator.fontSizePt,
      charSpacing: operator.charSpacing,
      wordSpacing: operator.wordSpacing,
      horizontalScalingPct: operator.horizontalScalingPct,
      textRisePt: operator.textRise,
      renderMode: operator.renderMode,
    },
    paint: {
      fillColor: clonePaint(operator.fillColor),
      strokeColor: clonePaint(operator.strokeColor),
      fillOpacity: operator.fillOpacity ?? null,
      strokeOpacity: operator.strokeOpacity ?? null,
    },
    geometry: {
      boundsPct: { ...span.boundsPct },
      baselinePt: span.baselinePt,
      sourceMatrix: span.sourceMatrix ? [...span.sourceMatrix] as Matrix2x3 : null,
      rotationDeg: span.rotationDeg,
      confidence: span.geometryConfidence,
    },
  };
}

/**
 * A snapshot never overrides contradictory live PDF evidence. It only
 * preserves style intent while the exact same native operator remains the
 * target. If resource scope, text state, paint or source matrix changed, the
 * retype is blocked and must be reselected/re-resolved from the PDF.
 */
export function validateCaretTextStyleSnapshot(
  snapshot: CaretTextStyleSnapshot,
  locatedOperator: LocatedTextOperator,
): CaretRetypeValidation {
  const operator = locatedOperator.operator;

  if (!sameLocator(snapshot.target.locator, locatedOperator.locator)) {
    return { valid: false, reason: "The original text resource scope changed after the caret style was captured." };
  }
  if (snapshot.target.operatorIndex !== locatedOperator.operatorIndex) {
    return { valid: false, reason: "The original native text operator could not be identified at the same index." };
  }
  if (snapshot.target.fontResourceName !== operator.fontResourceName) {
    return { valid: false, reason: "The original PDF font resource changed after the caret style was captured." };
  }
  if (
    !sameNumber(snapshot.textState.fontSizePt, operator.fontSizePt) ||
    !sameNumber(snapshot.textState.charSpacing, operator.charSpacing) ||
    !sameNumber(snapshot.textState.wordSpacing, operator.wordSpacing) ||
    !sameNumber(snapshot.textState.horizontalScalingPct, operator.horizontalScalingPct) ||
    !sameNumber(snapshot.textState.textRisePt, operator.textRise) ||
    !sameNumber(snapshot.textState.renderMode, operator.renderMode)
  ) {
    return { valid: false, reason: "The native PDF text state changed after the caret style was captured." };
  }
  if (
    !samePaint(snapshot.paint.fillColor, operator.fillColor) ||
    !samePaint(snapshot.paint.strokeColor, operator.strokeColor) ||
    !sameNumber(snapshot.paint.fillOpacity, operator.fillOpacity ?? null) ||
    !sameNumber(snapshot.paint.strokeOpacity, operator.strokeOpacity ?? null)
  ) {
    return { valid: false, reason: "The native PDF paint state changed after the caret style was captured." };
  }
  if (!sameMatrix(snapshot.geometry.sourceMatrix, operator.textRenderingMatrix)) {
    return { valid: false, reason: "The native PDF text transform changed after the caret style was captured." };
  }
  if (snapshot.geometry.confidence === "fallback") {
    return { valid: false, reason: "The captured caret baseline is only approximate, so retyping is not safe." };
  }
  return { valid: true };
}

export function replacementTextStateFromCaretSnapshot(
  snapshot: CaretTextStyleSnapshot,
): {
  fontSizePt: number;
  charSpacing: number;
  wordSpacing: number;
  horizontalScalingPct: number;
} {
  return {
    fontSizePt: snapshot.textState.fontSizePt,
    charSpacing: snapshot.textState.charSpacing,
    wordSpacing: snapshot.textState.wordSpacing,
    horizontalScalingPct: snapshot.textState.horizontalScalingPct,
  };
}

/**
 * Retyping after an empty draft goes back through the existing EditPlan
 * authority. The snapshot contributes intent/provenance only; glyph encoding,
 * subset coverage, PDF widths, layout and optional fallback checks remain in
 * the established planner.
 */
export function buildCaretRetypePlan({
  snapshot,
  locatedOperator,
  replacementText,
  resolvedFont,
  fontMetrics,
  embeddedGlyphEvidence = null,
  fallbackStyleHints = null,
  replacementTextState = null,
}: {
  snapshot: CaretTextStyleSnapshot;
  locatedOperator: LocatedTextOperator;
  replacementText: string;
  resolvedFont: ResolvedFont;
  fontMetrics: FontMetrics;
  embeddedGlyphEvidence?: EmbeddedGlyphEvidence | null;
  fallbackStyleHints?: FallbackStyleHints | null;
  replacementTextState?: {
    fontSizePt?: number;
    charSpacing?: number;
    wordSpacing?: number;
    horizontalScalingPct?: number;
  } | null;
}): CaretRetypePlanResult {
  const validation = validateCaretTextStyleSnapshot(snapshot, locatedOperator);
  if (!validation.valid) return { kind: "blocked", reason: validation.reason };

  const locator = locatedOperator.locator;
  return {
    kind: "planned",
    plan: buildEditPlan({
      pageIndex: snapshot.pageIndex,
      contentStreamIndex: locator.kind === "page" ? locator.contentStreamIndex : 0,
      formPath: locator.kind === "xobject" ? locator.formPath : null,
      operatorIndex: locatedOperator.operatorIndex,
      operator: locatedOperator.operator,
      replacementText,
      resolvedFont,
      fontMetrics,
      embeddedGlyphEvidence,
      fallbackStyleHints,
      replacementTextState:
        replacementTextState ?? replacementTextStateFromCaretSnapshot(snapshot),
    }),
  };
}
