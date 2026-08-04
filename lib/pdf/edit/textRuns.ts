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
  /** Font size in device pixels at the viewport's scale, not PDF points. */
  fontSizePx: number;
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

  for (const item of items) {
    if (!isTextItem(item) || !item.str.trim()) continue;

    const tx = transformPoint2x3(viewportTransform, item.transform);
    const { left, top, fontHeight, rotated } = boxOriginFromTransform(tx);

    const scaleX = Math.hypot(tx[0], tx[1]);
    const widthPx = item.width * scaleX;
    const heightPx = fontHeight;

    runs.push({
      str: item.str,
      fontName: item.fontName,
      xPct: (left / pageWidthPx) * 100,
      yPct: (top / pageHeightPx) * 100,
      widthPct: (widthPx / pageWidthPx) * 100,
      heightPct: (heightPx / pageHeightPx) * 100,
      fontSizePx: fontHeight,
      rotated,
    });
  }

  return runs;
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
