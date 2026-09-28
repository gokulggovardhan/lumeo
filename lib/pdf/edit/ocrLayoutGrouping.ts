import type { OcrWord } from "./localOcr.ts";

export type OcrPercentBounds = Readonly<{
  xPct: number;
  yPct: number;
  widthPct: number;
  heightPct: number;
}>;

export type OcrLayoutLineGroup = Readonly<{
  key: string;
  blockIndex: number;
  paragraphIndex: number;
  lineIndex: number;
  wordIndices: readonly number[];
  text: string;
  averageConfidence: number;
  boundsPct: OcrPercentBounds;
}>;

export type OcrLayoutBlockGroup = Readonly<{
  blockIndex: number;
  lineKeys: readonly string[];
  wordIndices: readonly number[];
  boundsPct: OcrPercentBounds;
  columnIndex: number | null;
}>;

export type OcrColumnBand = Readonly<{
  columnIndex: number;
  blockIndices: readonly number[];
  boundsPct: OcrPercentBounds;
}>;

export type OcrTableLikeBlock = Readonly<{
  blockIndex: number;
  rowCount: number;
  columnAnchorsPct: readonly number[];
}>;

export type OcrLayoutAnalysis = Readonly<{
  lineGroups: readonly OcrLayoutLineGroup[];
  blockGroups: readonly OcrLayoutBlockGroup[];
  columnBands: readonly OcrColumnBand[];
  tableLikeBlocks: readonly OcrTableLikeBlock[];
  readingOrderWordIndices: readonly number[];
  ungroupedWordIndices: readonly number[];
}>;

function finiteBounds(bounds: OcrWord["boundsPct"]): boolean {
  return (
    Number.isFinite(bounds.xPct) &&
    Number.isFinite(bounds.yPct) &&
    Number.isFinite(bounds.widthPct) &&
    Number.isFinite(bounds.heightPct) &&
    bounds.widthPct > 0 &&
    bounds.heightPct > 0
  );
}

function unionBounds(
  bounds: readonly OcrWord["boundsPct"][],
): OcrPercentBounds {
  const left = Math.min(...bounds.map((value) => value.xPct));
  const top = Math.min(...bounds.map((value) => value.yPct));
  const right = Math.max(
    ...bounds.map((value) => value.xPct + value.widthPct),
  );
  const bottom = Math.max(
    ...bounds.map((value) => value.yPct + value.heightPct),
  );
  return Object.freeze({
    xPct: left,
    yPct: top,
    widthPct: Math.max(0, right - left),
    heightPct: Math.max(0, bottom - top),
  });
}

function lineKey(
  blockIndex: number,
  paragraphIndex: number,
  lineIndex: number,
): string {
  return `${blockIndex}:${paragraphIndex}:${lineIndex}`;
}

function horizontalOverlapRatio(
  left: OcrPercentBounds,
  right: OcrPercentBounds,
): number {
  const start = Math.max(left.xPct, right.xPct);
  const end = Math.min(
    left.xPct + left.widthPct,
    right.xPct + right.widthPct,
  );
  const overlap = Math.max(0, end - start);
  const denominator = Math.min(left.widthPct, right.widthPct);
  return denominator > 0 ? overlap / denominator : 0;
}

function verticalOverlapRatio(
  first: OcrPercentBounds,
  second: OcrPercentBounds,
): number {
  const start = Math.max(first.yPct, second.yPct);
  const end = Math.min(
    first.yPct + first.heightPct,
    second.yPct + second.heightPct,
  );
  const overlap = Math.max(0, end - start);
  const denominator = Math.min(first.heightPct, second.heightPct);
  return denominator > 0 ? overlap / denominator : 0;
}

