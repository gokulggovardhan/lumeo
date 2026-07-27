import assert from "node:assert/strict";
import test from "node:test";
import {
  computeTilePositions,
  cornerAnchorPct,
  createDefaultImageWatermarkConfig,
  createDefaultTextWatermarkConfig,
  parsePageRangeInput,
  resolvePageIndices,
} from "../lib/pdf/watermark/config.ts";

test("createDefaultTextWatermarkConfig returns sane defaults", () => {
  const config = createDefaultTextWatermarkConfig();
  assert.equal(config.content.kind, "text");
  assert.equal(config.placementMode, "single");
  assert.equal(config.pageRange.mode, "all");
  assert.ok(config.opacity > 0 && config.opacity < 1);
});

test("createDefaultImageWatermarkConfig carries the provided data URL and format", () => {
  const config = createDefaultImageWatermarkConfig("data:image/png;base64,AAA", "png");
  assert.equal(config.content.kind, "image");
  assert.equal((config.content as { imageDataUrl: string }).imageDataUrl, "data:image/png;base64,AAA");
  assert.equal((config.content as { imageFormat: string }).imageFormat, "png");
});

test("cornerAnchorPct places each corner within the margin, inset from the correct edges", () => {
  const margin = 5;
  const width = 20;
  const height = 10;

  assert.deepEqual(cornerAnchorPct("top-left", margin, width, height), { xPct: 5, yPct: 5 });
  assert.deepEqual(cornerAnchorPct("top-right", margin, width, height), { xPct: 75, yPct: 5 });
  assert.deepEqual(cornerAnchorPct("bottom-left", margin, width, height), { xPct: 5, yPct: 85 });
  assert.deepEqual(cornerAnchorPct("bottom-right", margin, width, height), { xPct: 75, yPct: 85 });
  assert.deepEqual(cornerAnchorPct("center", margin, width, height), { xPct: 40, yPct: 45 });
});

test("cornerAnchorPct clamps to the margin when the box is larger than the available space", () => {
  const result = cornerAnchorPct("top-right", 5, 98, 10);
  assert.equal(result.xPct, 5); // 100 - 5 - 98 = -3, clamped up to the margin
});

test("computeTilePositions covers the page in a spaced grid", () => {
  const positions = computeTilePositions(20, 10, 10);
  assert.ok(positions.length > 1);
  for (const position of positions) {
    assert.ok(position.xPct >= 0 && position.xPct <= 100);
    assert.ok(position.yPct >= 0 && position.yPct <= 100);
  }
  // Step between columns should be width + spacing.
  const firstRowXs = positions.filter((p) => p.yPct === positions[0].yPct).map((p) => p.xPct);
  assert.ok(firstRowXs.length >= 2);
  assert.equal(firstRowXs[1] - firstRowXs[0], 30);
});

test("computeTilePositions returns a single centered anchor when the box is larger than the page", () => {
  const positions = computeTilePositions(120, 120, 10);
  assert.equal(positions.length, 1);
});

test("parsePageRangeInput parses comma-separated singles and ranges, 1-based to 0-based", () => {
  assert.deepEqual(parsePageRangeInput("1,3,5", 10), [0, 2, 4]);
  assert.deepEqual(parsePageRangeInput("2-4", 10), [1, 2, 3]);
  assert.deepEqual(parsePageRangeInput("1-3,7", 10), [0, 1, 2, 6]);
});

test("parsePageRangeInput handles a reversed range and de-duplicates overlaps", () => {
  assert.deepEqual(parsePageRangeInput("5-3", 10), [2, 3, 4]);
  assert.deepEqual(parsePageRangeInput("1-3,2", 10), [0, 1, 2]);
});

test("parsePageRangeInput clamps out-of-bounds pages and returns null for no valid tokens", () => {
  assert.deepEqual(parsePageRangeInput("1,50,3", 5), [0, 2]);
  assert.equal(parsePageRangeInput("", 5), null);
  assert.equal(parsePageRangeInput("abc", 5), null);
  assert.equal(parsePageRangeInput("99", 5), null);
});

test("resolvePageIndices handles all/first/odd/even/custom", () => {
  assert.deepEqual(resolvePageIndices({ mode: "all" }, 4), [0, 1, 2, 3]);
  assert.deepEqual(resolvePageIndices({ mode: "first" }, 4), [0]);
  assert.deepEqual(resolvePageIndices({ mode: "first" }, 0), []);
  assert.deepEqual(resolvePageIndices({ mode: "odd" }, 5), [0, 2, 4]);
  assert.deepEqual(resolvePageIndices({ mode: "even" }, 5), [1, 3]);
  assert.deepEqual(resolvePageIndices({ mode: "custom", pages: [1, 3, 99, -1] }, 5), [1, 3]);
});
