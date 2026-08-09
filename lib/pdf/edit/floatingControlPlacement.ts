// lib/pdf/edit/floatingControlPlacement.ts
//
// Phase 29: pure percent-space placement math shared by EditElementView.tsx
// (the delete pill above a selected element) and EditPdfTool.tsx (the
// inline text editor's Apply/Cancel toolbar + error tooltip). Both render a
// floating control anchored to a box that lives inside the PDF stage, which
// clips overflow -- a box near the top/bottom/left/right edge can leave its
// floating control partially or fully invisible if the control always
// renders on the same side. This module answers ONLY "which side should the
// control render on," given the anchor box's own percent-space geometry
// (xPct/yPct/widthPct/heightPct, the same convention every element/run in
// this tool already uses) -- it knows nothing about pixels, DOM nodes, or
// the actual stage size, deliberately: no stage measurement is available
// synchronously at render time here, and the percent-space heuristic below
// is a genuinely stage-size-independent proxy (a box in the top 12% of the
// PAGE, at any zoom or page size, is "near the top edge" in the same way).
//
// Self-contained (no project-file imports) so this can run directly under
// `node --experimental-strip-types` for tests, matching every other
// lib/pdf/edit/*.ts module's convention.

export type VerticalPlacement = "above" | "below";
export type HorizontalAlign = "start" | "center" | "end";

// How close to an edge (in percent of the page's own dimension) counts as
// "not enough room" for a control on that side. Deliberately generous
// (not a pixel-exact fit check, which would need a real stage measurement)
// -- a small position-flip heuristic, not a perfect one, per this phase's
// own scope.
export const DEFAULT_VERTICAL_MARGIN_PCT = 12;
export const DEFAULT_HORIZONTAL_MARGIN_PCT = 20;

// topPct/bottomPct are the anchor box's own top and bottom edges in percent
// (yPct and yPct+heightPct) -- NOT the control's. Decision order matches
// the box's own natural reading order: prefer above (today's default for
// both call sites) when there's room; fall back to below when there isn't;
// if genuinely neither side has room (a box that's nearly the full page
// height), keep the existing default (above) rather than inventing a third
// behavior for an edge case neither call site can actually produce today.
export function pickVerticalPlacement(
  topPct: number,
  bottomPct: number,
  marginPct: number = DEFAULT_VERTICAL_MARGIN_PCT,
): VerticalPlacement {
  if (topPct >= marginPct) return "above";
  if (100 - bottomPct >= marginPct) return "below";
  return "above";
}

// leftPct/rightPct are the anchor box's own left and right edges in percent
// (xPct and xPct+widthPct). "start"/"end" mean "anchor the control's own
// left/right edge to the box's left/right edge" (avoids the control
// overhanging past the box on the side that's short on room); "center"
// keeps today's default (or the near-default left-anchor for the inline
// editor's own toolbar) for a box with room on both sides.
export function pickHorizontalAlign(
  leftPct: number,
  rightPct: number,
  marginPct: number = DEFAULT_HORIZONTAL_MARGIN_PCT,
): HorizontalAlign {
  if (leftPct < marginPct) return "start";
  if (100 - rightPct < marginPct) return "end";
  return "center";
}
