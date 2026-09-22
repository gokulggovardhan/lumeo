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

export type RegularTableEvidence = {
  rows: VisualTextRow[];
  columnAnchorsPt: number[];
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

type Anchor = {
  xPt: number;
  rowIndexes: Set<number>;
};

function nearestAnchor(
  xPt: number,
  anchors: number[],
  tolerancePt: number,
): number {
  let best = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  anchors.forEach((anchor, index) => {
    const distance = Math.abs(anchor - xPt);
    if (distance <= tolerancePt && distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });
  return best;
}

/**
 * Detect a deliberately conservative, regular row/column structure.
 *
 * This is not a generic "anything aligned is a table" heuristic. A page must
 * expose repeated X anchors across several visual rows and the majority of
 * cell runs must map uniquely to those anchors. Two-column layouts additionally
 * need a numeric/date-like column so newspaper/report columns are not turned
 * into false Word tables.
 */
export function inferRegularTableEvidence(
  lines: ReconstructedTextLine[],
  pageWidthPt: number,
): RegularTableEvidence | null {
  const rows = clusterVisualTextRows(lines).filter(
    (row) => row.indices.length >= 2,
  );
  if (rows.length < 3) return null;

  const tolerancePt = Math.max(3, pageWidthPt * 0.006);
  const anchorClusters: Anchor[] = [];

  rows.forEach((row, rowIndex) => {
    for (const lineIndex of row.indices) {
      const xPt = lines[lineIndex].xPt;
      let anchor = anchorClusters.find(
        (candidate) => Math.abs(candidate.xPt - xPt) <= tolerancePt,
      );
      if (!anchor) {
        anchor = { xPt, rowIndexes: new Set<number>() };
        anchorClusters.push(anchor);
      }
      const count = anchor.rowIndexes.size;
      anchor.xPt = (anchor.xPt * count + xPt) / (count + 1);
      anchor.rowIndexes.add(rowIndex);
    }
  });

  const minimumOccurrences = Math.max(2, Math.ceil(rows.length * 0.6));
  const anchors = anchorClusters
    .filter((anchor) => anchor.rowIndexes.size >= minimumOccurrences)
    .sort((a, b) => a.xPt - b.xPt)
    .map((anchor) => anchor.xPt);

  if (anchors.length < 2 || anchors.length > 10) return null;

  const qualifyingRows: VisualTextRow[] = [];
  let mappedRuns = 0;
  let totalRuns = 0;
  const numericHits = new Array<number>(anchors.length).fill(0);
  const columnHits = new Array<number>(anchors.length).fill(0);

  for (const row of rows) {
    const used = new Set<number>();
    let rowMapped = 0;
    let rowCollision = false;

    for (const lineIndex of row.indices) {
      totalRuns += 1;
      const line = lines[lineIndex];
      const column = nearestAnchor(line.xPt, anchors, tolerancePt);
      if (column < 0 || used.has(column)) {
        if (column >= 0 && used.has(column)) rowCollision = true;
        continue;
      }
      used.add(column);
      rowMapped += 1;
      mappedRuns += 1;
      columnHits[column] += 1;
      if (looksNumeric(line.text)) numericHits[column] += 1;
    }

    if (!rowCollision && rowMapped >= 2) qualifyingRows.push(row);
  }

  if (qualifyingRows.length < 3) return null;
  const mappingCoverage = mappedRuns / Math.max(1, totalRuns);
  if (mappingCoverage < 0.86) return null;

  const numericColumnCount = numericHits.reduce(
    (count, hits, index) =>
      count +
      (columnHits[index] >= 2 && hits / Math.max(1, columnHits[index]) >= 0.5
        ? 1
        : 0),
    0,
  );

  const structurallySafe =
    (anchors.length >= 3 && qualifyingRows.length >= 3) ||
    (anchors.length === 2 &&
      qualifyingRows.length >= 3 &&
      numericColumnCount >= 1);
  if (!structurallySafe) return null;

  const rowCoverage = qualifyingRows.length / rows.length;
  const repeatedAnchorCoverage =
    anchors.reduce(
      (sum, anchorX) =>
        sum +
        rows.filter((row) =>
          row.indices.some(
            (index) => Math.abs(lines[index].xPt - anchorX) <= tolerancePt,
          ),
        ).length /
          rows.length,
      0,
    ) / anchors.length;

  const confidence = Math.max(
    0,
    Math.min(
      1,
      mappingCoverage * 0.45 +
        rowCoverage * 0.3 +
        repeatedAnchorCoverage * 0.25,
    ),
  );
  if (confidence < 0.82) return null;

  const tableLineIndices = Array.from(
    new Set(qualifyingRows.flatMap((row) => row.indices)),
  ).sort((a, b) => a - b);

  return {
    rows: qualifyingRows,
    columnAnchorsPt: anchors,
    tableLineIndices,
    confidence,
    numericColumnCount,
  };
}
