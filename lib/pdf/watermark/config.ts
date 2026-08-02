// lib/pdf/watermark/config.ts
//
// Watermark-specific config shape and defaults. The reusable positioning/
// anchor/page-range math this module used to define directly now lives in
// lib/pdf/core/{anchors,placement,pageRanges,text}.ts and is re-exported
// below unchanged, so every existing import site (this file's own exports)
// keeps working exactly as before. Value imports of the sibling core
// modules use an explicit ".ts" extension -- see lib/pdf/core/placement.ts's
// header comment for why that's required and safe here.
//
// Self-contained beyond the core modules (no other project-file imports) so
// this module can still run directly under `node --experimental-strip-types`
// for tests, matching the pattern established by lib/pdf/edit/elements.ts.
//
// Coordinates are percent of the visual (rotation-aware) page, 0-100,
// top-left origin -- same convention as Edit PDF's element model. Width/
// height for corner-anchoring and tiling are supplied by the caller
// (lib/pdf/watermark/export.ts), since actual rendered size depends on
// pdf-lib font metrics / image natural dimensions, which this pure module
// has no access to.

import type { Anchor } from "../core/anchors.ts";
import type { PlacementCorner } from "../core/placement.ts";
import type { PageRangeSelector } from "../core/pageRanges.ts";

export {
  anchorPointFromTopLeft,
  topLeftFromAnchorPoint,
  nativeAnchorForCenter,
} from "../core/anchors.ts";
export type { Anchor } from "../core/anchors.ts";

export {
  clampManualPosition,
  alignLeft,
  alignRight,
  alignTop,
  alignBottom,
  centerHorizontally,
  centerVertically,
  resetManualPosition,
  cornerAnchorPct,
  computeTilePositions,
} from "../core/placement.ts";
export type { PlacementCorner } from "../core/placement.ts";

export {
  parsePageRangeInput,
  resolvePageIndices,
} from "../core/pageRanges.ts";
export type { PageRangeSelector } from "../core/pageRanges.ts";

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

// Back-compat aliases: this module's own public API named these types
// "Watermark*" before the shared lib/pdf/core extraction. Kept as exact
// aliases (not copies) so every existing import site -- this file's own
// call sites, UI components, and tests -- keeps working unchanged.
export type WatermarkAnchor = Anchor;
export type WatermarkPlacementCorner = PlacementCorner;
export type WatermarkPageRange = PageRangeSelector;

export type WatermarkPlacementMode = "single" | "tiled";

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
