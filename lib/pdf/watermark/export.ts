// lib/pdf/watermark/export.ts
//
// Flattens a WatermarkConfig onto a freshly-loaded copy of the original
// PDF's bytes via pdf-lib, mirroring lib/pdf/edit/export.ts's approach
// (load fresh, never mutate the pdfjs-rendered copy; per-page try/catch
// with skippedPages reported rather than losing the whole export).
//
// Coordinate conversion logic is duplicated from lib/pdf/pageCoordinates.ts
// (the canonical, independently-tested definition) rather than imported --
// this module must load directly under Node's test runner (no path-alias
// or loader support), while a relative ".ts"-extensioned value import
// breaks Next.js's production type-check for any file a real app component
// also imports. Same constraint and same resolution already documented in
// lib/pdf/pageOrganizer.ts. Text/image rotation composes the page's own
// rotation with the user's chosen watermark rotation, so watermark content
// stays upright-relative-to-its-own-angle regardless of the page's
// /Rotate value.

import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFImage } from "pdf-lib";
import type { WatermarkConfig, WatermarkPageRange } from "./config";

// computeTilePositions/resolvePageIndices are duplicated from ./config
// (same file-loading constraint as the rotation helpers above) -- ./config
// remains the tested, canonical definition for the UI layer to import
// directly (a .tsx file compiled by Next.js's bundler, not loaded by the
// bare Node test runner, so a normal extensionless import is safe there).

function resolvePageIndices(pageRange: WatermarkPageRange, pageCount: number): number[] {
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

function computeTilePositions(
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

type PageRotation = 0 | 90 | 180 | 270;

function normalizePageRotation(angle: number): PageRotation {
  const normalized = ((Math.round(angle / 90) * 90) % 360 + 360) % 360;
  return normalized === 90 || normalized === 180 || normalized === 270 ? normalized : 0;
}

function visualPageSize(rotation: PageRotation, nativeWidth: number, nativeHeight: number) {
  return rotation === 90 || rotation === 270
    ? { width: nativeHeight, height: nativeWidth }
    : { width: nativeWidth, height: nativeHeight };
}

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

function composeRotationDegrees(pageRotation: PageRotation, additionalDegrees: number): number {
  return ((pageRotation + additionalDegrees) % 360 + 360) % 360;
}

// At scale 1, an image watermark renders at this fraction of the visual
// page width, aspect-locked -- keeps visual size consistent across
// differently-sized pages in the same document, matching how Edit PDF's
// element defaults are percent-of-page rather than absolute points.
const BASE_IMAGE_WIDTH_PCT = 25;

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

async function embedTextFonts(doc: PDFDocument) {
  const [regular, bold, italic, boldItalic] = await Promise.all([
    doc.embedFont(StandardFonts.Helvetica),
    doc.embedFont(StandardFonts.HelveticaBold),
    doc.embedFont(StandardFonts.HelveticaOblique),
    doc.embedFont(StandardFonts.HelveticaBoldOblique),
  ]);
  return { regular, bold, italic, boldItalic };
}

function pickFont(fonts: Awaited<ReturnType<typeof embedTextFonts>>, bold: boolean, italic: boolean): PDFFont {
  if (bold && italic) return fonts.boldItalic;
  if (bold) return fonts.bold;
  if (italic) return fonts.italic;
  return fonts.regular;
}

export async function exportWatermarkedPdf(
  originalBytes: ArrayBuffer,
  config: WatermarkConfig,
): Promise<{ bytes: Uint8Array; skippedPages: number[] }> {
  const doc = await PDFDocument.load(originalBytes);
  const skippedPages: number[] = [];
  const pageIndices = resolvePageIndices(config.pageRange, doc.getPageCount());

  if (config.content.kind === "text" && !config.content.text.trim()) {
    return { bytes: await doc.save(), skippedPages };
  }

  const fonts = config.content.kind === "text" ? await embedTextFonts(doc) : null;

  let embeddedImage: PDFImage | null = null;
  if (config.content.kind === "image") {
    const response = await fetch(config.content.imageDataUrl);
    const imageBytes = new Uint8Array(await response.arrayBuffer());
    embeddedImage = config.content.imageFormat === "png"
      ? await doc.embedPng(imageBytes)
      : await doc.embedJpg(imageBytes);
  }

  for (const pageIndex of pageIndices) {
    const page = doc.getPages()[pageIndex];
    if (!page) continue; // page range referenced a page that doesn't exist -- skip that page, not a failure

    try {
      const { width: nativeWidth, height: nativeHeight } = page.getSize();
      const rotation = normalizePageRotation(page.getRotation().angle);
      const { width: visualWidth, height: visualHeight } = visualPageSize(rotation, nativeWidth, nativeHeight);
      const totalRotateDeg = composeRotationDegrees(rotation, config.rotationDeg);

      if (config.content.kind === "text" && fonts) {
        const { text, fontSizePt, color, bold, italic } = config.content;
        const font = pickFont(fonts, bold, italic);
        const sizePt = fontSizePt * config.scale;
        const textWidthPt = font.widthOfTextAtSize(text, sizePt);
        const textHeightPt = sizePt;
        const widthPct = (textWidthPt / visualWidth) * 100;
        const heightPct = (textHeightPt / visualHeight) * 100;
        const { r, g, b } = hexToRgb01(color);

        const anchors = config.placementMode === "tiled"
          ? computeTilePositions(widthPct, heightPct, config.tileSpacingPct)
          : [{ xPct: config.xPct, yPct: config.yPct }];

        for (const anchor of anchors) {
          const visualX = (anchor.xPct / 100) * visualWidth;
          const visualY = (anchor.yPct / 100) * visualHeight;
          const nativeAnchor = toNativePoint(rotation, nativeWidth, nativeHeight, visualX, visualY + textHeightPt);
          page.drawText(text, {
            x: nativeAnchor.x,
            y: nativeAnchor.y,
            size: sizePt,
            font,
            color: rgb(r, g, b),
            opacity: config.opacity,
            rotate: degrees(totalRotateDeg),
          });
        }
      } else if (config.content.kind === "image" && embeddedImage) {
        const widthPct = BASE_IMAGE_WIDTH_PCT * config.scale;
        const widthPt = (widthPct / 100) * visualWidth;
        const aspect = embeddedImage.height / embeddedImage.width;
        const heightPt = widthPt * aspect;
        const heightPct = (heightPt / visualHeight) * 100;

        const anchors = config.placementMode === "tiled"
          ? computeTilePositions(widthPct, heightPct, config.tileSpacingPct)
          : [{ xPct: config.xPct, yPct: config.yPct }];

        for (const anchor of anchors) {
          const visualX = (anchor.xPct / 100) * visualWidth;
          const visualY = (anchor.yPct / 100) * visualHeight;
          const nativeAnchor = toNativePoint(rotation, nativeWidth, nativeHeight, visualX, visualY + heightPt);
          page.drawImage(embeddedImage, {
            x: nativeAnchor.x,
            y: nativeAnchor.y,
            width: widthPt,
            height: heightPt,
            opacity: config.opacity,
            rotate: degrees(totalRotateDeg),
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
