// lib/pdf/core/placement.ts
//
// Shared corner/manual/tiled placement math and the page-rotation <->
// PDF-native-space coordinate bridge -- used by any tool that draws content
// at a computed position on a page (Watermark today; Page Numbers,
// Header & Footer, Images next).
//
// This module DOES import a sibling core module (./anchors.ts) as a value,
// using an explicit ".ts" extension so it resolves correctly both under
// Node's bare test runner (which requires exact extensions for relative
// specifiers) and under Next.js's bundler/typecheck (which requires
// tsconfig's `allowImportingTsExtensions` to accept it) -- see that flag's
// addition in tsconfig.json for the full rationale. This is what makes it
// safe for lib/pdf/watermark/export.ts to import real functions from here
// instead of re-implementing them, which it previously had to do.

import { nativeAnchorForCenter } from "./anchors.ts";

export type PlacementCorner = "center" | "top-left" | "top-right" | "bottom-left" | "bottom-right";

// v1.1 Phase 3: clamps a manual placement's top-left percent to stay fully
// on-page (matches Crop PDF's clampCropRect pattern), unless allowOverflow
// is set -- in which case it's still bounded to a generous but finite
// range so a fat-fingered value can't produce a pathological export.
export function clampManualPosition(
  xPct: number,
  yPct: number,
  widthPct: number,
  heightPct: number,
  allowOverflow: boolean,
): { xPct: number; yPct: number } {
  if (allowOverflow) {
    return {
      xPct: Math.min(200 - widthPct, Math.max(-100, xPct)),
      yPct: Math.min(200 - heightPct, Math.max(-100, yPct)),
    };
  }
  return {
    xPct: Math.min(100 - widthPct, Math.max(0, xPct)),
    yPct: Math.min(100 - heightPct, Math.max(0, yPct)),
  };
}

export function alignLeft(widthPct: number, heightPct: number, currentYPct: number): { xPct: number; yPct: number } {
  return clampManualPosition(0, currentYPct, widthPct, heightPct, false);
}
export function alignRight(widthPct: number, heightPct: number, currentYPct: number): { xPct: number; yPct: number } {
  return clampManualPosition(100 - widthPct, currentYPct, widthPct, heightPct, false);
}
export function alignTop(widthPct: number, heightPct: number, currentXPct: number): { xPct: number; yPct: number } {
  return clampManualPosition(currentXPct, 0, widthPct, heightPct, false);
}
export function alignBottom(widthPct: number, heightPct: number, currentXPct: number): { xPct: number; yPct: number } {
  return clampManualPosition(currentXPct, 100 - heightPct, widthPct, heightPct, false);
}
export function centerHorizontally(widthPct: number, heightPct: number, currentYPct: number): { xPct: number; yPct: number } {
  return clampManualPosition((100 - widthPct) / 2, currentYPct, widthPct, heightPct, false);
}
export function centerVertically(widthPct: number, heightPct: number, currentXPct: number): { xPct: number; yPct: number } {
  return clampManualPosition(currentXPct, (100 - heightPct) / 2, widthPct, heightPct, false);
}
export function resetManualPosition(widthPct: number, heightPct: number): { xPct: number; yPct: number } {
  return clampManualPosition((100 - widthPct) / 2, (100 - heightPct) / 2, widthPct, heightPct, false);
}

