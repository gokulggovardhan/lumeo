import type {
  ReconstructedRegion,
  ReconstructedTextLine,
} from "./types.ts";

type Row = {
  baselinePt: number;
  indices: number[];
};

function lineBaseline(line: ReconstructedTextLine): number {
  return line.baselinePt ?? line.yPt + line.heightPt * 0.85;
}

function clusterRows(lines: ReconstructedTextLine[]): Row[] {
  const rows: Row[] = [];
  lines.forEach((line, index) => {
    if (line.visualOnly) return;
    const baseline = lineBaseline(line);
    const tolerance = Math.max(1.25, line.fontSizePt * 0.3);
    let best: Row | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const row of rows) {
      const distance = Math.abs(row.baselinePt - baseline);
      if (distance <= tolerance && distance < bestDistance) {
        best = row;
        bestDistance = distance;
      }
    }
    if (best) {
      best.indices.push(index);
      best.baselinePt =
        (best.baselinePt * (best.indices.length - 1) + baseline) /
        best.indices.length;
    } else {
      rows.push({ baselinePt: baseline, indices: [index] });
    }
  });
  return rows.sort((a, b) => a.baselinePt - b.baselinePt);
}

function clusterColumnAnchors(
  lines: ReconstructedTextLine[],
  rows: Row[],
  pageWidthPt: number,
): Array<{ xPt: number; occurrences: number }> {
  const tolerance = Math.max(3, pageWidthPt * 0.006);
  const clusters: Array<{ xPt: number; occurrences: number }> = [];

  for (const row of rows) {
    for (const index of row.indices) {
      const x = lines[index].xPt;
      let cluster = clusters.find((item) => Math.abs(item.xPt - x) <= tolerance);
      if (!cluster) {
        cluster = { xPt: x, occurrences: 0 };
        clusters.push(cluster);
      }
      cluster.xPt =
        (cluster.xPt * cluster.occurrences + x) /
        (cluster.occurrences + 1);
      cluster.occurrences += 1;
    }
  }

  return clusters
    .filter((cluster) => cluster.occurrences >= 2)
    .sort((a, b) => a.xPt - b.xPt);
}

function boundsFor(
  lines: ReconstructedTextLine[],
  indices: number[],
): Pick<ReconstructedRegion, "xPt" | "yPt" | "widthPt" | "heightPt"> {
  const selected = indices.map((index) => lines[index]);
  const left = Math.min(...selected.map((line) => line.xPt));
  const top = Math.min(...selected.map((line) => line.yPt));
  const right = Math.max(...selected.map((line) => line.xPt + line.widthPt));
  const bottom = Math.max(...selected.map((line) => line.yPt + line.heightPt));
  return {
    xPt: left,
    yPt: top,
    widthPt: right - left,
    heightPt: bottom - top,
  };
}

/**
 * Geometry-only structure inference. It deliberately does not turn a table
 * into a Word table; that decision belongs to the renderer because Word
 * auto-layout can be less faithful than fixed positioning. The classifier
 * supplies evidence (repeated rows/X anchors) while preserving source runs.
 */
export function inferFixedLayoutRegions(
  lines: ReconstructedTextLine[],
  pageWidthPt: number,
): ReconstructedRegion[] {
  if (!lines.length) return [];

  const rows = clusterRows(lines);
  const multiCellRows = rows.filter((row) => row.indices.length >= 3);
  const anchors = clusterColumnAnchors(lines, multiCellRows, pageWidthPt);
  const tableEvidence =
    multiCellRows.length >= 2 &&
    anchors.length >= 3 &&
    multiCellRows.length / Math.max(1, rows.length) >= 0.12;

  if (tableEvidence) {
    const tableIndices = Array.from(
      new Set(multiCellRows.flatMap((row) => row.indices)),
    ).sort((a, b) => a - b);
    return [
      {
        id: "table-0",
        kind: "fixed-layout-table",
        lineIndices: tableIndices,
        ...boundsFor(lines, tableIndices),
        columnAnchorsPt: anchors.map((anchor) => anchor.xPt),
      },
    ];
  }

  const allIndices = lines.map((_line, index) => index);
  return [
    {
      id: "region-0",
      kind: "fixed-layout",
      lineIndices: allIndices,
      ...boundsFor(lines, allIndices),
    },
  ];
}

export function classifyPageReconstruction({
  lines,
  imageCount,
  vectorLayoutCount,
  pageWidthPt,
}: {
  lines: ReconstructedTextLine[];
  imageCount: number;
  vectorLayoutCount: number;
  pageWidthPt: number;
}): {
  mode: "semantic-text" | "fixed-layout" | "complex-vector" | "image" | "mixed";
  regions: ReconstructedRegion[];
} {
  if (!lines.length) return { mode: "image", regions: [] };

  const regions = inferFixedLayoutRegions(lines, pageWidthPt);
  const hasTable = regions.some((region) => region.kind === "fixed-layout-table");

  if (imageCount > 0 && lines.length > 0) {
    return { mode: "mixed", regions };
  }
  if (vectorLayoutCount > 0) {
    return {
      mode: hasTable ? "fixed-layout" : "complex-vector",
      regions,
    };
  }
  if (hasTable) return { mode: "fixed-layout", regions };

  const rows = clusterRows(lines);
  const averagePerRow =
    rows.reduce((sum, row) => sum + row.indices.length, 0) /
    Math.max(1, rows.length);
  return {
    mode: averagePerRow <= 1.6 ? "semantic-text" : "fixed-layout",
    regions,
  };
}
