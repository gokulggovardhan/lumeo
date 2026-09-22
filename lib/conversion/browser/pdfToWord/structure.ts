import type { ReconstructedTextLine } from "./types.ts";

export type VisualTextRow = {
  baselinePt: number;
  indices: number[];
  leftPt: number;
  rightPt: number;
  topPt: number;
  bottomPt: number;
  dominantFontSizePt: number;
};

export type TableColumnAlignment = "left" | "right";

export type RegularTableEvidence = {
  rows: VisualTextRow[];
  columnAnchorsPt: number[];
  columnAlignments: TableColumnAlignment[];
  columnBoundsPt: Array<{ leftPt: number; rightPt: number }>;
  tableLineIndices: number[];
  confidence: number;
  numericColumnCount: number;
};

function baselineFor(line: ReconstructedTextLine): number {
  return line.baselinePt ?? line.yPt + line.heightPt * 0.85;
}

export function clusterVisualTextRows(
  lines: ReconstructedTextLine[],
  indices: number[] = lines.map((_line, index) => index),
): VisualTextRow[] {
  const rows: VisualTextRow[] = [];
  const ordered = [...indices]
    .filter((index) => Boolean(lines[index]) && !lines[index].visualOnly)
    .sort((a, b) => {
      const baselineDelta = baselineFor(lines[a]) - baselineFor(lines[b]);
      return Math.abs(baselineDelta) > 0.2
        ? baselineDelta
        : lines[a].xPt - lines[b].xPt;
    });

  for (const index of ordered) {
    const line = lines[index];
    const baseline = baselineFor(line);
    let best: VisualTextRow | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const row of rows) {
      const tolerance = Math.max(
        0.9,
        Math.min(row.dominantFontSizePt, line.fontSizePt) * 0.18,
      );
      const distance = Math.abs(row.baselinePt - baseline);
      if (distance <= tolerance && distance < bestDistance) {
        best = row;
        bestDistance = distance;
      }
    }

    if (!best) {
      rows.push({
        baselinePt: baseline,
        indices: [index],
        leftPt: line.xPt,
        rightPt: line.xPt + line.widthPt,
        topPt: line.yPt,
        bottomPt: line.yPt + line.heightPt,
        dominantFontSizePt: line.fontSizePt,
      });
      continue;
    }

    const previousCount = best.indices.length;
    best.indices.push(index);
    best.baselinePt =
      (best.baselinePt * previousCount + baseline) / (previousCount + 1);
    best.leftPt = Math.min(best.leftPt, line.xPt);
    best.rightPt = Math.max(best.rightPt, line.xPt + line.widthPt);
    best.topPt = Math.min(best.topPt, line.yPt);
    best.bottomPt = Math.max(best.bottomPt, line.yPt + line.heightPt);
    best.dominantFontSizePt =
      (best.dominantFontSizePt * previousCount + line.fontSizePt) /
      (previousCount + 1);
  }

  for (const row of rows) {
    row.indices.sort((a, b) => lines[a].xPt - lines[b].xPt);
  }
  return rows.sort((a, b) => a.baselinePt - b.baselinePt);
}