// Top-left anchor (xPct, yPct) for a box of the given size, for one of the
// five placement presets, inset from the page edge by marginPct. "center"
// ignores marginPct (a centered element has no edge to inset from).
//
// Rotation-aware: pdf-lib's drawText/drawImage `rotate` option pivots the
// content around the (x, y) point it's given, in PDF's own native space --
// x running right, y running UP from the text baseline (0,0) -- so a naive
// axis-aligned inset (the pre-rotation width/height only) under-clamps
// whenever rotationDeg != 0: the rotated box's corners can swing well
// outside the unrotated footprint and past the page edge even though the
// anchor itself looks correctly inset.
//
// xPct/yPct are top-down (yPct 0 = top of page), matching CSS/screen
// convention, while PDF's native space this rotation actually happens in
// is bottom-up -- toNativePoint below bridges the two via
// `nativeY = nativeHeight - visualY - heightPt` (the visual anchor names
// the box's top-left; the native anchor pdf-lib rotates around is the
// box's baseline-left). That flip reverses rotational handedness between
// the two spaces, so the X and Y axes below are NOT symmetric: X can be
// solved directly (no flip), but Y must be solved in native space first
// and converted back, or a positive rotationDeg would bend the wrong way
// and the "safe" edge would be the wrong one -- exactly the failure an
// earlier version of this function had (verified only against its own,
// equally-flipped, self-check; caught by comparing against a real
// exported PDF's content stream instead).
export function cornerAnchorPct(
  corner: PlacementCorner,
  marginPct: number,
  widthPct: number,
  heightPct: number,
  rotationDeg: number,
  pageWidthPt: number,
  pageHeightPt: number,
): { xPct: number; yPct: number } {
  const widthPt = (widthPct / 100) * pageWidthPt;
  const heightPt = (heightPct / 100) * pageHeightPt;
  const marginXPt = (marginPct / 100) * pageWidthPt;
  const marginYPt = (marginPct / 100) * pageHeightPt;

  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  // Local corners in PDF's own native drawing frame: (0,0) is the
  // baseline point pdf-lib rotates around, +x right, +y UP.
  const corners: Array<[number, number]> = [
    [0, 0],
    [widthPt, 0],
    [0, heightPt],
    [widthPt, heightPt],
  ];
  const rotated = corners.map(([x, y]): [number, number] => [x * cos - y * sin, x * sin + y * cos]);
  const minX = Math.min(...rotated.map(([x]) => x));
  const maxX = Math.max(...rotated.map(([x]) => x));
  const minY = Math.min(...rotated.map(([, y]) => y));
  const maxY = Math.max(...rotated.map(([, y]) => y));

  // X has no space flip: the visual anchor's x is the native anchor's x
  // directly. Both "start" and "end" always place their own named edge
  // exactly at its margin, unconditionally -- rotating the local origin
  // always maps back to itself, so the named edge can never go negative
  // regardless of content size. When the content is too big to fit the
  // page at all, this is what keeps the *requested* corner's own edge
  // correct and pushes all of the unavoidable overflow to the opposite
  // (unrequested) edge -- the smallest overflow possible while still
  // honoring the corner the user actually picked, rather than silently
  // sliding the anchor away from it.
  function xAnchor(align: "start" | "end" | "center"): number {
    if (align === "center") return pageWidthPt / 2 - (minX + maxX) / 2;
    if (align === "start") return marginXPt - minX;
    return pageWidthPt - marginXPt - maxX;
  }

  // Y is solved for nativeY (top-margin-safe: nativeY <= pageHeightPt -
  // marginYPt: bottom-margin-safe: nativeY >= marginYPt), each expressed
  // as a bound on visualY via nativeY = pageHeightPt - visualY - heightPt
  // + rotatedY, then converted back. "top" (visually near yPct=0) wants
  // the smallest valid visualY; "bottom" wants the largest. Same
  // unconditional-per-edge policy as X above -- see its comment.
  function yAnchor(align: "start" | "end" | "center"): number {
    if (align === "center") return pageHeightPt / 2 - heightPt + (minY + maxY) / 2;
    if (align === "start") return marginYPt - heightPt + maxY; // keeps the visual-top edge inside the top margin
    return pageHeightPt - marginYPt - heightPt + minY; // keeps the visual-bottom edge inside the bottom margin
  }

  const xAlign: "start" | "end" | "center" =
    corner === "top-left" || corner === "bottom-left" ? "start" : corner === "top-right" || corner === "bottom-right" ? "end" : "center";
  const yAlign: "start" | "end" | "center" =
    corner === "top-left" || corner === "top-right" ? "start" : corner === "bottom-left" || corner === "bottom-right" ? "end" : "center";

  const xPt = xAnchor(xAlign);
  const yPt = yAnchor(yAlign);

  return { xPct: (xPt / pageWidthPt) * 100, yPct: (yPt / pageHeightPt) * 100 };
}

