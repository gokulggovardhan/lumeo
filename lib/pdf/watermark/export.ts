// lib/pdf/watermark/export.ts
//
// Flattens a WatermarkConfig onto a freshly-loaded copy of the original
// PDF's bytes via pdf-lib, mirroring lib/pdf/edit/export.ts's approach
// (load fresh, never mutate the pdfjs-rendered copy; per-page try/catch
// with skippedPages reported rather than losing the whole export).
//
// All positioning/rotation/page-range/font math is imported from
// lib/pdf/core/{anchors,placement,pageRanges,text}.ts -- this module used
// to duplicate that logic locally (a workaround for Node's test runner
// needing exact ".ts" extensions on relative value imports, which used to
// conflict with Next.js's typecheck); now that tsconfig.json enables
// `allowImportingTsExtensions`, both environments accept the same explicit
// ".ts"-extensioned import, so the duplication is gone. Text/image rotation
// composes the page's own rotation with the user's chosen watermark
// rotation, so watermark content stays upright-relative-to-its-own-angle
// regardless of the page's /Rotate value.

import { PDFDocument, degrees, rgb, type PDFImage } from "pdf-lib";
import type { WatermarkConfig } from "./config.ts";
import { resolvePageIndices } from "../core/pageRanges.ts";
import {
  cornerAnchorPct,
  computeTilePositions,
  toNativePoint,
  normalizePageRotation,
  visualPageSize,
  composeRotationDegrees,
  manualNativeAnchor,
} from "../core/placement.ts";
import { hexToRgb01, embedTextFonts, pickFont } from "../core/text.ts";

// At scale 1, an image watermark renders at this fraction of the visual
// page width, aspect-locked -- keeps visual size consistent across
// differently-sized pages in the same document, matching how Edit PDF's
// element defaults are percent-of-page rather than absolute points.
const BASE_IMAGE_WIDTH_PCT = 25;

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

        const isManualSingle = config.placementMode === "single" && config.placement.mode === "manual";
        const anchors = config.placementMode === "tiled"
          ? computeTilePositions(widthPct, heightPct, config.tileSpacingPct)
          : [config.placement.mode === "corner"
              ? cornerAnchorPct(config.placement.corner, config.marginPct, widthPct, heightPct, config.rotationDeg, visualWidth, visualHeight)
              : { xPct: config.placement.xPct, yPct: config.placement.yPct }];

        for (const anchor of anchors) {
          const nativeAnchor = isManualSingle
            ? manualNativeAnchor(rotation, nativeWidth, nativeHeight, visualWidth, visualHeight, anchor.xPct, anchor.yPct, textWidthPt, textHeightPt, totalRotateDeg)
            : toNativePoint(rotation, nativeWidth, nativeHeight, (anchor.xPct / 100) * visualWidth, (anchor.yPct / 100) * visualHeight + textHeightPt);
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

        const isManualSingle = config.placementMode === "single" && config.placement.mode === "manual";
        const anchors = config.placementMode === "tiled"
          ? computeTilePositions(widthPct, heightPct, config.tileSpacingPct)
          : [config.placement.mode === "corner"
              ? cornerAnchorPct(config.placement.corner, config.marginPct, widthPct, heightPct, config.rotationDeg, visualWidth, visualHeight)
              : { xPct: config.placement.xPct, yPct: config.placement.yPct }];

        for (const anchor of anchors) {
          const nativeAnchor = isManualSingle
            ? manualNativeAnchor(rotation, nativeWidth, nativeHeight, visualWidth, visualHeight, anchor.xPct, anchor.yPct, widthPt, heightPt, totalRotateDeg)
            : toNativePoint(rotation, nativeWidth, nativeHeight, (anchor.xPct / 100) * visualWidth, (anchor.yPct / 100) * visualHeight + heightPt);
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
