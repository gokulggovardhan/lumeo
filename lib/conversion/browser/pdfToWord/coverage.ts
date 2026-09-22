import type { ReconstructedTextLine } from "./types.ts";

function normalizedCharacters(value: string): string[] {
  return Array.from(
    value
      .normalize("NFKC")
      .replace(/[\s\u00AD\u200B-\u200D\uFEFF]+/gu, ""),
  );
}

function sameCharacterMultiset(a: string, b: string): boolean {
  const left = normalizedCharacters(a);
  const right = normalizedCharacters(b);
  if (left.length !== right.length) return false;

  const counts = new Map<string, number>();
  for (const char of left) counts.set(char, (counts.get(char) ?? 0) + 1);
  for (const char of right) {
    const remaining = counts.get(char) ?? 0;
    if (remaining <= 0) return false;
    if (remaining === 1) counts.delete(char);
    else counts.set(char, remaining - 1);
  }
  return counts.size === 0;
}

function verticalAffinity(
  visible: ReconstructedTextLine,
  source: ReconstructedTextLine,
): boolean {
  const visibleCenter = visible.yPt + visible.heightPt / 2;
  const sourceCenter = source.yPt + source.heightPt / 2;
  const tolerance = Math.max(
    2,
    visible.heightPt * 0.7,
    source.heightPt * 0.7,
    Math.min(visible.fontSizePt, source.fontSizePt) * 0.45,
  );
  return Math.abs(visibleCenter - sourceCenter) <= tolerance;
}

function horizontalAffinity(
  visible: ReconstructedTextLine,
  source: ReconstructedTextLine,
): boolean {
  const padding = Math.max(2, visible.fontSizePt * 0.35);
  const left = visible.xPt - padding;
  const right = visible.xPt + visible.widthPt + padding;
  const sourceLeft = source.xPt;
  const sourceRight = source.xPt + source.widthPt;
  return sourceRight >= left && sourceLeft <= right;
}

function candidateTextForVisibleRun(
  visible: ReconstructedTextLine,
  sourceLines: ReconstructedTextLine[],
): string {
  return sourceLines
    .filter(
      (source) =>
        verticalAffinity(visible, source) &&
        horizontalAffinity(visible, source),
    )
    .sort((a, b) => a.xPt - b.xPt)
    .map((line) => line.text)
    .join("");
}

export type OperatorCoverageAssessment = {
  explainedVisibleRuns: number;
  totalVisibleRuns: number;
  visibleRunCoverageRatio: number;
  characterCoverageRatio: number;
  safeToUseOperatorRuns: boolean;
};

/**
 * Source-operator reconstruction is allowed to replace PDF.js reconstruction
 * only when it accounts for every visible PDF.js text run on the page.
 *
 * PDF.js may merge several independent same-baseline operators into one
 * TextItem, and their textual order may not match geometric left-to-right
 * order. Comparing character multisets within the same visual region proves
 * that no visible characters disappeared without forcing source-stream order
 * to become Word reading order.
 */
export function assessOperatorRunCoverage(
  visibleLines: ReconstructedTextLine[],
  sourceLines: ReconstructedTextLine[],
): OperatorCoverageAssessment {
  const visible = visibleLines.filter((line) => line.text.trim().length > 0);
  if (visible.length === 0) {
    return {
      explainedVisibleRuns: sourceLines.length > 0 ? 0 : 0,
      totalVisibleRuns: 0,
      visibleRunCoverageRatio: sourceLines.length > 0 ? 1 : 0,
      characterCoverageRatio: sourceLines.length > 0 ? 1 : 0,
      safeToUseOperatorRuns: sourceLines.length > 0,
    };
  }

  let explainedVisibleRuns = 0;
  let explainedCharacters = 0;
  let totalCharacters = 0;

  for (const line of visible) {
    const normalizedLength = normalizedCharacters(line.text).length;
    totalCharacters += normalizedLength;
    const sourceText = candidateTextForVisibleRun(line, sourceLines);
    if (sameCharacterMultiset(line.text, sourceText)) {
      explainedVisibleRuns += 1;
      explainedCharacters += normalizedLength;
    }
  }

  const visibleRunCoverageRatio = explainedVisibleRuns / visible.length;
  const characterCoverageRatio =
    totalCharacters > 0 ? explainedCharacters / totalCharacters : 1;

  return {
    explainedVisibleRuns,
    totalVisibleRuns: visible.length,
    visibleRunCoverageRatio,
    characterCoverageRatio,
    safeToUseOperatorRuns:
      sourceLines.length > 0 &&
      explainedVisibleRuns === visible.length &&
      characterCoverageRatio === 1,
  };
}
