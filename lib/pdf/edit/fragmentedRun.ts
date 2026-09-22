import type { LocatedTextOperator } from "./formXObjects.ts";
import type { ResolvedFont } from "./fontEncoding.ts";
import { decodeTextShowOperator } from "./editPlan.ts";
import type { TextShowOperator } from "./contentStream.ts";

export type FragmentedRunReconstruction = {
  contentStreamIndex: number;
  operatorIndices: number[];
  allOperators: TextShowOperator[];
  locatedOperators: LocatedTextOperator[];
  originalText: string;
  fontResourceName: string;
  resources: LocatedTextOperator["resources"];
};

const MAX_FRAGMENT_OPERATORS = 8;
const MATRIX_EPSILON = 1e-6;

function sameNumber(a: number, b: number): boolean {
  return Math.abs(a - b) <= MATRIX_EPSILON;
}

function sameTextState(a: TextShowOperator, b: TextShowOperator): boolean {
  return (
    a.fontResourceName === b.fontResourceName &&
    sameNumber(a.fontSizePt, b.fontSizePt) &&
    sameNumber(a.charSpacing, b.charSpacing) &&
    sameNumber(a.wordSpacing, b.wordSpacing) &&
    sameNumber(a.horizontalScalingPct, b.horizontalScalingPct) &&
    sameNumber(a.textRise, b.textRise) &&
    a.renderMode === b.renderMode &&
    sameNumber(a.textRenderingMatrix[0], b.textRenderingMatrix[0]) &&
    sameNumber(a.textRenderingMatrix[1], b.textRenderingMatrix[1]) &&
    sameNumber(a.textRenderingMatrix[2], b.textRenderingMatrix[2]) &&
    sameNumber(a.textRenderingMatrix[3], b.textRenderingMatrix[3])
  );
}

function isIgnorableGap(bytes: Uint8Array, start: number, end: number): boolean {
  let index = start;
  while (index < end) {
    const byte = bytes[index];
    // PDF whitespace: NUL, HT, LF, FF, CR, SP.
    if (byte === 0 || byte === 9 || byte === 10 || byte === 12 || byte === 13 || byte === 32) {
      index += 1;
      continue;
    }
    // PDF comment: '%' through the next CR/LF.
    if (byte === 0x25) {
      index += 1;
      while (index < end && bytes[index] !== 10 && bytes[index] !== 13) index += 1;
      continue;
    }
    return false;
  }
  return true;
}

function pageStreamOperators(
  located: readonly LocatedTextOperator[],
  contentStreamIndex: number,
): LocatedTextOperator[] {
  return located
    .filter(
      (item) =>
        item.locator.kind === "page" &&
        item.locator.contentStreamIndex === contentStreamIndex,
    )
    .sort((a, b) => a.operatorIndex - b.operatorIndex);
}

/**
 * Proves that one pdf.js visual run is actually several byte-adjacent PDF
 * text-show operators that can safely reuse the established multi-run writer.
 *
 * This intentionally refuses:
 * - Form XObjects (the current multi-run writer is page-stream only);
 * - quote operators, because they also move the text line;
 * - mixed font/text state;
 * - any intervening non-whitespace/comment content-stream operator;
 * - partial/heuristic text matches.
 *
 * A result is returned only when the decoded operator texts concatenate
 * EXACTLY to the visible pdf.js run.
 */
export function reconstructFragmentedRun({
  fullDetectedText,
  matched,
  pageOperators,
  resolvedFont,
}: {
  fullDetectedText: string;
  matched: LocatedTextOperator;
  pageOperators: readonly LocatedTextOperator[];
  resolvedFont: ResolvedFont;
}): FragmentedRunReconstruction | null {
  if (matched.locator.kind !== "page") return null;
  if (matched.operator.kind !== "Tj" && matched.operator.kind !== "TJ") return null;
  if (!matched.operator.fontResourceName) return null;

  const stream = pageStreamOperators(pageOperators, matched.locator.contentStreamIndex);
  const start = stream.findIndex(
    (item) => item.operatorIndex === matched.operatorIndex,
  );
  if (start < 0) return null;

  const first = stream[start];
  const firstDecoded = decodeTextShowOperator(first.operator, resolvedFont);
  if (!firstDecoded.allDecoded || !fullDetectedText.startsWith(firstDecoded.text)) return null;
  if (firstDecoded.text === fullDetectedText) return null;

  const chosen: LocatedTextOperator[] = [first];
  let text = firstDecoded.text;

  for (
    let position = start + 1;
    position < stream.length && chosen.length < MAX_FRAGMENT_OPERATORS;
    position += 1
  ) {
    const previous = chosen[chosen.length - 1];
    const current = stream[position];

    if (current.operatorIndex !== previous.operatorIndex + 1) break;
    if (current.operator.kind !== "Tj" && current.operator.kind !== "TJ") break;
    if (!sameTextState(first.operator, current.operator)) break;
    if (current.streamBytes !== first.streamBytes) break;
    if (!isIgnorableGap(first.streamBytes, previous.operator.end, current.operator.start)) break;

    const decoded = decodeTextShowOperator(current.operator, resolvedFont);
    if (!decoded.allDecoded) break;

    const nextText = text + decoded.text;
    if (!fullDetectedText.startsWith(nextText)) break;

    chosen.push(current);
    text = nextText;
    if (text === fullDetectedText) {
      return {
        contentStreamIndex: matched.locator.contentStreamIndex,
        operatorIndices: chosen.map((item) => item.operatorIndex),
        allOperators: stream.map((item) => item.operator),
        locatedOperators: chosen,
        originalText: text,
        fontResourceName: first.operator.fontResourceName!,
        resources: first.resources,
      };
    }
  }

  return null;
}
