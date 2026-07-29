// lib/pdf/watermark/config.ts
//
// Self-contained (no project-file imports) so this module can run directly
// under `node --experimental-strip-types` for tests, matching the pattern
// established by lib/pdf/edit/elements.ts.
//
// Coordinates are percent of the visual (rotation-aware) page, 0-100,
// top-left origin -- same convention as Edit PDF's element model. Width/
// height for corner-anchoring and tiling are supplied by the caller
// (lib/pdf/watermark/export.ts), since actual rendered size depends on
// pdf-lib font metrics / image natural dimensions, which this pure module
// has no access to.

export type WatermarkPlacementMode = "single" | "tiled";

export type WatermarkPlacementCorner = "center" | "top-left" | "top-right" | "bottom-left" | "bottom-right";

// Corner placement is a PAGE-LOCAL constraint, not a document-level
// coordinate: "top-left, 4% margin" means something different in absolute
// points on every page, and a different rotated bounding box wherever page
// size/orientation differs. So a corner placement stores only the corner +
// (marginPct/rotationDeg/content size live elsewhere on WatermarkConfig,
// already page-independent) -- never a baked xPct/yPct -- and the caller
// (export.ts's per-page loop, or the single-page preview) must call
// cornerAnchorPct fresh for whichever page it's rendering. Manual
// placement (after a drag) has no page-local derivation to fall back on,
// so it's the one case that legitimately stores a raw xPct/yPct.
export type WatermarkSinglePlacement =
  | { mode: "corner"; corner: WatermarkPlacementCorner }
  | { mode: "manual"; xPct: number; yPct: number; allowOverflow?: boolean };

// v1.1 manual-position numeric inputs display in PDF points, not percent --
// converted on the fly from the currently-viewed page's own visual size, so
// the canonical stored value stays exactly xPct/yPct (never migrated to raw
// points; see docs/specs/watermark-manual-position-v1.1-spec.md section 2
// for why: raw points would reintroduce the mixed-page-size bug class
// v1.0.0 fixed, since one manual position can apply across a page range of
// different sizes). These two are pure unit-conversion, no clamping -- the
// caller clamps the result the same way a drag-commit already does.
export function pctToPoints(pct: number, pageSizePt: number): number {
  return (pct / 100) * pageSizePt;
}

export function pointsToPct(points: number, pageSizePt: number): number {
  if (pageSizePt <= 0) return 0;
  return (points / pageSizePt) * 100;
}

// v1.1 Phase 2: the 9-point anchor is a UI-only projection, never a second
// source of truth. WatermarkSinglePlacement's "manual" variant still stores
// exactly the box's top-left corner in percent, unchanged from Phase 1 --
// switching anchors only changes which point the numeric X/Y fields and the
// drag handle represent, translated to/from that stored top-left using the
// content's own widthPct/heightPct. See
// docs/specs/watermark-manual-position-v1.1-spec.md section 3.
export type WatermarkAnchor =
  | "top-left"
  | "top-center"
  | "top-right"
  | "center-left"
  | "center"
  | "center-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

function anchorFractions(anchor: WatermarkAnchor): { xFrac: number; yFrac: number } {
  const xFrac = anchor.includes("left") ? 0 : anchor.includes("right") ? 1 : 0.5;
  const yFrac = anchor.includes("top") ? 0 : anchor.includes("bottom") ? 1 : 0.5;
  return { xFrac, yFrac };
}

// Projects the stored top-left position into wherever the given anchor
// point currently sits on the box.
export function anchorPointFromTopLeft(
  topLeftXPct: number,
  topLeftYPct: number,
  widthPct: number,
  heightPct: number,
  anchor: WatermarkAnchor,
): { xPct: number; yPct: number } {
  const { xFrac, yFrac } = anchorFractions(anchor);
  return { xPct: topLeftXPct + xFrac * widthPct, yPct: topLeftYPct + yFrac * heightPct };
}

