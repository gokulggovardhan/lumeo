import assert from "node:assert/strict";
import test from "node:test";
import {
  alignBottom,
  alignLeft,
  alignRight,
  alignTop,
  centerHorizontally,
  centerVertically,
  clampManualPosition,
  resetManualPosition,
} from "../lib/pdf/watermark/config.ts";

// v1.1 Phase 3: alignment tools + boundary/overflow clamp. All pure,
// percent-space, one-shot-commit functions -- same shape as a drag-end.

test("alignLeft/alignRight/alignTop/alignBottom snap to the correct page edge, keeping the other axis untouched", () => {
  assert.deepEqual(alignLeft(20, 10, 55), { xPct: 0, yPct: 55 });
  assert.deepEqual(alignRight(20, 10, 55), { xPct: 80, yPct: 55 });
  assert.deepEqual(alignTop(20, 10, 33), { xPct: 33, yPct: 0 });
  assert.deepEqual(alignBottom(20, 10, 33), { xPct: 33, yPct: 90 });
});

test("centerHorizontally/centerVertically center one axis, keep the other untouched", () => {
  assert.deepEqual(centerHorizontally(20, 10, 55), { xPct: 40, yPct: 55 });
  assert.deepEqual(centerVertically(20, 10, 33), { xPct: 33, yPct: 45 });
});

test("resetManualPosition centers both axes", () => {
  assert.deepEqual(resetManualPosition(20, 10), { xPct: 40, yPct: 45 });
});

test("alignment helpers on a box larger than the page don't throw and return finite numbers", () => {
  // Content wider/taller than the page can't have BOTH edges on-page at
  // once -- clampManualPosition doesn't resize content (same convention as
  // cornerAnchorPct, which also never shrinks content, only repositions
  // it), so alignLeft still honors the left edge exactly (xPct: 0) even
  // though the box then necessarily overflows the right edge.
  const left = alignLeft(150, 10, 0);
  assert.ok(Number.isFinite(left.xPct));
  const bottom = alignBottom(20, 150, 0);
  assert.ok(Number.isFinite(bottom.yPct));
});

test("clampManualPosition keeps a normal position unchanged", () => {
  assert.deepEqual(clampManualPosition(30, 40, 20, 10, false), { xPct: 30, yPct: 40 });
});

test("clampManualPosition clamps out-of-bounds positions to stay fully on-page by default", () => {
  assert.deepEqual(clampManualPosition(-10, 150, 20, 10, false), { xPct: 0, yPct: 90 });
});

test("clampManualPosition with allowOverflow permits off-page positions within a bounded range", () => {
  const result = clampManualPosition(-50, 150, 20, 10, true);
  assert.equal(result.xPct, -50);
  assert.equal(result.yPct, 150);
});

test("clampManualPosition with allowOverflow still bounds pathological input", () => {
  const result = clampManualPosition(-99999, 99999, 20, 10, true);
  assert.ok(result.xPct >= -100);
  assert.ok(result.yPct <= 200 - 10);
});
