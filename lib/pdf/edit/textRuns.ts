// lib/pdf/edit/textRuns.ts
//
// Phase 1 of true PDF text editing: read-only detection of a page's
// existing text runs and their on-screen bounding boxes, so the Edit PDF
// workspace can let a user click on real text instead of only ever adding
// new overlay elements. Later phases (in-place replacement, matching a
// clicked run back to the specific Tj/TJ operator that produced it so it
// can be rewritten) are separate, much harder problems -- this module only
// answers "what text is at this point on the page," nothing more.
//
// The bounding-box math below (angle, fontHeight, ascent, left/top) mirrors
// pdfjs's own TextLayer#appendText -- the exact method pdfjs uses to place
// its own text-selection layer -- rather than inventing a new PDF
// content-stream position calculation from scratch.
//
// Self-contained: no project-file imports, and deliberately NOT importing
// pdfjs-dist itself (every other pdfjs use in this codebase goes through
// lib/pdf/pdfjs.ts's dynamic `import("pdfjs-dist")`, never a static
// top-level import -- pdfjs-dist's browser build touches DOM globals like
// DOMMatrix at module-evaluation time, which crashes Next's server-side
// static export of any page that imports it statically). transformPoint2x3
// below reproduces pdfjs's own Util.transform(m1, m2) exactly (verified
// against pdfjs-dist's source), just without importing the package.

// Structural subsets of pdfjs's own TextItem/TextMarkedContent and
// PageViewport -- pdfjs-dist doesn't re-export those types from its
// package root, and pinning to their internal module path would couple
// this file to pdfjs's internal layout rather than its public API
// surface (page.getTextContent().items and page.getViewport().transform,
// both used exactly as pdfjs itself documents them).
type PdfTextItem = { str: string; transform: number[]; width: number; fontName: string };
type PdfTextMarkedContent = { type: string };
type PdfViewportTransform = number[];

