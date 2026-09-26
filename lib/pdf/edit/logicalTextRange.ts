import type { PdfPageTextModel, PdfTextSpan } from "./documentModel.ts";

export type LogicalTextPosition = {
  spanId: string;
  sourceRunIndex: number;
  offset: number;
};

export type LogicalTextDirection = "forward" | "backward";

export type LogicalTextRange = {
  anchor: LogicalTextPosition;
  focus: LogicalTextPosition;
  direction: LogicalTextDirection;
  sourceRunIndices: number[];
  spanIds: string[];
  text: string;
  collapsed: boolean;
};

type SegmenterLike = {
  segment(input: string): Iterable<{ index: number }>;
};

type SegmenterConstructor = new (
  locales?: string | string[],
  options?: { granularity: "grapheme" },
) => SegmenterLike;

function availableSegmenter(): SegmenterConstructor | null {
  const value = (Intl as unknown as { Segmenter?: SegmenterConstructor }).Segmenter;
  return typeof value === "function" ? value : null;
}

/**
 * Returns UTF-16 offsets at every safe grapheme boundary.
 *
 * Modern supported browsers/Node use Intl.Segmenter so emoji ZWJ sequences,
 * combining marks and Indic clusters stay indivisible. The code-point
 * fallback is intentionally conservative for older engines: it can preserve
 * surrogate pairs but cannot prove full Unicode grapheme segmentation.
 */
export function graphemeBoundaries(text: string): number[] {
  const Segmenter = availableSegmenter();
  if (Segmenter) {
    const boundaries = [0];
    const segmenter = new Segmenter(undefined, { granularity: "grapheme" });
    for (const segment of segmenter.segment(text)) {
      if (segment.index > 0 && segment.index < text.length) {
        boundaries.push(segment.index);
      }
    }
    boundaries.push(text.length);
    return [...new Set(boundaries)].sort((a, b) => a - b);
  }

  const boundaries = [0];
  let offset = 0;
  for (const codePoint of Array.from(text)) {
    offset += codePoint.length;
    boundaries.push(offset);
  }
  return boundaries;
}

function clampOffset(text: string, offset: number): number {
  if (!Number.isFinite(offset)) return 0;
  return Math.max(0, Math.min(text.length, Math.trunc(offset)));
}

export function nearestGraphemeBoundary(text: string, offset: number): number {
  const clamped = clampOffset(text, offset);
  const boundaries = graphemeBoundaries(text);
  let best = boundaries[0] ?? 0;
  let bestDistance = Math.abs(best - clamped);
  for (const boundary of boundaries) {
    const distance = Math.abs(boundary - clamped);
    if (distance < bestDistance || (distance === bestDistance && boundary > best)) {
      best = boundary;
      bestDistance = distance;
    }
  }
  return best;
}

function floorGraphemeBoundary(text: string, offset: number): number {
  const clamped = clampOffset(text, offset);
  const boundaries = graphemeBoundaries(text);
  let result = 0;
  for (const boundary of boundaries) {
    if (boundary > clamped) break;
    result = boundary;
  }
  return result;
}

function ceilGraphemeBoundary(text: string, offset: number): number {
  const clamped = clampOffset(text, offset);
  for (const boundary of graphemeBoundaries(text)) {
    if (boundary >= clamped) return boundary;
  }
  return text.length;
}

function position(span: Pick<PdfTextSpan, "id" | "sourceRunIndex">, offset: number): LogicalTextPosition {
  return {
    spanId: span.id,
    sourceRunIndex: span.sourceRunIndex,
    offset,
  };
}

