import type { PdfPaintColor } from "./contentStream.ts";
import type { PdfTextSpan } from "./documentModel.ts";

export type NativeTextMixedValue<T> =
  | { state: "single"; value: T }
  | { state: "mixed"; value: null };

export type NativeTextSelectionStyleSummary = {
  spanCount: number;
  fontFamily: NativeTextMixedValue<string>;
  weight: NativeTextMixedValue<number>;
  italic: NativeTextMixedValue<boolean>;
  fontSizePt: NativeTextMixedValue<number>;
  charSpacingPt: NativeTextMixedValue<number>;
  wordSpacingPt: NativeTextMixedValue<number>;
  horizontalScalingPct: NativeTextMixedValue<number>;
  fillColor: NativeTextMixedValue<PdfPaintColor | null>;
  renderingMode: NativeTextMixedValue<number>;
  hasMixedValues: boolean;
};

const NUMBER_EPSILON = 1e-6;

function numbersEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= NUMBER_EPSILON;
}

function colorsEqual(
  left: PdfPaintColor | null,
  right: PdfPaintColor | null,
): boolean {
  if (left === null || right === null) return left === right;
  if (left.colorSpace !== right.colorSpace) return false;
  if ((left.cssHex ?? "").toLowerCase() !== (right.cssHex ?? "").toLowerCase()) {
    return false;
  }
  if (left.components.length !== right.components.length) return false;
  return left.components.every((component, index) =>
    numbersEqual(component, right.components[index] ?? Number.NaN),
  );
}

function summarize<T>(
  values: readonly T[],
  equal: (left: T, right: T) => boolean = Object.is,
): NativeTextMixedValue<T> {
  const first = values[0];
  if (values.length === 0 || first === undefined) {
    throw new Error("Cannot summarize an empty native text style selection.");
  }
  return values.every((value) => equal(first, value))
    ? { state: "single", value: first }
    : { state: "mixed", value: null };
}

function fontLabel(span: Pick<PdfTextSpan, "style">): string {
  return span.style.fontFamily || span.style.baseFont || "PDF font";
}

/**
 * Derives the formatting state for a logical multi-span PDF selection.
 *
 * This is display/state truth only. It never authorizes a write and it never
 * collapses differing span styles to the first span. A later uniform-style
 * write must still pass each span through the existing native writer safety
 * checks independently.
 */
export function summarizeNativeTextSelectionStyles(
  spans: readonly Pick<PdfTextSpan, "style">[],
): NativeTextSelectionStyleSummary {
  if (spans.length === 0) {
    throw new Error("At least one PDF text span is required.");
  }

  const summary: NativeTextSelectionStyleSummary = {
    spanCount: spans.length,
    fontFamily: summarize(spans.map(fontLabel)),
    weight: summarize(spans.map((span) => span.style.weight)),
    italic: summarize(spans.map((span) => span.style.italic)),
    fontSizePt: summarize(
      spans.map((span) => span.style.fontSizePt),
      numbersEqual,
    ),
    charSpacingPt: summarize(
      spans.map((span) => span.style.charSpacingPt),
      numbersEqual,
    ),
    wordSpacingPt: summarize(
      spans.map((span) => span.style.wordSpacingPt),
      numbersEqual,
    ),
    horizontalScalingPct: summarize(
      spans.map((span) => span.style.horizontalScalingPct),
      numbersEqual,
    ),
    fillColor: summarize(
      spans.map((span) => span.style.fillColor),
      colorsEqual,
    ),
    renderingMode: summarize(spans.map((span) => span.style.renderingMode)),
    hasMixedValues: false,
  };

  summary.hasMixedValues = [
    summary.fontFamily,
    summary.weight,
    summary.italic,
    summary.fontSizePt,
    summary.charSpacingPt,
    summary.wordSpacingPt,
    summary.horizontalScalingPct,
    summary.fillColor,
    summary.renderingMode,
  ].some((value) => value.state === "mixed");

  return summary;
}
