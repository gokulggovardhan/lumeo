import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizePageRotation,
  visualPageSize,
  toNativePoint,
  composeRotationDegrees,
  manualNativeAnchor,
} from "../lib/pdf/core/placement.ts";

// These five functions were previously private to lib/pdf/watermark/export.ts
// and had no direct unit coverage of their own -- only indirect coverage via
// exportWatermarkedPdf's full-export integration tests. Now that they live in
// lib/pdf/core/placement.ts as a genuinely reusable module (used by any future
// tool placing content on a page), they get direct tests.

test("normalizePageRotation snaps to the nearest cardinal rotation and wraps negative/large angles", () => {
  assert.equal(normalizePageRotation(0), 0);
  assert.equal(normalizePageRotation(90), 90);
  assert.equal(normalizePageRotation(180), 180);
  assert.equal(normalizePageRotation(270), 270);
  assert.equal(normalizePageRotation(360), 0);
  assert.equal(normalizePageRotation(-90), 270);
  assert.equal(normalizePageRotation(450), 90);
  assert.equal(normalizePageRotation(45), 90); // not a cardinal angle -- Math.round(45/90)=1, rounds up to 90
});

test("visualPageSize swaps width/height only for 90/270, leaves 0/180 unchanged", () => {
  assert.deepEqual(visualPageSize(0, 612, 792), { width: 612, height: 792 });
  assert.deepEqual(visualPageSize(180, 612, 792), { width: 612, height: 792 });
  assert.deepEqual(visualPageSize(90, 612, 792), { width: 792, height: 612 });
  assert.deepEqual(visualPageSize(270, 612, 792), { width: 792, height: 612 });
});

test("toNativePoint at rotation 0 flips only the Y axis (top-down visual -> bottom-up native)", () => {
  assert.deepEqual(toNativePoint(0, 612, 792, 100, 50), { x: 100, y: 742 });
});

test("toNativePoint round-trips through all four cardinal rotations back to the same native origin behavior", () => {
  // Each rotation branch is a distinct coordinate swap/flip; spot-check each
  // produces a point still within the native page bounds for an in-bounds
  // visual point, and that 0/180 and 90/270 are each other's axis-swapped kin.
  const nativeWidth = 612;
  const nativeHeight = 792;
  const visualX = 100;
  const visualY = 50;

  const p0 = toNativePoint(0, nativeWidth, nativeHeight, visualX, visualY);
  const p90 = toNativePoint(90, nativeWidth, nativeHeight, visualX, visualY);
  const p180 = toNativePoint(180, nativeWidth, nativeHeight, visualX, visualY);
  const p270 = toNativePoint(270, nativeWidth, nativeHeight, visualX, visualY);

  assert.deepEqual(p90, { x: visualY, y: visualX });
  assert.deepEqual(p180, { x: nativeWidth - visualX, y: visualY });
  assert.deepEqual(p270, { x: nativeWidth - visualY, y: nativeHeight - visualX });
  assert.deepEqual(p0, { x: visualX, y: nativeHeight - visualY });
});

test("composeRotationDegrees adds page rotation and content rotation, wrapped to [0, 360)", () => {
  assert.equal(composeRotationDegrees(0, 45), 45);
  assert.equal(composeRotationDegrees(90, 45), 135);
  assert.equal(composeRotationDegrees(270, 180), 90); // wraps past 360
  assert.equal(composeRotationDegrees(0, -30), 330); // negative content rotation wraps positive
});

test("manualNativeAnchor keeps the box's visual center fixed as rotation changes, on an unrotated page", () => {
  const rotation = 0;
  const nativeWidth = 612;
  const nativeHeight = 792;
  const widthPt = 100;
  const heightPt = 30;
  // Box's stored top-left at 40%/40% of the page.
  const topLeftXPct = 40;
  const topLeftYPct = 40;

  const anchorAt0 = manualNativeAnchor(rotation, nativeWidth, nativeHeight, nativeWidth, nativeHeight, topLeftXPct, topLeftYPct, widthPt, heightPt, 0);
  const anchorAt90 = manualNativeAnchor(rotation, nativeWidth, nativeHeight, nativeWidth, nativeHeight, topLeftXPct, topLeftYPct, widthPt, heightPt, 90);

  // The box's center in native space, recomputed independently.
  const centerVisualX = (topLeftXPct / 100) * nativeWidth + widthPt / 2;
  const centerVisualY = (topLeftYPct / 100) * nativeHeight + heightPt / 2;
  const expectedCenterNative = toNativePoint(rotation, nativeWidth, nativeHeight, centerVisualX, centerVisualY);

  function centerOfDrawnBox(anchor: { x: number; y: number }, rotationDeg: number) {
    const rad = (rotationDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const halfW = widthPt / 2;
    const halfH = heightPt / 2;
    return { x: anchor.x + (halfW * cos - halfH * sin), y: anchor.y + (halfW * sin + halfH * cos) };
  }

  const center0 = centerOfDrawnBox(anchorAt0, 0);
  const center90 = centerOfDrawnBox(anchorAt90, 90);

  assert.ok(Math.abs(center0.x - expectedCenterNative.x) < 1e-9);
  assert.ok(Math.abs(center0.y - expectedCenterNative.y) < 1e-9);
  assert.ok(Math.abs(center90.x - expectedCenterNative.x) < 1e-6);
  assert.ok(Math.abs(center90.y - expectedCenterNative.y) < 1e-6);
});