function inferColumnBands(
  blocks: readonly Readonly<{
    blockIndex: number;
    boundsPct: OcrPercentBounds;
  }>[],
): {
  bands: OcrColumnBand[];
  columnByBlock: Map<number, number>;
} {
  // Full-width blocks are usually headings or spanning regions. They remain
  // structurally grouped but do not define a page column.
  const candidates = blocks
    .filter((block) => block.boundsPct.widthPct <= 70)
    .sort(
      (a, b) =>
        a.boundsPct.xPct - b.boundsPct.xPct ||
        a.boundsPct.yPct - b.boundsPct.yPct,
    );

  let hasSideBySideEvidence = false;
  for (let left = 0; left < candidates.length; left += 1) {
    for (let right = left + 1; right < candidates.length; right += 1) {
      if (
        verticalOverlapRatio(
          candidates[left].boundsPct,
          candidates[right].boundsPct,
        ) >= 0.2 &&
        horizontalOverlapRatio(
          candidates[left].boundsPct,
          candidates[right].boundsPct,
        ) < 0.15
      ) {
        hasSideBySideEvidence = true;
        break;
      }
    }
    if (hasSideBySideEvidence) break;
  }

  if (!hasSideBySideEvidence) {
    return { bands: [], columnByBlock: new Map() };
  }

  const rawBands: Array<{
    blockIndices: number[];
    bounds: OcrPercentBounds[];
  }> = [];

  for (const block of candidates) {
    const matching = rawBands.find((band) => {
      const bandBounds = unionBounds(band.bounds);
      return (
        horizontalOverlapRatio(bandBounds, block.boundsPct) >= 0.45 ||
        Math.abs(
          bandBounds.xPct +
            bandBounds.widthPct / 2 -
            (block.boundsPct.xPct + block.boundsPct.widthPct / 2),
        ) <= 5
      );
    });
    if (matching) {
      matching.blockIndices.push(block.blockIndex);
      matching.bounds.push(block.boundsPct);
    } else {
      rawBands.push({
        blockIndices: [block.blockIndex],
        bounds: [block.boundsPct],
      });
    }
  }

  if (rawBands.length < 2) {
    return { bands: [], columnByBlock: new Map() };
  }

  rawBands.sort(
    (a, b) => unionBounds(a.bounds).xPct - unionBounds(b.bounds).xPct,
  );
  const columnByBlock = new Map<number, number>();
  const bands = rawBands.map((band, columnIndex): OcrColumnBand => {
    for (const blockIndex of band.blockIndices) {
      columnByBlock.set(blockIndex, columnIndex);
    }
    return Object.freeze({
      columnIndex,
      blockIndices: Object.freeze([...band.blockIndices]),
      boundsPct: unionBounds(band.bounds),
    });
  });

  return { bands, columnByBlock };
}

function inferTableLikeBlock(
  blockIndex: number,
  lines: readonly OcrLayoutLineGroup[],
  words: readonly OcrWord[],
): OcrTableLikeBlock | null {
  if (lines.length < 2) return null;

  const tolerancePct = 3;
  const anchorCandidates: Array<{
    xPct: number;
    lineKeys: Set<string>;
  }> = [];

  for (const line of lines) {
    for (const wordIndex of line.wordIndices) {
      const word = words[wordIndex];
      if (!word || !finiteBounds(word.boundsPct)) continue;
      const xPct = word.boundsPct.xPct;
      const existing = anchorCandidates.find(
        (candidate) => Math.abs(candidate.xPct - xPct) <= tolerancePct,
      );
      if (existing) {
        const count = existing.lineKeys.size;
        existing.xPct = (existing.xPct * count + xPct) / (count + 1);
        existing.lineKeys.add(line.key);
      } else {
        anchorCandidates.push({
          xPct,
          lineKeys: new Set([line.key]),
        });
      }
    }
  }

  const minimumRows = Math.max(2, Math.ceil(lines.length * 0.5));
  const anchors = anchorCandidates
    .filter((candidate) => candidate.lineKeys.size >= minimumRows)
    .sort((a, b) => a.xPct - b.xPct);

  if (anchors.length < 2) return null;

  let rowCount = 0;
  for (const line of lines) {
    const lineXs = line.wordIndices
      .map((wordIndex) => words[wordIndex]?.boundsPct.xPct)
      .filter((value): value is number => Number.isFinite(value));
    const matchedAnchors = anchors.filter((anchor) =>
      lineXs.some((xPct) => Math.abs(xPct - anchor.xPct) <= tolerancePct),
    ).length;
    if (matchedAnchors >= 2) rowCount += 1;
  }

  if (rowCount < 2) return null;
  return Object.freeze({
    blockIndex,
    rowCount,
    columnAnchorsPct: Object.freeze(anchors.map((anchor) => anchor.xPct)),
  });
}

/**
 * Builds advisory OCR layout structure from Tesseract provenance plus word
 * geometry. This analysis is intentionally downstream of recognition and
 * upstream only of review UI:
 *
 * - it never changes OCR text or bounds;
 * - it never authorizes native PDF editing;
 * - it never changes searchable-layer publication order/geometry;
 * - ambiguous/missing provenance stays explicitly ungrouped.
 */
