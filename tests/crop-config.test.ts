import assert from "node:assert/strict";
import test from "node:test";
import {
  applyAspectPreset,
  centerCropRect,
  clampCropRect,
  createDefaultCropConfig,
  ENTIRE_PAGE_RECT,
  isCropRectValid,
  resolveCropPageIndices,
  type CropRect,
} from "../lib/pdf/crop/config.ts";

test("createDefaultCropConfig returns a valid, sane default", () => {
  const config = createDefaultCropConfig();
  assert.equal(config.scope.mode, "all");
  assert.equal(config.aspectPreset, "free");
  assert.ok(isCropRectValid(config.rect));
});

test("isCropRectValid rejects a degenerate (zero-area) rect", () => {
  assert.equal(isCropRectValid({ xPct: 10, yPct: 10, widthPct: 0, heightPct: 50 }), false);
  assert.equal(isCropRectValid({ xPct: 10, yPct: 10, widthPct: 50, heightPct: 0 }), false);
});

test("isCropRectValid rejects a rect extending past the page", () => {
  assert.equal(isCropRectValid({ xPct: 60, yPct: 10, widthPct: 50, heightPct: 20 }), false);
  assert.equal(isCropRectValid({ xPct: 10, yPct: 60, widthPct: 20, heightPct: 50 }), false);
});

test("isCropRectValid accepts a rect that exactly fills the page", () => {
  assert.equal(isCropRectValid({ xPct: 0, yPct: 0, widthPct: 100, heightPct: 100 }), true);
});

test("clampCropRect pulls an out-of-bounds rect back inside [0,100]", () => {
  const clamped = clampCropRect({ xPct: -10, yPct: -5, widthPct: 50, heightPct: 50 });
  assert.equal(clamped.xPct, 0);
  assert.equal(clamped.yPct, 0);
  assert.equal(clamped.widthPct, 50);
  assert.equal(clamped.heightPct, 50);
});

test("clampCropRect shrinks a too-wide/too-tall rect and repositions to keep it on the page", () => {
  const clamped = clampCropRect({ xPct: 80, yPct: 90, widthPct: 40, heightPct: 30 });
  assert.equal(clamped.widthPct, 40);
  assert.equal(clamped.heightPct, 30);
  assert.ok(clamped.xPct + clamped.widthPct <= 100.0001);
  assert.ok(clamped.yPct + clamped.heightPct <= 100.0001);
});

test("clampCropRect enforces the minimum dimension floor", () => {
  const clamped = clampCropRect({ xPct: 10, yPct: 10, widthPct: 0.1, heightPct: 0.1 });
  assert.ok(clamped.widthPct >= 1);
  assert.ok(clamped.heightPct >= 1);
});

test("applyAspectPreset('free') returns the rect unchanged", () => {
  const rect: CropRect = { xPct: 20, yPct: 20, widthPct: 40, heightPct: 30 };
  assert.deepEqual(applyAspectPreset(rect, "free", 612, 792), rect);
});

function approxEqual(actual: number, expected: number, tolerance = 0.01) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `expected ~${expected}, got ${actual}`);
}

test("applyAspectPreset('1:1') on a square-ish rect on a portrait page produces a real 1:1 box in point space", () => {
  const pageWidthPt = 612;
  const pageHeightPt = 792;
  const rect: CropRect = { xPct: 25, yPct: 25, widthPct: 50, heightPct: 30 };
  const result = applyAspectPreset(rect, "1:1", pageWidthPt, pageHeightPt);

  const widthPt = (result.widthPct / 100) * pageWidthPt;
  const heightPt = (result.heightPct / 100) * pageHeightPt;
  approxEqual(widthPt / heightPt, 1, 0.02);
  assert.ok(isCropRectValid(result));
});

test("applyAspectPreset keeps the rect's center fixed", () => {
  const pageWidthPt = 612;
  const pageHeightPt = 792;
  const rect: CropRect = { xPct: 20, yPct: 20, widthPct: 40, heightPct: 40 };
  const centerXPctBefore = rect.xPct + rect.widthPct / 2;
  const centerYPctBefore = rect.yPct + rect.heightPct / 2;

  const result = applyAspectPreset(rect, "16:9", pageWidthPt, pageHeightPt);
  const centerXPctAfter = result.xPct + result.widthPct / 2;
  const centerYPctAfter = result.yPct + result.heightPct / 2;

  approxEqual(centerXPctAfter, centerXPctBefore, 0.5);
  approxEqual(centerYPctAfter, centerYPctBefore, 0.5);
});

test("applyAspectPreset('16:9') produces a real 16:9 box in point space regardless of page aspect ratio", () => {
  const rect: CropRect = { xPct: 10, yPct: 10, widthPct: 80, heightPct: 80 };
  for (const [pageWidthPt, pageHeightPt] of [
    [612, 792],
    [792, 612],
    [595.28, 841.89],
  ]) {
    const result = applyAspectPreset(rect, "16:9", pageWidthPt, pageHeightPt);
    const widthPt = (result.widthPct / 100) * pageWidthPt;
    const heightPt = (result.heightPct / 100) * pageHeightPt;
    approxEqual(widthPt / heightPt, 16 / 9, 0.02);
  }
});

test("applyAspectPreset clamps to the page when the target ratio would otherwise overflow it", () => {
  // A very wide rect near the page edge, forced to 1:1 on a portrait page --
  // must not extend past the page bounds.
  const rect: CropRect = { xPct: 5, yPct: 40, widthPct: 90, heightPct: 20 };
  const result = applyAspectPreset(rect, "1:1", 612, 792);
  assert.ok(isCropRectValid(result), `expected a valid, on-page rect, got ${JSON.stringify(result)}`);
});

test("resolveCropPageIndices handles all/current/custom", () => {
  assert.deepEqual(resolveCropPageIndices({ mode: "all" }, 4), [0, 1, 2, 3]);
  assert.deepEqual(resolveCropPageIndices({ mode: "current", pageIndex: 2 }, 4), [2]);
  assert.deepEqual(resolveCropPageIndices({ mode: "current", pageIndex: 9 }, 4), []);
  assert.deepEqual(resolveCropPageIndices({ mode: "custom", pages: [0, 2, 9] }, 4), [0, 2]);
});

test("ENTIRE_PAGE_RECT is the full, valid page", () => {
  assert.deepEqual(ENTIRE_PAGE_RECT, { xPct: 0, yPct: 0, widthPct: 100, heightPct: 100 });
  assert.ok(isCropRectValid(ENTIRE_PAGE_RECT));
});

test("centerCropRect keeps size, centers on both axes", () => {
  const result = centerCropRect({ xPct: 5, yPct: 70, widthPct: 40, heightPct: 20 });
  assert.equal(result.widthPct, 40);
  assert.equal(result.heightPct, 20);
  approxEqual(result.xPct, 30); // (100-40)/2
  approxEqual(result.yPct, 40); // (100-20)/2
  assert.ok(isCropRectValid(result));
});

test("centerCropRect on an oversized rect still returns a clamped, valid rect", () => {
  const result = centerCropRect({ xPct: 0, yPct: 0, widthPct: 120, heightPct: 150 });
  assert.ok(isCropRectValid(result));
});
