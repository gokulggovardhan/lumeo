// lib/pdf/core/anchors.ts
//
// Shared by any tool that positions content on a PDF page by percent-of-page
// coordinates (Watermark today; Page Numbers, Header & Footer, Images next).
// Self-contained (no project-file imports) so this module can be loaded
// directly under Node's test runner (`node --experimental-strip-types`) with
// no path-alias or loader support, the same constraint documented in
// lib/pdf/pageOrganizer.ts and lib/pdf/watermark/config.ts.
//
// Coordinates are percent of the visual (rotation-aware) page, 0-100,
// top-left origin. Width/height for anchor projection are supplied by the
// caller, since actual rendered size depends on pdf-lib font metrics / image
// natural dimensions, which this pure module has no access to.

export type Anchor =
  | "top-left"
  | "top-center"
  | "top-right"
  | "center-left"
  | "center"
  | "center-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

function anchorFractions(anchor: Anchor): { xFrac: number; yFrac: number } {
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
  anchor: Anchor,
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
  anchor: Anchor,
): { xPct: number; yPct: number } {
  const { xFrac, yFrac } = anchorFractions(anchor);
  return { xPct: anchorXPct - xFrac * widthPct, yPct: anchorYPct - yFrac * heightPct };
}

// Returns the native-space draw anchor pdf-lib's drawText/drawImage `x,y`
// (and its rotation pivot) must use so that a box of (widthPt, heightPt),
// rotated by rotationDeg COUNTERCLOCKWISE around its own center (pdf-lib's
// actual rotate convention, native space, y-up), has that center land
// exactly at (centerXPt, centerYPt).
//
// Derivation: pdf-lib rotates the drawn box around the anchor point it's
// given, so after rotation the box's center is anchor + Rot(halfW, halfH).
// Solving for anchor: anchor = center - Rot(halfW, halfH).
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