export function analyzeOcrLayout(
  words: readonly OcrWord[],
): OcrLayoutAnalysis {
  const lineWordIndices = new Map<string, number[]>();
  const lineMeta = new Map<
    string,
    { blockIndex: number; paragraphIndex: number; lineIndex: number }
  >();
  const ungroupedWordIndices: number[] = [];

  words.forEach((word, wordIndex) => {
    const layout = word.layout;
    if (
      !layout ||
      !Number.isInteger(layout.blockIndex) ||
      !Number.isInteger(layout.paragraphIndex) ||
      !Number.isInteger(layout.lineIndex) ||
      !Number.isInteger(layout.wordIndex) ||
      layout.blockIndex < 0 ||
      layout.paragraphIndex < 0 ||
      layout.lineIndex < 0 ||
      layout.wordIndex < 0 ||
      !finiteBounds(word.boundsPct)
    ) {
      ungroupedWordIndices.push(wordIndex);
      return;
    }
    const key = lineKey(
      layout.blockIndex,
      layout.paragraphIndex,
      layout.lineIndex,
    );
    const indices = lineWordIndices.get(key) ?? [];
    indices.push(wordIndex);
    lineWordIndices.set(key, indices);
    lineMeta.set(key, {
      blockIndex: layout.blockIndex,
      paragraphIndex: layout.paragraphIndex,
      lineIndex: layout.lineIndex,
    });
  });

  const lineGroups = [...lineWordIndices.entries()]
    .map(([key, indices]): OcrLayoutLineGroup => {
      const meta = lineMeta.get(key)!;
      const sortedIndices = [...indices].sort(
        (left, right) =>
          (words[left]?.layout?.wordIndex ?? left) -
          (words[right]?.layout?.wordIndex ?? right),
      );
      const lineWords = sortedIndices
        .map((index) => words[index])
        .filter((word): word is OcrWord => Boolean(word));
      const confidence =
        lineWords.length > 0
          ? lineWords.reduce((sum, word) => sum + word.confidence, 0) /
            lineWords.length
          : 0;
      return Object.freeze({
        key,
        ...meta,
        wordIndices: Object.freeze(sortedIndices),
        text: lineWords.map((word) => word.text).join(" "),
        averageConfidence: confidence,
        boundsPct: unionBounds(lineWords.map((word) => word.boundsPct)),
      });
    })
    .sort(
      (a, b) =>
        a.blockIndex - b.blockIndex ||
        a.paragraphIndex - b.paragraphIndex ||
        a.lineIndex - b.lineIndex,
    );

  const linesByBlock = new Map<number, OcrLayoutLineGroup[]>();
  for (const line of lineGroups) {
    const lines = linesByBlock.get(line.blockIndex) ?? [];
    lines.push(line);
    linesByBlock.set(line.blockIndex, lines);
  }

  const provisionalBlocks = [...linesByBlock.entries()]
    .map(([blockIndex, lines]) => {
      const wordIndices = lines.flatMap((line) => [...line.wordIndices]);
      return {
        blockIndex,
        lineKeys: lines.map((line) => line.key),
        wordIndices,
        boundsPct: unionBounds(lines.map((line) => line.boundsPct)),
        lines,
      };
    })
    .sort((a, b) => a.blockIndex - b.blockIndex);

  const { bands, columnByBlock } = inferColumnBands(provisionalBlocks);
  const blockGroups = provisionalBlocks.map(
    (block): OcrLayoutBlockGroup =>
      Object.freeze({
        blockIndex: block.blockIndex,
        lineKeys: Object.freeze([...block.lineKeys]),
        wordIndices: Object.freeze([...block.wordIndices]),
        boundsPct: block.boundsPct,
        columnIndex: columnByBlock.get(block.blockIndex) ?? null,
      }),
  );

  const tableLikeBlocks = provisionalBlocks
    .map((block) =>
      inferTableLikeBlock(block.blockIndex, block.lines, words),
    )
    .filter((block): block is OcrTableLikeBlock => block !== null);

  const readingOrderWordIndices = lineGroups.flatMap((line) => [
    ...line.wordIndices,
  ]);
  const geometryFallback = [...ungroupedWordIndices].sort((left, right) => {
    const a = words[left]?.boundsPct;
    const b = words[right]?.boundsPct;
    if (!a || !b) return left - right;
    return a.yPct - b.yPct || a.xPct - b.xPct || left - right;
  });
  readingOrderWordIndices.push(...geometryFallback);

  return Object.freeze({
    lineGroups: Object.freeze(lineGroups),
    blockGroups: Object.freeze(blockGroups),
    columnBands: Object.freeze(bands),
    tableLikeBlocks: Object.freeze(tableLikeBlocks),
    readingOrderWordIndices: Object.freeze(readingOrderWordIndices),
    ungroupedWordIndices: Object.freeze([...ungroupedWordIndices]),
  });
}
