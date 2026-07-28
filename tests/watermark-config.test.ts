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

function assertPctClose(actual: { xPct: number; yPct: number }, expected: { xPct: number; yPct: number }) {
  assert.ok(Math.abs(actual.xPct - expected.xPct) < 1e-6, `xPct ${actual.xPct} !~= ${expected.xPct}`);
  assert.ok(Math.abs(actual.yPct - expected.yPct) < 1e-6, `yPct ${actual.yPct} !~= ${expected.yPct}`);
}

test("createDefaultTextWatermarkConfig returns sane defaults", () => {
  const config = createDefaultTextWatermarkConfig();
  assert.equal(config.content.kind, "text");
  assert.equal(config.placementMode, "single");
  assert.deepEqual(config.placement, { mode: "corner", corner: "center" });
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
  const pageWidthPt = 612;
  const pageHeightPt = 792;

  assertPctClose(cornerAnchorPct("top-left", margin, width, height, 0, pageWidthPt, pageHeightPt), { xPct: 5, yPct: 5 });
  assertPctClose(cornerAnchorPct("top-right", margin, width, height, 0, pageWidthPt, pageHeightPt), { xPct: 75, yPct: 5 });
  assertPctClose(cornerAnchorPct("bottom-left", margin, width, height, 0, pageWidthPt, pageHeightPt), { xPct: 5, yPct: 85 });
  assertPctClose(cornerAnchorPct("bottom-right", margin, width, height, 0, pageWidthPt, pageHeightPt), { xPct: 75, yPct: 85 });
  assertPctClose(cornerAnchorPct("center", margin, width, height, 0, pageWidthPt, pageHeightPt), { xPct: 40, yPct: 45 });
});

test("cornerAnchorPct respects the requested corner's own margin when the box is larger than the available space, even though the far edge then overflows", () => {
  // "top-right" names the RIGHT edge; when the box can't fit, the right
  // margin must stay correct (100 - marginPct - widthPct = 100 - 5 - 98 =
  // -3, i.e. flush with the right margin) and the left edge is what
  // absorbs the unavoidable overflow -- not the other way around. An
  // earlier version of this function instead fell back to protecting the
  // opposite (left) edge whenever the ideal right-margin position went
  // negative, silently abandoning the corner the caller actually asked
  // for; caught by an exhaustive real-font sweep across the full
  // font-size/rotation/text matrix, not by this test alone.
  const result = cornerAnchorPct("top-right", 5, 98, 10, 0, 612, 792);
  assertPctClose(result, { xPct: -3, yPct: 5 });
});

test("cornerAnchorPct at 0deg rotation is identical regardless of page aspect ratio (pure percent math)", () => {
  const a = cornerAnchorPct("bottom-right", 4, 30, 15, 0, 612, 792);
  const b = cornerAnchorPct("bottom-right", 4, 30, 15, 0, 1000, 1000);
  assertPctClose(a, b);
});