// Generates a grid of top-left anchors covering the full 0-100% page area,
// spaced by tileSpacingPct between repeats of a box of the given size.
// Always returns at least one anchor (a single centered repeat) even if the
// box is larger than the page, rather than an empty tiling.
export function computeTilePositions(
  widthPct: number,
  heightPct: number,
  tileSpacingPct: number,
): Array<{ xPct: number; yPct: number }> {
  const stepX = Math.max(widthPct + tileSpacingPct, 1);
  const stepY = Math.max(heightPct + tileSpacingPct, 1);
  const positions: Array<{ xPct: number; yPct: number }> = [];

  for (let y = 0; y <= 100 - Math.min(heightPct, 100); y += stepY) {
    for (let x = 0; x <= 100 - Math.min(widthPct, 100); x += stepX) {
      positions.push({ xPct: x, yPct: y });
    }
  }

  if (positions.length === 0) {
    positions.push({ xPct: Math.max(0, (100 - widthPct) / 2), yPct: Math.max(0, (100 - heightPct) / 2) });
  }

  return positions;
}

// --- Page-rotation <-> PDF-native-space bridge -------------------------
// Moved from lib/pdf/watermark/export.ts verbatim. A page's own /Rotate
// value (0/90/180/270) changes which physical edge is "up" on screen
// without changing the PDF's underlying native coordinate space, so any
// tool placing content by *visual* page position must convert through
// these before calling pdf-lib's drawText/drawImage.

export type PageRotation = 0 | 90 | 180 | 270;

export function normalizePageRotation(angle: number): PageRotation {
  const normalized = ((Math.round(angle / 90) * 90) % 360 + 360) % 360;
  return normalized === 90 || normalized === 180 || normalized === 270 ? normalized : 0;
}

export function visualPageSize(rotation: PageRotation, nativeWidth: number, nativeHeight: number) {
  return rotation === 90 || rotation === 270
    ? { width: nativeHeight, height: nativeWidth }
    : { width: nativeWidth, height: nativeHeight };
}

export function toNativePoint(
  rotation: PageRotation,
  nativeWidth: number,
  nativeHeight: number,
  visualX: number,
  visualY: number,
): { x: number; y: number } {
  switch (rotation) {
    case 90:
      return { x: visualY, y: visualX };
    case 180:
      return { x: nativeWidth - visualX, y: visualY };
    case 270:
      return { x: nativeWidth - visualY, y: nativeHeight - visualX };
    default:
      return { x: visualX, y: nativeHeight - visualY };
  }
}

export function composeRotationDegrees(pageRotation: PageRotation, additionalDegrees: number): number {
  return ((pageRotation + additionalDegrees) % 360 + 360) % 360;
}

// Manual placement's rotation-safe native anchor: converts a box's fixed
// VISUAL center (from a stored top-left + its own width/height) into
// native space via toNativePoint (a pure coordinate conversion using the
// PAGE's own rotation only), then finds the native draw anchor that keeps
// that exact point as the rotation pivot for the content's OWN rotation
// (totalRotateDeg). Result: turning the rotation knob spins the content
// around its own center -- the stored xPct/yPct never moves.
//
// Deliberately NOT used for corner placement's cornerAnchorPct, whose own
// "center" branch operates in a different (pre-page-rotation,
// pre-baseline-flip) coordinate frame; see
// docs/specs/watermark-manual-position-v1.1-spec.md section 7 for why
// unifying the two would risk the exact regression class this feature's
// freeze policy exists to prevent, for no real benefit.
export function manualNativeAnchor(
  rotation: PageRotation,
  nativeWidth: number,
  nativeHeight: number,
  visualWidth: number,
  visualHeight: number,
  topLeftXPct: number,
  topLeftYPct: number,
  widthPt: number,
  heightPt: number,
  totalRotateDeg: number,
): { x: number; y: number } {
  const centerVisualX = (topLeftXPct / 100) * visualWidth + widthPt / 2;
  const centerVisualY = (topLeftYPct / 100) * visualHeight + heightPt / 2;
  const nativeCenter = toNativePoint(rotation, nativeWidth, nativeHeight, centerVisualX, centerVisualY);
  return nativeAnchorForCenter(nativeCenter.x, nativeCenter.y, widthPt, heightPt, totalRotateDeg);
}