function looksNumeric(value: string): boolean {
  const normalized = value
    .trim()
    .replace(/[₹$€£,%()]/gu, "")
    .replace(/\s+/gu, "");
  if (!normalized) return false;
  return /^[-+]?\d+(?:[.,:/-]\d+)*$/u.test(normalized);
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function spread(values: number[]): number {
  if (!values.length) return Number.POSITIVE_INFINITY;
  return Math.max(...values) - Math.min(...values);
}

function modalColumnCount(rows: VisualTextRow[]): {
  columnCount: number;
  occurrences: number;
} {
  const counts = new Map<number, number>();
  for (const row of rows) {
    counts.set(row.indices.length, (counts.get(row.indices.length) ?? 0) + 1);
  }
  let columnCount = 0;
  let occurrences = 0;
  for (const [count, frequency] of counts) {
    if (
      frequency > occurrences ||
      (frequency === occurrences && count > columnCount)
    ) {
      columnCount = count;
      occurrences = frequency;
    }
  }
  return { columnCount, occurrences };
}

/**
 * Detect a deliberately conservative, regular row/column structure.
 *
 * Rows must repeat the same cell count, preserving source left-to-right
 * ordinals. This supports both left-aligned textual columns and right-aligned
 * numeric/date columns: for each ordinal column the more stable source edge
 * becomes the anchor. Two-column layouts still require a numeric column so
 * newspaper/report columns are not turned into false Word tables.
 */
export function inferRegularTableEvidence(
  lines: ReconstructedTextLine[],
  pageWidthPt: number,
): RegularTableEvidence | null {
  const allRows = clusterVisualTextRows(lines).filter(
    (row) => row.indices.length >= 2,
  );
  if (allRows.length < 3) return null;

  const { columnCount, occurrences } = modalColumnCount(allRows);
  if (columnCount < 2 || columnCount > 10) return null;

  const rows = allRows.filter((row) => row.indices.length === columnCount);
  const rowCoverage = rows.length / allRows.length;
  if (rows.length < 3 || rowCoverage < 0.72) return null;

  const tolerancePt = Math.max(3, pageWidthPt * 0.006);
  const columnAnchorsPt: number[] = [];
  const columnAlignments: TableColumnAlignment[] = [];
  const observedBounds: Array<{ minLeft: number; maxRight: number }> = [];
  let numericColumnCount = 0;
  let stabilityScore = 0;

  for (let column = 0; column < columnCount; column += 1) {
    const columnLines = rows.map((row) => lines[row.indices[column]]);
    const leftEdges = columnLines.map((line) => line.xPt);
    const rightEdges = columnLines.map(
      (line) => line.xPt + line.widthPt,
    );
    const numericRatio =
      columnLines.filter((line) => looksNumeric(line.text)).length /
      columnLines.length;
    if (numericRatio >= 0.5) numericColumnCount += 1;

    const leftSpread = spread(leftEdges);
    const rightSpread = spread(rightEdges);
    const rightAligned =
      numericRatio >= 0.5 &&
      rightSpread <= tolerancePt &&
      (rightSpread <= leftSpread * 0.75 || leftSpread <= tolerancePt * 0.35);

    const alignment: TableColumnAlignment = rightAligned ? "right" : "left";
    const chosenEdges = rightAligned ? rightEdges : leftEdges;
    const chosenSpread = spread(chosenEdges);
    if (chosenSpread > tolerancePt) return null;

    columnAlignments.push(alignment);
    columnAnchorsPt.push(median(chosenEdges));
    observedBounds.push({
      minLeft: Math.min(...leftEdges),
      maxRight: Math.max(...rightEdges),
    });
    stabilityScore += Math.max(0, 1 - chosenSpread / tolerancePt);
  }

  if (columnCount === 2 && numericColumnCount < 1) return null;

  for (let index = 1; index < observedBounds.length; index += 1) {
    if (
      observedBounds[index].minLeft <=
      observedBounds[index - 1].maxRight + 2
    ) {
      return null;
    }
  }

  const boundaries: number[] = [observedBounds[0].minLeft];
  for (let index = 0; index < observedBounds.length - 1; index += 1) {
    boundaries.push(
      (observedBounds[index].maxRight +
        observedBounds[index + 1].minLeft) /
        2,
    );
  }
  boundaries.push(observedBounds.at(-1)!.maxRight);

  const columnBoundsPt = observedBounds.map((_bounds, index) => ({
    leftPt: boundaries[index],
    rightPt: boundaries[index + 1],
  }));

  const widthPt =
    columnBoundsPt.at(-1)!.rightPt - columnBoundsPt[0].leftPt;
  if (widthPt < pageWidthPt * 0.2 || widthPt > pageWidthPt * 0.98) {
    return null;
  }

  const confidence = Math.max(
    0,
    Math.min(
      1,
      rowCoverage * 0.4 +
        (stabilityScore / columnCount) * 0.45 +
        Math.min(1, rows.length / 5) * 0.15,
    ),
  );
  if (confidence < 0.82) return null;

  const tableLineIndices = Array.from(
    new Set(rows.flatMap((row) => row.indices)),
  ).sort((a, b) => a - b);

  return {
    rows,
    columnAnchorsPt,
    columnAlignments,
    columnBoundsPt,
    tableLineIndices,
    confidence,
    numericColumnCount,
  };
}