export function logicalRangeForSingleSpan({
  span,
  text,
  selectionStart,
  selectionEnd,
  direction = "forward",
}: {
  span: Pick<PdfTextSpan, "id" | "sourceRunIndex">;
  text: string;
  selectionStart: number;
  selectionEnd: number;
  direction?: LogicalTextDirection;
}): LogicalTextRange {
  const rawStart = Math.min(selectionStart, selectionEnd);
  const rawEnd = Math.max(selectionStart, selectionEnd);
  const collapsed = rawStart === rawEnd;

  const start = collapsed
    ? nearestGraphemeBoundary(text, rawStart)
    : floorGraphemeBoundary(text, rawStart);
  const end = collapsed
    ? start
    : ceilGraphemeBoundary(text, rawEnd);

  const anchorOffset = direction === "backward" ? end : start;
  const focusOffset = direction === "backward" ? start : end;

  return {
    anchor: position(span, anchorOffset),
    focus: position(span, focusOffset),
    direction,
    sourceRunIndices: [span.sourceRunIndex],
    spanIds: [span.id],
    text: text.slice(start, end),
    collapsed: start === end,
  };
}

function spanForRun(model: PdfPageTextModel, sourceRunIndex: number): PdfTextSpan | null {
  return model.spans.find((span) => span.sourceRunIndex === sourceRunIndex) ?? null;
}

/**
 * Converts the existing full-run Shift selection into a PDF-model-owned
 * logical range. This is intentionally full-span only for cross-span
 * selections; partial cross-span editing remains blocked until the writer
 * can prove partial operator boundaries safely.
 */
export function logicalRangeForFullRunSelection(
  model: PdfPageTextModel,
  anchorRunIndex: number,
  focusRunIndex: number,
): LogicalTextRange | null {
  const anchorSpan = spanForRun(model, anchorRunIndex);
  const focusSpan = spanForRun(model, focusRunIndex);
  if (!anchorSpan || !focusSpan) return null;

  const direction: LogicalTextDirection =
    focusRunIndex < anchorRunIndex ? "backward" : "forward";
  const startIndex = Math.min(anchorRunIndex, focusRunIndex);
  const endIndex = Math.max(anchorRunIndex, focusRunIndex);
  const spans: PdfTextSpan[] = [];

  for (let sourceRunIndex = startIndex; sourceRunIndex <= endIndex; sourceRunIndex += 1) {
    const span = spanForRun(model, sourceRunIndex);
    if (!span) return null;
    spans.push(span);
  }

  const sourceRunIndices = spans.map((span) => span.sourceRunIndex);
  const spanIds = spans.map((span) => span.id);
  const text = spans.map((span) => span.text).join("");

  return direction === "forward"
    ? {
        anchor: position(anchorSpan, 0),
        focus: position(focusSpan, focusSpan.text.length),
        direction,
        sourceRunIndices,
        spanIds,
        text,
        collapsed: false,
      }
    : {
        anchor: position(anchorSpan, anchorSpan.text.length),
        focus: position(focusSpan, 0),
        direction,
        sourceRunIndices,
        spanIds,
        text,
        collapsed: false,
      };
}

export function orderedSingleSpanOffsets(
  range: LogicalTextRange | null,
  spanId: string,
): { start: number; end: number; direction: LogicalTextDirection } | null {
  if (!range || range.anchor.spanId !== spanId || range.focus.spanId !== spanId) {
    return null;
  }
  return {
    start: Math.min(range.anchor.offset, range.focus.offset),
    end: Math.max(range.anchor.offset, range.focus.offset),
    direction: range.direction,
  };
}

export function logicalRangeCoversWholeSpans(
  range: LogicalTextRange | null,
  model: PdfPageTextModel,
): boolean {
  if (!range || range.sourceRunIndices.length === 0) return false;
  const first = spanForRun(model, range.sourceRunIndices[0]);
  const last = spanForRun(model, range.sourceRunIndices[range.sourceRunIndices.length - 1]);
  if (!first || !last) return false;

  const orderedStart =
    range.direction === "forward" ? range.anchor : range.focus;
  const orderedEnd =
    range.direction === "forward" ? range.focus : range.anchor;

  return (
    orderedStart.spanId === first.id &&
    orderedStart.offset === 0 &&
    orderedEnd.spanId === last.id &&
    orderedEnd.offset === last.text.length
  );
}
