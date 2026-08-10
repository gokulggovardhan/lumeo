// lib/pdf/edit/export.ts
//
// Flattens EditElement[] onto a freshly-loaded copy of the original PDF's
// bytes via pdf-lib, mirroring SignPdfTool's export step (load fresh, never
// mutate the pdfjs-rendered copy). Percent-based element coordinates are
// converted to PDF points here, using each page's own reported size --
// this is the one place that conversion happens, per the design spec.
//
// Per-page try/catch: one page's draw failure is recorded in
// skippedPages and that page is left as-is, rather than losing the whole
// export -- consistent with the per-page isolation added to
// ExtractTextTool this session.
//
// Rotation handling: element percent-coordinates are relative to the
// on-screen preview, which pdfjs renders with the page's /Rotate already
// applied (pdfjs's PageViewport swaps width/height and applies a rotation
// matrix for 90/270). pdf-lib's page.getSize()/drawing calls operate in the
// page's native, unrotated content space and know nothing about /Rotate.
// toNativePoint() is the algebraic inverse of pdfjs's own rotation matrix
// (derived from pdfjs-dist's PageViewport constructor), so it recovers the
// exact native-space point a visually-placed element corresponds to for any
// of the four valid /Rotate values. Text and ink additionally need their
// drawn content counter-rotated (pdf-lib's `rotate` option, which rotates
// counterclockwise about the anchor point in native space) so glyphs/strokes
// stay upright once the page's own clockwise rotation is applied for
// display -- verified against pdf-lib's rotateRadians/rotateAndSkewText
// matrices, which use the standard CCW convention, so rotate: degrees(r)
// exactly cancels a page rotated r degrees clockwise. Shapes (rect/ellipse/
// line/highlight/whiteout) don't need this: they're rotation-symmetric, so
// mapping their corners into native space via toNativePoint is sufficient.

import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";
import type { EditElement } from "./elements";

type PageRotation = 0 | 90 | 180 | 270;

function hexToRgb01(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.replace("#", "");
  const value = Number.parseInt(normalized.length === 3
    ? normalized.split("").map((c) => c + c).join("")
    : normalized, 16);
  return {
    r: ((value >> 16) & 255) / 255,
    g: ((value >> 8) & 255) / 255,
    b: (value & 255) / 255,
  };
}

function normalizePageRotation(angle: number): PageRotation {
  const normalized = ((Math.round(angle / 90) * 90) % 360 + 360) % 360;
  return normalized === 90 || normalized === 180 || normalized === 270 ? normalized : 0;
}

// The page size the preview's percent coordinates are relative to -- pdfjs's
// rotation-aware viewport swaps width/height for 90/270, so this must match
// that, not the native (unrotated) MediaBox size.
function visualPageSize(rotation: PageRotation, nativeWidth: number, nativeHeight: number) {
  return rotation === 90 || rotation === 270
    ? { width: nativeHeight, height: nativeWidth }
    : { width: nativeWidth, height: nativeHeight };
}

