import assert from "node:assert/strict";
import test from "node:test";
import type { OcrWord } from "../lib/pdf/edit/localOcr.ts";
import { analyzeOcrLayout } from "../lib/pdf/edit/ocrLayoutGrouping.ts";

function word({
  text,
  x,
  y,
  width = 8,
  height = 4,
  blockIndex,
  paragraphIndex = 0,
  lineIndex,
  wordIndex,
  confidence = 92,
}: {
  text: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  blockIndex?: number;
  paragraphIndex?: number;
  lineIndex?: number;
  wordIndex?: number;
  confidence?: number;
}): OcrWord {
  return Object.freeze({
    textSource: "ocr" as const,
    text,
    confidence,
    ...(blockIndex !== undefined &&
    lineIndex !== undefined &&
    wordIndex !== undefined
      ? {
          layout: Object.freeze({
            blockIndex,
            paragraphIndex,
            lineIndex,
            wordIndex,
          }),
        }
      : {}),
    boundsPct: Object.freeze({
      xPct: x,
      yPct: y,
      widthPct: width,
      heightPct: height,
    }),
  });
}

test("OCR layout groups preserve structural reading order instead of array order", () => {
  const words = [
    word({
      text: "beta",
      x: 25,
      y: 10,
      blockIndex: 0,
      lineIndex: 0,
      wordIndex: 1,
    }),
    word({
      text: "alpha",
      x: 10,
      y: 10,
      blockIndex: 0,
      lineIndex: 0,
      wordIndex: 0,
    }),
    word({
      text: "gamma",
      x: 10,
      y: 20,
      blockIndex: 0,
      lineIndex: 1,
      wordIndex: 0,
    }),
  ];

  const analysis = analyzeOcrLayout(words);
  assert.equal(analysis.lineGroups.length, 2);
  assert.equal(analysis.lineGroups[0].text, "alpha beta");
  assert.deepEqual(analysis.lineGroups[0].wordIndices, [1, 0]);
  assert.deepEqual(analysis.readingOrderWordIndices, [1, 0, 2]);
  assert.deepEqual(analysis.ungroupedWordIndices, []);
});

test("OCR layout identifies side-by-side source blocks as advisory columns", () => {
  const words = [
    word({
      text: "Left A",
      x: 8,
      y: 18,
      width: 24,
      blockIndex: 0,
      lineIndex: 0,
      wordIndex: 0,
    }),
    word({
      text: "Left B",
      x: 8,
      y: 32,
      width: 25,
      blockIndex: 0,
      lineIndex: 1,
      wordIndex: 0,
    }),
    word({
      text: "Right A",
      x: 60,
      y: 18,
      width: 24,
      blockIndex: 1,
      lineIndex: 0,
      wordIndex: 0,
    }),
    word({
      text: "Right B",
      x: 60,
      y: 32,
      width: 24,
      blockIndex: 1,
      lineIndex: 1,
      wordIndex: 0,
    }),
  ];

  const analysis = analyzeOcrLayout(words);
  assert.equal(analysis.columnBands.length, 2);
  assert.deepEqual(
    analysis.columnBands.map((band) => band.blockIndices),
    [[0], [1]],
  );
  assert.deepEqual(
    analysis.blockGroups.map((block) => block.columnIndex),
    [0, 1],
  );
});

test("full-width OCR headers remain spanning while body blocks form columns", () => {
  const words = [
    word({
      text: "Header",
      x: 5,
      y: 4,
      width: 90,
      blockIndex: 0,
      lineIndex: 0,
      wordIndex: 0,
    }),
    word({
      text: "Left",
      x: 8,
      y: 20,
      width: 28,
      height: 30,
      blockIndex: 1,
      lineIndex: 0,
      wordIndex: 0,
    }),
    word({
      text: "Right",
      x: 62,
      y: 20,
      width: 28,
      height: 30,
      blockIndex: 2,
      lineIndex: 0,
      wordIndex: 0,
    }),
  ];

  const analysis = analyzeOcrLayout(words);
  assert.equal(analysis.columnBands.length, 2);
  assert.equal(
    analysis.blockGroups.find((block) => block.blockIndex === 0)?.columnIndex,
    null,
  );
  assert.equal(
    analysis.blockGroups.find((block) => block.blockIndex === 1)?.columnIndex,
    0,
  );
  assert.equal(
    analysis.blockGroups.find((block) => block.blockIndex === 2)?.columnIndex,
    1,
  );
});

test("repeated aligned word starts produce a table-like advisory block", () => {
  const words = [
    word({
      text: "Item",
      x: 10,
      y: 10,
      blockIndex: 0,
      lineIndex: 0,
      wordIndex: 0,
    }),
    word({
      text: "Amount",
      x: 58,
      y: 10,
      blockIndex: 0,
      lineIndex: 0,
      wordIndex: 1,
    }),
    word({
      text: "Tea",
      x: 10.5,
      y: 20,
      blockIndex: 0,
      lineIndex: 1,
      wordIndex: 0,
    }),
    word({
      text: "120",
      x: 57.5,
      y: 20,
      blockIndex: 0,
      lineIndex: 1,
      wordIndex: 1,
    }),
    word({
      text: "Coffee",
      x: 10.2,
      y: 30,
      blockIndex: 0,
      lineIndex: 2,
      wordIndex: 0,
    }),
    word({
      text: "90",
      x: 58.3,
      y: 30,
      blockIndex: 0,
      lineIndex: 2,
      wordIndex: 1,
    }),
  ];

  const analysis = analyzeOcrLayout(words);
  assert.equal(analysis.tableLikeBlocks.length, 1);
  const table = analysis.tableLikeBlocks[0];
  assert.equal(table.blockIndex, 0);
  assert.equal(table.rowCount, 3);
  assert.equal(table.columnAnchorsPct.length, 2);
  assert.ok(Math.abs(table.columnAnchorsPct[0] - 10.2) < 1);
  assert.ok(Math.abs(table.columnAnchorsPct[1] - 57.9) < 1);
});

test("ordinary prose with only a repeated left margin is not called table-like", () => {
  const words = [
    word({
      text: "This",
      x: 10,
      y: 10,
      blockIndex: 0,
      lineIndex: 0,
      wordIndex: 0,
    }),
    word({
      text: "sentence",
      x: 22,
      y: 10,
      blockIndex: 0,
      lineIndex: 0,
      wordIndex: 1,
    }),
    word({
      text: "Another",
      x: 10,
      y: 20,
      blockIndex: 0,
      lineIndex: 1,
      wordIndex: 0,
    }),
    word({
      text: "line",
      x: 38,
      y: 20,
      blockIndex: 0,
      lineIndex: 1,
      wordIndex: 1,
    }),
  ];

  const analysis = analyzeOcrLayout(words);
  assert.equal(analysis.tableLikeBlocks.length, 0);
});

test("OCR words without proven structural provenance remain explicitly ungrouped", () => {
  const words = [
    word({ text: "later", x: 40, y: 30 }),
    word({ text: "earlier", x: 10, y: 20 }),
    word({
      text: "structured",
      x: 10,
      y: 10,
      blockIndex: 0,
      lineIndex: 0,
      wordIndex: 0,
    }),
  ];

  const analysis = analyzeOcrLayout(words);
  assert.deepEqual(analysis.ungroupedWordIndices, [0, 1]);
  assert.deepEqual(analysis.readingOrderWordIndices, [2, 1, 0]);
  assert.equal(analysis.lineGroups.length, 1);
});
