// lib/pdf/crop/export.ts
//
// Flattens a CropConfig onto a freshly-loaded copy of the original PDF's
// bytes via pdf-lib, mirroring lib/pdf/watermark/export.ts's approach
// (load fresh, never mutate the pdfjs-rendered copy; per-page try/catch
// with skippedPages reported rather than losing the whole export).
//
// Coordinate conversion logic below is a deliberate duplicate rather than
// a shared import -- this module must load directly under Node's test runner (no path-alias
// or loader support), while a relative ".ts"-extensioned value import
// breaks Next.js's production type-check for any file a real app
// component also imports. Same constraint and same resolution already
// documented in lib/pdf/pageOrganizer.ts and lib/pdf/watermark/export.ts.

import { PDFDocument } from "pdf-lib";
import type { CropConfig } from "./config";

// resolveCropPageIndices is duplicated from ./config (same file-loading
// constraint as the coordinate helpers below) -- ./config remains the
// tested, canonical definition for the UI layer to import directly (a
// .tsx file compiled by Next.js's bundler, not loaded by the bare Node
// test runner, so a normal extensionless import is safe there).
function resolveCropPageIndices(scope: CropConfig["scope"], pageCount: number): number[] {
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

// Inverse of pdfjs's PageViewport rotation transform: converts a point in
// VISUAL space (points, origin top-left, y-down) into pdf-lib's NATIVE
// page space (points, origin bottom-left, y-up, unrotated
// MediaBox-relative). Mirrors the same transform used in
// lib/pdf/watermark/export.ts.
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
// axis-aligned native-space box -- this IS the crop-rectangle transform.
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

export async function exportCroppedPdf(
  originalBytes: ArrayBuffer,
  config: CropConfig,
): Promise<{ bytes: Uint8Array; skippedPages: number[] }> {
  const doc = await PDFDocument.load(originalBytes);
  const skippedPages: number[] = [];
  const pageIndices = resolveCropPageIndices(config.scope, doc.getPageCount());

  for (const pageIndex of pageIndices) {
    const page = doc.getPages()[pageIndex];
    if (!page) continue; // scope referenced a page that doesn't exist -- skip that page, not a failure

    try {
      const { width: nativeWidth, height: nativeHeight } = page.getSize();
      const rotation = normalizePageRotation(page.getRotation().angle);
      const { width: visualWidth, height: visualHeight } = visualPageSize(rotation, nativeWidth, nativeHeight);

      const visualX = (config.rect.xPct / 100) * visualWidth;
      const visualY = (config.rect.yPct / 100) * visualHeight;
      const visualRectWidth = (config.rect.widthPct / 100) * visualWidth;
      const visualRectHeight = (config.rect.heightPct / 100) * visualHeight;

      const nativeBox = toNativeBox(rotation, nativeWidth, nativeHeight, visualX, visualY, visualRectWidth, visualRectHeight);

      // Set both MediaBox and CropBox to the same rectangle -- not every
      // viewer respects CropBox over MediaBox, so both are written
      // (don't trust one PDF box in isolation for MediaBox vs. viewport
      // under rotation).
      page.setMediaBox(nativeBox.x, nativeBox.y, nativeBox.width, nativeBox.height);
      page.setCropBox(nativeBox.x, nativeBox.y, nativeBox.width, nativeBox.height);
    } catch {
      skippedPages.push(pageIndex);
    }
  }

  const bytes = await doc.save();
  return { bytes, skippedPages };
}
