// lib/pdf/crop/config.ts
//
// Self-contained (no project-file imports) so this module can run directly
// under `node --experimental-strip-types` for tests, matching the pattern
// established by lib/pdf/watermark/config.ts and lib/pdf/pageOrganizer.ts.
//
// Per docs/specs/crop-pdf-spec.md section 5: a crop rectangle is a
// PAGE-LOCAL constraint, not a document-level coordinate -- CropRect is
// defined in percent of each page's own visual (rotation-aware)
// dimensions, and the percent-to-native conversion happens fresh, per
// page, inside the export loop (lib/pdf/crop/export.ts). This mirrors
// the corner-placement architecture Watermark PDF v1.0.0 established
// after having to fix the opposite (document-level, precompute-once)
// design -- this module never makes that mistake in the first place.

export type CropRect = {
  // Percent of the visual (rotation-aware) page, 0-100, top-left origin --
  // same convention as Watermark's xPct/yPct and Edit PDF's element model.
  // Unlike Watermark (where width/height are derived from font metrics or
  // image size), the rect IS the whole config -- there is no external
  // content-size source to combine it with.
  xPct: number;
  yPct: number;
  widthPct: number;
  heightPct: number;
};

export type CropPageScope =
  | { mode: "all" }
  | { mode: "current"; pageIndex: number }
  | { mode: "custom"; pages: number[] }; // zero-based, same convention as WatermarkPageRange's "custom"

export type CropAspectPreset = "free" | "1:1" | "4:3" | "16:9" | "a4" | "letter" | "match-first-page";

export type CropConfig = {
  rect: CropRect;
  scope: CropPageScope;
  aspectPreset: CropAspectPreset;
};

export const DEFAULT_CROP_RECT: CropRect = { xPct: 10, yPct: 10, widthPct: 80, heightPct: 80 };

// Floor for width/height so a degenerate (zero-area) rect can never reach
// export.ts -- see isCropRectValid, which the UI must check before
// enabling the export action (mirrors Watermark's empty-text
// short-circuit in exportWatermarkedPdf).
export const MIN_CROP_DIMENSION_PCT = 1;

export function createDefaultCropConfig(): CropConfig {
  return {
    rect: { ...DEFAULT_CROP_RECT },
    scope: { mode: "all" },
    aspectPreset: "free",
  };
}

// Point-space aspect ratios (width/height) for the fixed presets. "a4" and
// "letter" use the same portrait point dimensions Watermark's own tests
// use for real-world page sizes (595.28x841.89 and 612x792 respectively).
const FIXED_ASPECT_RATIOS: Record<"1:1" | "4:3" | "16:9" | "a4" | "letter", number> = {
  "1:1": 1,
  "4:3": 4 / 3,
  "16:9": 16 / 9,
  a4: 595.28 / 841.89,
  letter: 612 / 792,
};

// Clamps a rect to stay within the page (0-100 on both axes) and above the
// minimum dimension floor, without changing its top-left position unless
// clamping the size would otherwise push it off the page.
export function clampCropRect(rect: CropRect): CropRect {
  const widthPct = Math.max(MIN_CROP_DIMENSION_PCT, Math.min(100, rect.widthPct));
  const heightPct = Math.max(MIN_CROP_DIMENSION_PCT, Math.min(100, rect.heightPct));
  const xPct = Math.max(0, Math.min(100 - widthPct, rect.xPct));
  const yPct = Math.max(0, Math.min(100 - heightPct, rect.yPct));
  return { xPct, yPct, widthPct, heightPct };
}

export function isCropRectValid(rect: CropRect): boolean {
  return (
    rect.widthPct >= MIN_CROP_DIMENSION_PCT &&
    rect.heightPct >= MIN_CROP_DIMENSION_PCT &&
    rect.xPct >= 0 &&
    rect.yPct >= 0 &&
    rect.xPct + rect.widthPct <= 100.0001 &&
    rect.yPct + rect.heightPct <= 100.0001
  );
}

// Recomputes a rect's size to match a target aspect ratio, keeping its
// CENTER fixed (per docs/specs/crop-pdf-spec.md section 2: "recomputes
// the rectangle's height (or width) around its current center, doesn't
// move the anchor corner" -- "anchor corner" there means the rect's
// identity/position anchor, i.e. its center, stays put; only its extent
// changes). Needs the page's own real dimensions because a percent-space
// aspect ratio is not the same as a point-space one on a non-square page
// -- same scale-invariance principle as cornerAnchorPct (only the RATIO
// of pageWidthPt to pageHeightPt matters, not their absolute unit, so
// rendered canvas pixel dimensions work exactly as well as real PDF
// points here too).
export function applyAspectPreset(
  rect: CropRect,
  preset: CropAspectPreset,
  pageWidthPt: number,
  pageHeightPt: number,
  matchAspectRatio?: number,
): CropRect {
  if (preset === "free") return rect;

  const targetRatio = preset === "match-first-page" ? (matchAspectRatio ?? pageWidthPt / pageHeightPt) : FIXED_ASPECT_RATIOS[preset];

  const widthPt = (rect.widthPct / 100) * pageWidthPt;
  const heightPt = (rect.heightPct / 100) * pageHeightPt;
  const centerXPt = (rect.xPct / 100) * pageWidthPt + widthPt / 2;
  const centerYPt = (rect.yPct / 100) * pageHeightPt + heightPt / 2;

  // Keep the current width, recompute height from the target ratio; if
  // that would overflow the page vertically, keep height instead and
  // recompute width -- whichever fits without shrinking the rect further
  // than necessary.
  let newWidthPt = widthPt;
  let newHeightPt = newWidthPt / targetRatio;
  if (newHeightPt > pageHeightPt) {
    newHeightPt = pageHeightPt;
    newWidthPt = newHeightPt * targetRatio;
  }
  if (newWidthPt > pageWidthPt) {
    newWidthPt = pageWidthPt;
    newHeightPt = newWidthPt / targetRatio;
  }

  const newXPt = centerXPt - newWidthPt / 2;
  const newYPt = centerYPt - newHeightPt / 2;

  return clampCropRect({
    xPct: (newXPt / pageWidthPt) * 100,
    yPct: (newYPt / pageHeightPt) * 100,
    widthPct: (newWidthPt / pageWidthPt) * 100,
    heightPct: (newHeightPt / pageHeightPt) * 100,
  });
}

// Resolves a CropPageScope into concrete zero-based page indices for a
// document with the given page count -- same shape and out-of-range
// filtering behavior as lib/pdf/watermark/config.ts's resolvePageIndices.
export function resolveCropPageIndices(scope: CropPageScope, pageCount: number): number[] {
  switch (scope.mode) {
    case "all":
      return Array.from({ length: pageCount }, (_, index) => index);
    case "current":
      return scope.pageIndex >= 0 && scope.pageIndex < pageCount ? [scope.pageIndex] : [];
    case "custom":
      return scope.pages.filter((index) => index >= 0 && index < pageCount);
    default:
      return [];
  }
}
