// lib/pdf/watermark/config.ts
//
// Self-contained (no project-file imports) so this module can run directly
// under `node --experimental-strip-types` for tests, matching the pattern
// established by lib/pdf/edit/elements.ts.
//
// Coordinates are percent of the visual (rotation-aware) page, 0-100,
// top-left origin -- same convention as Edit PDF's element model. Position
// (xPct/yPct) is the watermark's own top-left corner in single-placement
// mode; width/height for corner-anchoring and tiling are supplied by the
// caller (lib/pdf/watermark/export.ts), since actual rendered size depends
// on pdf-lib font metrics / image natural dimensions, which this pure
// module has no access to.

export type WatermarkPlacementMode = "single" | "tiled";

export type WatermarkPlacementCorner = "center" | "top-left" | "top-right" | "bottom-left" | "bottom-right";

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
  xPct: number; // anchor top-left, used when placementMode is "single"
  yPct: number;
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
    xPct: 50,
    yPct: 50,
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
    xPct: 50,
    yPct: 50,
    marginPct: DEFAULT_MARGIN_PCT,
    tileSpacingPct: DEFAULT_TILE_SPACING_PCT,
    pageRange: { mode: "all" },
  };
}

// Top-left anchor (xPct, yPct) for a box of the given size, for one of the
// five placement presets, inset from the page edge by marginPct. "center"
// ignores marginPct (a centered element has no edge to inset from).
export function cornerAnchorPct(
  corner: WatermarkPlacementCorner,
  marginPct: number,
  widthPct: number,
  heightPct: number,
): { xPct: number; yPct: number } {
  switch (corner) {
    case "top-left":
      return { xPct: marginPct, yPct: marginPct };
    case "top-right":
      return { xPct: Math.max(marginPct, 100 - marginPct - widthPct), yPct: marginPct };
    case "bottom-left":
      return { xPct: marginPct, yPct: Math.max(marginPct, 100 - marginPct - heightPct) };
    case "bottom-right":
      return {
        xPct: Math.max(marginPct, 100 - marginPct - widthPct),
        yPct: Math.max(marginPct, 100 - marginPct - heightPct),
      };
    case "center":
    default:
      return { xPct: (100 - widthPct) / 2, yPct: (100 - heightPct) / 2 };
  }
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