// Independently mimics lib/pdf/watermark/export.ts's actual placement
// pipeline for rotation=0-page documents: toNativePoint's rotation=0 case
// (`{x: visualX, y: nativeHeight - visualY - heightPt}`) followed by a
// pdf-lib-style rotate around that native anchor. Deliberately NOT sharing
// any code with cornerAnchorPct's own implementation -- an earlier version
// of this test asserted the rotated box against a bounding-box calculation
// that made the same top-down/bottom-up sign assumption the implementation
// did, so a real sign bug (Y-axis rotation handedness flips between percent
// space and PDF's native bottom-up space) passed the test but was caught
// only by inspecting a real exported PDF's content stream in a real browser.
function realExportNativeBbox(xPct: number, yPct: number, widthPt: number, heightPt: number, rotationDeg: number, pageWidthPt: number, pageHeightPt: number) {
  const visualX = (xPct / 100) * pageWidthPt;
  const visualY = (yPct / 100) * pageHeightPt;
  const nativeAnchorX = visualX;
  const nativeAnchorY = pageHeightPt - (visualY + heightPt);
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const corners = [
    [0, 0],
    [widthPt, 0],
    [0, heightPt],
    [widthPt, heightPt],
  ];
  const xs = corners.map(([x, y]) => nativeAnchorX + (x * cos - y * sin));
  const ys = corners.map(([x, y]) => nativeAnchorY + (x * sin + y * cos));
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

test("cornerAnchorPct keeps the rotated bounding box within the page for every corner (regression for the confirmed overflow bug)", () => {
  // Reproduces the exact real-world default-settings scenario that was
  // verified (via the actual exported PDF's content stream) to overflow
  // the page by ~99pt before this fix: "CONFIDENTIAL" at 36pt Helvetica-Bold,
  // 45deg rotation, bottom-right, on a 612x792 page.
  const pageWidthPt = 612;
  const pageHeightPt = 792;
  const marginPct = 4;
  // Real font metrics for "CONFIDENTIAL" in Helvetica-Bold at 36pt (measured
  // via pdf-lib, matching what lib/pdf/watermark/export.ts actually embeds).
  const contentWidthPt = 268.02;
  const contentHeightPt = 36;
  const widthPct = (contentWidthPt / pageWidthPt) * 100;
  const heightPct = (contentHeightPt / pageHeightPt) * 100;

  for (const corner of ["top-left", "top-right", "bottom-left", "bottom-right", "center"] as const) {
    for (const rotationDeg of [0, 30, 45, 60, 90, 120, 200]) {
      const { xPct, yPct } = cornerAnchorPct(corner, marginPct, widthPct, heightPct, rotationDeg, pageWidthPt, pageHeightPt);
      const { minX, maxX, minY, maxY } = realExportNativeBbox(xPct, yPct, contentWidthPt, contentHeightPt, rotationDeg, pageWidthPt, pageHeightPt);
      assert.ok(minX >= -0.01, `${corner}@${rotationDeg}deg: left edge ${minX.toFixed(2)} < 0`);
      assert.ok(maxX <= pageWidthPt + 0.01, `${corner}@${rotationDeg}deg: right edge ${maxX.toFixed(2)} > ${pageWidthPt}`);
      assert.ok(minY >= -0.01, `${corner}@${rotationDeg}deg: bottom edge ${minY.toFixed(2)} < 0`);
      assert.ok(maxY <= pageHeightPt + 0.01, `${corner}@${rotationDeg}deg: top edge ${maxY.toFixed(2)} > ${pageHeightPt}`);
    }
  }
});

test("cornerAnchorPct respects each corner's own named edge(s) when rotated content is too big to fit at all", () => {
  // 200pt "CONFIDENTIAL" rotated 45deg is far wider than the page in any
  // orientation -- physically cannot fit. Each corner should still keep
  // its OWN named edge(s) exactly at the margin and let only the opposite,
  // unrequested edge(s) absorb the unavoidable overflow.
  const pageWidthPt = 612;
  const pageHeightPt = 792;
  const marginPct = 4;
  const marginXPt = (marginPct / 100) * pageWidthPt;
  const marginYPt = (marginPct / 100) * pageHeightPt;
  const contentWidthPt = 1488.8; // real Helvetica-Bold "CONFIDENTIAL" width at 200pt
  const contentHeightPt = 200;
  const widthPct = (contentWidthPt / pageWidthPt) * 100;
  const heightPct = (contentHeightPt / pageHeightPt) * 100;
  const rotationDeg = 45;

  const namedEdges: Record<"top-left" | "top-right" | "bottom-left" | "bottom-right", Array<"left" | "right" | "top" | "bottom">> = {
    "top-left": ["left", "top"],
    "top-right": ["right", "top"],
    "bottom-left": ["left", "bottom"],
    "bottom-right": ["right", "bottom"],
  };

  for (const [corner, edges] of Object.entries(namedEdges) as Array<[keyof typeof namedEdges, Array<"left" | "right" | "top" | "bottom">]>) {
    const { xPct, yPct } = cornerAnchorPct(corner, marginPct, widthPct, heightPct, rotationDeg, pageWidthPt, pageHeightPt);
    const { minX, maxX, minY, maxY } = realExportNativeBbox(xPct, yPct, contentWidthPt, contentHeightPt, rotationDeg, pageWidthPt, pageHeightPt);
    for (const edge of edges) {
      if (edge === "left") assert.ok(Math.abs(minX - marginXPt) < 0.5, `${corner}: left edge ${minX.toFixed(2)} != margin ${marginXPt.toFixed(2)}`);
      if (edge === "right") assert.ok(Math.abs(maxX - (pageWidthPt - marginXPt)) < 0.5, `${corner}: right edge ${maxX.toFixed(2)} != margin ${(pageWidthPt - marginXPt).toFixed(2)}`);
      if (edge === "bottom") assert.ok(Math.abs(minY - marginYPt) < 0.5, `${corner}: bottom edge ${minY.toFixed(2)} != margin ${marginYPt.toFixed(2)}`);
      if (edge === "top") assert.ok(Math.abs(maxY - (pageHeightPt - marginYPt)) < 0.5, `${corner}: top edge ${maxY.toFixed(2)} != margin ${(pageHeightPt - marginYPt).toFixed(2)}`);
    }
  }
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
