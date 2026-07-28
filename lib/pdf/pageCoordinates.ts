// lib/pdf/pageCoordinates.ts
//
// Shared rotation-aware coordinate transform for pdf-lib drawing. Any tool
// that places content on a page using percent coordinates relative to the
// pdfjs preview must convert through here before calling a pdf-lib draw
// method, because pdfjs's rotation-aware viewport (what on-screen percent
// coordinates are relative to) and pdf-lib's page.getSize() (the raw,
// unrotated MediaBox) disagree for any page with /Rotate 90/180/270.
//
// This is the same transform originally derived and verified for
// lib/pdf/edit/export.ts (Edit PDF's rotation-aware export fix), extracted
// here as a shared module for Watermark PDF. Edit PDF's own copy is left
// untouched per this task's explicit scope -- not revisited here.
//
// Derivation: pdfjs-dist's PageViewport constructor builds a 2D affine
// transform per rotation case; toNativePoint() is the algebraic inverse of
// that transform for viewBox = [0, 0, nativeWidth, nativeHeight], scale 1,
// no offset. Verified against real pdf-lib output (decompressed content
// stream operators) in tests/edit-pdf-export.test.ts during Edit PDF's
// rotation fix; the same verification method is applied to this module's
// own tests.

export type PageRotation = 0 | 90 | 180 | 270;

// Snaps to the nearest of the four PDF-legal rotation values; anything else
// (e.g. a corrupt /Rotate value) collapses to 0 rather than propagating.
export function normalizePageRotation(angle: number): PageRotation {
  const normalized = ((Math.round(angle / 90) * 90) % 360 + 360) % 360;
  return normalized === 90 || normalized === 180 || normalized === 270 ? normalized : 0;
}

// The page size the preview's percent coordinates are relative to -- pdfjs's
// rotation-aware viewport swaps width/height for 90/270, so this must match
// that, not the native (unrotated) MediaBox size.
export function visualPageSize(rotation: PageRotation, nativeWidth: number, nativeHeight: number) {
  return rotation === 90 || rotation === 270
    ? { width: nativeHeight, height: nativeWidth }
    : { width: nativeWidth, height: nativeHeight };
}

// Inverse of pdfjs's PageViewport rotation transform: converts a point in
// VISUAL space (points, origin top-left, y-down) into pdf-lib's NATIVE page
// space (points, origin bottom-left, y-up, unrotated MediaBox-relative).
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

// Maps an axis-aligned visual-space box (top-left origin, y-down) to an
// axis-aligned native-space box. Rotation is always a multiple of 90
// degrees, so an axis-aligned box always maps to another axis-aligned box --
// corner-mapping both opposite corners and taking min/max handles all four
// rotation cases without a separate width/height swap rule.
export function toNativeBox(
  rotation: PageRotation,
  nativeWidth: number,
  nativeHeight: number,
  visualX: number,
  visualY: number,
  visualWidth: number,
  visualHeight: number,
): { x: number; y: number; width: number; height: number } {
  const corner1 = toNativePoint(rotation, nativeWidth, nativeHeight, visualX, visualY);
  const corner2 = toNativePoint(rotation, nativeWidth, nativeHeight, visualX + visualWidth, visualY + visualHeight);
  return {
    x: Math.min(corner1.x, corner2.x),
    y: Math.min(corner1.y, corner2.y),
    width: Math.abs(corner2.x - corner1.x),
    height: Math.abs(corner2.y - corner1.y),
  };
}

// Composes a page's own rotation with a caller-chosen additional rotation
// into the single value pdf-lib's `rotate` option expects. pdf-lib rotates
// counterclockwise about the anchor point in native space; passing
// `degrees(pageRotation)` alone exactly cancels a page rotated
// `pageRotation` degrees clockwise for display (see toNativePoint's header
// comment). Adding a caller's own rotation on top composes correctly because
// both are expressed in the same native-space, counterclockwise-positive
// convention.
export function composeRotationDegrees(pageRotation: PageRotation, additionalDegrees: number): number {
  return ((pageRotation + additionalDegrees) % 360 + 360) % 360;
}