// Inverse of pdfjs's PageViewport rotation transform: converts a point in
// VISUAL space (points, origin top-left, y-down) into pdf-lib's NATIVE page
// space (points, origin bottom-left, y-up, unrotated MediaBox-relative).
function toNativePoint(
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
function toNativeBox(
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

export async function exportEditedPdf(
  originalBytes: ArrayBuffer,
  elements: EditElement[],
): Promise<{ bytes: Uint8Array; skippedPages: number[] }> {
  const doc = await PDFDocument.load(originalBytes);
  // Embedded lazily, one per distinct bold/italic combination actually
  // used -- embedFont() unconditionally adds a font object to the
  // document, so eagerly embedding all four variants would bloat every
  // export with unused font objects whenever a document has no bold or
  // italic placed text at all (the common case).
  const fontCache = new Map<StandardFonts, Awaited<ReturnType<typeof doc.embedFont>>>();
  async function getFont(standardFont: StandardFonts) {
    let font = fontCache.get(standardFont);
    if (!font) {
      font = await doc.embedFont(standardFont);
      fontCache.set(standardFont, font);
    }
    return font;
  }
  const pngCache = new Map<string, Uint8Array>();
  const skippedPages: number[] = [];

  const byPage = new Map<number, EditElement[]>();
  for (const element of elements) {
    const list = byPage.get(element.pageIndex) ?? [];
    list.push(element);
    byPage.set(element.pageIndex, list);
  }

  for (const [pageIndex, pageElements] of byPage) {
    const page = doc.getPages()[pageIndex];
    if (!page) continue; // element refers to a page that doesn't exist -- skip that element, not a page failure

    try {
      const { width: nativeWidth, height: nativeHeight } = page.getSize();
      const rotation = normalizePageRotation(page.getRotation().angle);
      const { width: visualWidth, height: visualHeight } = visualPageSize(rotation, nativeWidth, nativeHeight);

      for (const element of pageElements) {
        const visualX = (element.xPct / 100) * visualWidth;
        const visualY = (element.yPct / 100) * visualHeight;
        const visualElementWidth = (element.widthPct / 100) * visualWidth;
        const visualElementHeight = (element.heightPct / 100) * visualHeight;

        if (element.type === "text") {
          if (!element.text.trim()) continue;
          const { r, g, b } = hexToRgb01(element.color);
          const color = rgb(r, g, b);
          const font = await getFont(
            element.bold && element.italic
              ? StandardFonts.HelveticaBoldOblique
              : element.bold
                ? StandardFonts.HelveticaBold
                : element.italic
                  ? StandardFonts.HelveticaOblique
                  : StandardFonts.Helvetica,
          );
          // Anchor is the visual top-left corner, nudged down by the font
          // size to approximate the baseline -- matches the pre-rotation
          // formula exactly when rotation is 0.
          const anchor = toNativePoint(rotation, nativeWidth, nativeHeight, visualX, visualY + element.fontSizePt);
          page.drawText(element.text, {
            x: anchor.x,
            y: anchor.y,
            size: element.fontSizePt,
            font,
            color,
            rotate: degrees(rotation),
          });
          if (element.underline) {
            // Line sits a small offset below the baseline anchor, in the
            // same visual space as the text itself, then mapped through the
            // same rotation so it tracks the glyphs exactly.
            const underlineOffset = element.fontSizePt * 0.08;
            const textWidth = font.widthOfTextAtSize(element.text, element.fontSizePt);
            const lineStart = toNativePoint(
              rotation,
              nativeWidth,
              nativeHeight,
              visualX,
              visualY + element.fontSizePt + underlineOffset,
            );
            const lineEnd = toNativePoint(
              rotation,
              nativeWidth,
              nativeHeight,
              visualX + textWidth,
              visualY + element.fontSizePt + underlineOffset,
            );
            page.drawLine({
              start: lineStart,
              end: lineEnd,
              thickness: Math.max(0.5, element.fontSizePt * 0.05),
              color,
            });
          }
        } else if (element.type === "whiteout") {
          const { r, g, b } = element.color === "white" ? { r: 1, g: 1, b: 1 } : { r: 0, g: 0, b: 0 };
          const box = toNativeBox(rotation, nativeWidth, nativeHeight, visualX, visualY, visualElementWidth, visualElementHeight);
          page.drawRectangle({ x: box.x, y: box.y, width: box.width, height: box.height, color: rgb(r, g, b) });
        } else if (element.type === "shape") {
          const { r, g, b } = hexToRgb01(element.color);
          const color = rgb(r, g, b);
          if (element.shapeKind === "line") {
            const start = toNativePoint(rotation, nativeWidth, nativeHeight, visualX, visualY);
            const end = toNativePoint(rotation, nativeWidth, nativeHeight, visualX + visualElementWidth, visualY + visualElementHeight);
            page.drawLine({ start, end, thickness: 2, color, opacity: element.opacity });
          } else if (element.shapeKind === "ellipse") {
            const box = toNativeBox(rotation, nativeWidth, nativeHeight, visualX, visualY, visualElementWidth, visualElementHeight);
            page.drawEllipse({
              x: box.x + box.width / 2,
              y: box.y + box.height / 2,
              xScale: box.width / 2,
              yScale: box.height / 2,
              color,
              opacity: element.opacity,
            });
          } else {
            // "rect" and "highlight" both render as a rectangle -- highlight
            // is just a rect with a lower default opacity, set at creation.
            const box = toNativeBox(rotation, nativeWidth, nativeHeight, visualX, visualY, visualElementWidth, visualElementHeight);
            page.drawRectangle({ x: box.x, y: box.y, width: box.width, height: box.height, color, opacity: element.opacity });
          }
        } else if (element.type === "ink") {
          let bytes = pngCache.get(element.pngDataUrl);
          if (!bytes) {
            const response = await fetch(element.pngDataUrl);
            bytes = new Uint8Array(await response.arrayBuffer());
            pngCache.set(element.pngDataUrl, bytes);
          }
          const embedded = await doc.embedPng(bytes);
          // drawImage's (x,y) is the image's local bottom-left corner
          // (before rotation is applied about that same point), so the
          // anchor is the visual bottom-left corner of the ink box.
          const anchor = toNativePoint(rotation, nativeWidth, nativeHeight, visualX, visualY + visualElementHeight);
          page.drawImage(embedded, {
            x: anchor.x,
            y: anchor.y,
            width: visualElementWidth,
            height: visualElementHeight,
            rotate: degrees(rotation),
          });
        }
      }
    } catch {
      skippedPages.push(pageIndex);
    }
  }

  const bytes = await doc.save();
  return { bytes, skippedPages };
}