// Matches pdfjs-dist's Util.transform(m1, m2) exactly: a 2x3 affine matrix
// product (m1 applied after m2), each matrix in pdfjs's own [a, b, c, d, e, f]
// convention.
export function transformPoint2x3(m1: number[], m2: number[]): number[] {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

// A widely-used approximation for a font's ascent as a fraction of its em
// size (close to Helvetica/Times/Arial). Exact per-font ascent needs the
// embedded font's own metrics, which detection doesn't load -- fine for
// hit-testing/highlighting and for matching a run to its content-stream
// operator (lib/pdf/edit/matchTextRun.ts), since both sides of that match
// go through this exact same formula and so stay consistent with each
// other even though neither is the "true" per-font ascent.
const DEFAULT_ASCENT_RATIO = 0.85;
const ROTATION_EPSILON = 1e-3;

export type TransformBoxOrigin = {
  left: number;
  top: number;
  fontHeight: number;
  rotated: boolean;
  angle: number;
};

// Given an already-viewport-combined text-rendering transform (device-pixel
// space; see transformPoint2x3 above), computes the same top-left-origin
// box position pdfjs's own TextLayer uses to place its text-selection
// divs. Shared by textRunsFromContent (pdfjs items) and
// lib/pdf/edit/matchTextRun.ts (this module's own content-stream
// operators) so both sides of a match are computed identically -- neither
// duplicates the ascent-ratio constant or the rotated-vs-axis-aligned
// branch on its own.
export function boxOriginFromTransform(tx: number[]): TransformBoxOrigin {
  const angle = Math.atan2(tx[1], tx[0]);
  const rotated = Math.abs(angle) > ROTATION_EPSILON;
  const fontHeight = Math.hypot(tx[2], tx[3]);
  const fontAscent = fontHeight * DEFAULT_ASCENT_RATIO;

  const left = rotated ? tx[4] + fontAscent * Math.sin(angle) : tx[4];
  const top = rotated ? tx[5] - fontAscent * Math.cos(angle) : tx[5] - fontAscent;

  return { left, top, fontHeight, rotated, angle };
}

export type DetectedTextRun = {
  str: string;
  fontName: string;
  xPct: number;
  yPct: number;
  widthPct: number;
  heightPct: number;
  /**
   * Font size in PDF points -- i.e. resolution-independent, exactly like
   * this type's xPct/yPct/widthPct/heightPct. Detection is therefore
   * completely decoupled from whatever scale the page bitmap happens to
   * be rasterized at, which is what lets the raster scale change (for
   * zoom) without re-running detection or invalidating anything already
   * matched to an operator.
   *
   * Was `fontSizePx` (device pixels at the raster viewport's scale) until
   * the high-zoom work. Renamed rather than silently redefined so every
   * consumer had to be revisited by the compiler -- a quiet unit change
   * here is precisely the class of bug that made the inline editor's font
   * size wrong in the first place.
   */
  fontSizePt: number;
  /**
   * True when the run isn't axis-aligned (rotated page or rotated text).
   * The box is still computed and roughly right, but callers that need an
   * exact box (e.g. drawing a tight highlight) should treat this as a
   * signal to be more conservative -- this module doesn't yet do the extra
   * work a rotated bounding box needs to stay pixel-accurate.
   */
  rotated: boolean;
};

function isTextItem(item: PdfTextItem | PdfTextMarkedContent): item is PdfTextItem {
  return "str" in item;
}

export function textRunsFromContent(
  items: Array<PdfTextItem | PdfTextMarkedContent>,
  viewportTransform: PdfViewportTransform,
  pageWidthPx: number,
  pageHeightPx: number,
): DetectedTextRun[] {
  if (pageWidthPx <= 0 || pageHeightPx <= 0) return [];

  const runs: DetectedTextRun[] = [];

  // pdfjs's TextItem.width is already the real advance width in PDF
  // point-space AT THE ITEM'S OWN FONT SIZE (i.e. it's the Tj/TJ advance,
  // not a per-em unit needing separate font-size scaling) -- converting it
  // to device pixels needs only the VIEWPORT's own scale factor, computed
  // once here from viewportTransform alone. Deliberately NOT computed from
  // each item's own combined tx (viewportTransform . item.transform) the
  // way boxOriginFromTransform's position math is: tx's a/b components
  // ALSO already bake in that same item's font size (via item.transform's
  // own scale), so multiplying item.width by hypot(tx[0], tx[1]) would
  // double-count the font size and inflate widthPx by roughly the font
  // size itself -- proven directly: a 24pt "Hello World" (real advance
  // 124.008pt) came out as widthPct 486% (the whole page many times over)
  // instead of the correct ~20%.
  const viewportScaleX = Math.hypot(viewportTransform[0], viewportTransform[1]);

  for (const item of items) {
    if (!isTextItem(item) || !item.str.trim()) continue;

    const tx = transformPoint2x3(viewportTransform, item.transform);
    const { left, top, fontHeight, rotated } = boxOriginFromTransform(tx);

    const widthPx = item.width * viewportScaleX;
    const heightPx = fontHeight;

    runs.push({
      str: item.str,
      fontName: item.fontName,
      xPct: (left / pageWidthPx) * 100,
      yPct: (top / pageHeightPx) * 100,
      widthPct: (widthPx / pageWidthPx) * 100,
      heightPct: (heightPx / pageHeightPx) * 100,
      // fontHeight is in the caller's viewport units; callers pass a
      // scale-1 (point-space) viewport so this is PDF points.
      fontSizePt: fontHeight,
      rotated,
    });
  }

  return runs;
}

// The CSS pixel size to render an on-page overlay's text at (the inline
// editor that replaces a run while it's being edited), so its glyphs stay
// the same size as the rendered page text underneath them.
//
// DetectedTextRun.fontSizePt is in PDF points. The stage displays the page
// at whatever CSS width it currently has, which changes with zoom and with
// the window -- so the displayed size of one point is exactly
// stageWidthPx / pageWidthPt. A CSS `font-size` in px does NOT scale with
// a percent-positioned ancestor, so without this conversion an inline
// editor's text keeps one fixed size while the page it sits on zooms
// underneath it.
//
// Deliberately expressed against the page's POINT width, never the raster
// bitmap's pixel width: the bitmap's scale is an implementation detail of
// how sharply the page happens to be rendered right now, and is about to
// become dynamic for high zoom. Tying on-screen text size to it would
// re-introduce, in a subtler form, exactly the bug this replaced -- an
// expression that mixed a fixed render-scale CONSTANT with the live
// px-per-point ratio, cancelling to a no-op whenever those two were equal
// and silently mis-sizing the text whenever they weren't.
//
// Falls back to the raw point size when the stage hasn't been measured yet
// (first paint, before any ResizeObserver callback). Note that
// ResizeObserver callbacks are delivered during the event loop's rendering
// steps, so in a non-compositing/background tab this fallback can persist
// until something forces a paint -- the value is still sane, just not yet
// zoom-aware.
export function overlayFontSizePx(
  runFontSizePt: number,
  pageWidthPt: number,
  stageWidthPx: number | null,
  minimumPx = 10,
): number {
  if (!stageWidthPx || stageWidthPx <= 0 || pageWidthPt <= 0) {
    return Math.max(minimumPx, runFontSizePt);
  }
  return Math.max(minimumPx, runFontSizePt * (stageWidthPx / pageWidthPt));
}

// Percent-space point-in-box hit test, matching the xPct/yPct/widthPct/
// heightPct convention textRunsFromContent returns and elements.ts already
// uses for overlay elements.
export function findTextRunAtPoint(
  runs: DetectedTextRun[],
  xPct: number,
  yPct: number,
): DetectedTextRun | null {
  // Later (visually on-top) runs are checked first, matching how overlay
  // elements are hit-tested elsewhere in this tool -- the item drawn last
  // is the one a click should land on if boxes overlap.
  for (let index = runs.length - 1; index >= 0; index -= 1) {
    const run = runs[index];
    if (
      xPct >= run.xPct &&
      xPct <= run.xPct + run.widthPct &&
      yPct >= run.yPct &&
      yPct <= run.yPct + run.heightPct
    ) {
      return run;
    }
  }
  return null;
}