// Inverse of anchorPointFromTopLeft: given where the anchor point should
// land, returns the top-left percent to actually store.
export function topLeftFromAnchorPoint(
  anchorXPct: number,
  anchorYPct: number,
  widthPct: number,
  heightPct: number,
  anchor: WatermarkAnchor,
): { xPct: number; yPct: number } {
  const { xFrac, yFrac } = anchorFractions(anchor);
  return { xPct: anchorXPct - xFrac * widthPct, yPct: anchorYPct - yFrac * heightPct };
}

// Shared center-pivot rotation helper (v1.1 Phase 2). Returns the native-space
// draw anchor pdf-lib's drawText/drawImage `x,y` (and its rotation pivot)
// must use so that a box of (widthPt, heightPt), rotated by rotationDeg
// COUNTERCLOCKWISE around its own center (pdf-lib's actual rotate
// convention, native space, y-up), has that center land exactly at
// (centerXPt, centerYPt).
//
// Derivation: pdf-lib rotates the drawn box around the anchor point it's
// given, so after rotation the box's center is anchor + Rot(halfW, halfH)
// (Rot being the same rotation matrix cornerAnchorPct already uses for its
// corners). Solving for anchor: anchor = center - Rot(halfW, halfH).
//
// This is the general form of what cornerAnchorPct's own "center" branch
// already computed (anchored to the page's center specifically) -- see
// cornerAnchorPct below, which now calls this directly for corner==="center"
// and is regression-tested to produce byte-identical results to before this
// extraction (tests/watermark-config.test.ts's corner sweep).
export function nativeAnchorForCenter(
  centerXPt: number,
  centerYPt: number,
  widthPt: number,
  heightPt: number,
  rotationDeg: number,
): { x: number; y: number } {
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const halfW = widthPt / 2;
  const halfH = heightPt / 2;
  const rotatedHalfX = halfW * cos - halfH * sin;
  const rotatedHalfY = halfW * sin + halfH * cos;
  return { x: centerXPt - rotatedHalfX, y: centerYPt - rotatedHalfY };
}

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

// v1.1 Phase 3 alignment helpers -- each is a one-shot commit onto the
// stored top-left (same shape as a drag-end or numeric-input edit), not a
// live constraint. Pure percent-space math; no rotation/anchor algebra
// needed here since these are axis-aligned page placements.
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

export type WatermarkTextContent = {
  kind: "text";
  text: string;
  fontSizePt: number;
  color: string;
  bold: boolean;
  italic: boolean;
};

export type WatermarkImageContent = {
  kind: "image";
  imageDataUrl: string;
  imageFormat: "png" | "jpg";
};

export type WatermarkContent = WatermarkTextContent | WatermarkImageContent;

export type WatermarkPageRange =
  | { mode: "all" }
  | { mode: "first" }
  | { mode: "odd" }
  | { mode: "even" }
  | { mode: "custom"; pages: number[] }; // zero-based page indices

export type WatermarkConfig = {
  content: WatermarkContent;
  opacity: number; // 0-1
  rotationDeg: number; // user-chosen rotation, applied on top of the page's own rotation
  scale: number; // multiplier over the content's base rendered size
  placementMode: WatermarkPlacementMode;
  // Active anchor when placementMode is "single" (ignored, but retained
  // as-is, while placementMode is "tiled" -- so toggling tiled off
  // restores whatever single placement was set before, rather than
  // resetting it). See WatermarkSinglePlacement above for why corner mode
  // carries no coordinates.
  placement: WatermarkSinglePlacement;
  // UI-only projection for manual placement's numeric fields/drag handle
  // (see WatermarkAnchor above) -- ignored by export.ts entirely; stored
  // here only so the UI reopens with the same numeric-field semantics
  // after undo/reload.
  manualAnchor: WatermarkAnchor;
  marginPct: number; // inset used by corner-anchor presets
  tileSpacingPct: number; // gap between repeats in tiled mode
  pageRange: WatermarkPageRange;
};

export const DEFAULT_OPACITY = 0.35;
export const DEFAULT_ROTATION_DEG = 45;
export const DEFAULT_SCALE = 1;
export const DEFAULT_MARGIN_PCT = 4;
export const DEFAULT_TILE_SPACING_PCT = 8;
export const DEFAULT_TEXT_FONT_SIZE_PT = 36;
export const DEFAULT_TEXT_COLOR = "#c0392b";

export function createDefaultTextWatermarkConfig(): WatermarkConfig {
  return {
    content: {
      kind: "text",
      text: "CONFIDENTIAL",
      fontSizePt: DEFAULT_TEXT_FONT_SIZE_PT,
      color: DEFAULT_TEXT_COLOR,
      bold: true,
      italic: false,
    },
    opacity: DEFAULT_OPACITY,
    rotationDeg: DEFAULT_ROTATION_DEG,
    scale: DEFAULT_SCALE,
    placementMode: "single",
    placement: { mode: "corner", corner: "center" },
    manualAnchor: "top-left",
    marginPct: DEFAULT_MARGIN_PCT,
    tileSpacingPct: DEFAULT_TILE_SPACING_PCT,
    pageRange: { mode: "all" },
  };
}

export function createDefaultImageWatermarkConfig(imageDataUrl: string, imageFormat: "png" | "jpg"): WatermarkConfig {
  return {
    content: { kind: "image", imageDataUrl, imageFormat },
    opacity: DEFAULT_OPACITY,
    rotationDeg: 0,
    scale: DEFAULT_SCALE,
    placementMode: "single",
    placement: { mode: "corner", corner: "center" },
    manualAnchor: "top-left",
    marginPct: DEFAULT_MARGIN_PCT,
    tileSpacingPct: DEFAULT_TILE_SPACING_PCT,
    pageRange: { mode: "all" },
  };
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
// is bottom-up -- lib/pdf/watermark/export.ts's toNativePoint bridges the
// two via `nativeY = nativeHeight - visualY - heightPt` (the visual anchor
// names the box's top-left; the native anchor pdf-lib rotates around is
// the box's baseline-left). That flip reverses rotational handedness
// between the two spaces, so the X and Y axes below are NOT symmetric:
// X can be solved directly (no flip), but Y must be solved in native
// space first and converted back, or a positive rotationDeg would bend
// the wrong way and the "safe" edge would be the wrong one -- exactly the
// failure an earlier version of this function had (verified only against
// its own, equally-flipped, self-check; caught by comparing against a
// real exported PDF's content stream instead).
export function cornerAnchorPct(
  corner: WatermarkPlacementCorner,
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

// Parses a 1-based, human-entered page range string ("1-3,5,7-9") into
// zero-based page indices, clamped to [0, pageCount). Returns null if the
// input has no valid tokens (distinguishes "nothing selected" from "empty
// document"), so callers can show a validation error rather than silently
// exporting to zero pages.
export function parsePageRangeInput(input: string, pageCount: number): number[] | null {
  const indices = new Set<number>();

  for (const rawToken of input.split(",")) {
    const token = rawToken.trim();
    if (!token) continue;

    const rangeMatch = token.match(/^(\d+)\s*-\s*(\d+)$/);
    if (rangeMatch) {
      const start = Number.parseInt(rangeMatch[1], 10);
      const end = Number.parseInt(rangeMatch[2], 10);
      const [low, high] = start <= end ? [start, end] : [end, start];
      for (let page = low; page <= high; page += 1) {
        if (page >= 1 && page <= pageCount) indices.add(page - 1);
      }
      continue;
    }

    const single = Number.parseInt(token, 10);
    if (Number.isFinite(single) && single >= 1 && single <= pageCount) {
      indices.add(single - 1);
    }
  }

  if (indices.size === 0) return null;
  return Array.from(indices).sort((a, b) => a - b);
}

// Resolves a WatermarkPageRange into concrete zero-based page indices for a
// document with the given page count.
export function resolvePageIndices(pageRange: WatermarkPageRange, pageCount: number): number[] {
  switch (pageRange.mode) {
    case "all":
      return Array.from({ length: pageCount }, (_, index) => index);
    case "first":
      return pageCount > 0 ? [0] : [];
    case "odd":
      return Array.from({ length: pageCount }, (_, index) => index).filter((index) => index % 2 === 0);
    case "even":
      return Array.from({ length: pageCount }, (_, index) => index).filter((index) => index % 2 === 1);
    case "custom":
      return pageRange.pages.filter((index) => index >= 0 && index < pageCount);
    default:
      return [];
  }
}
