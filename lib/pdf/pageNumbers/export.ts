// lib/pdf/pageNumbers/export.ts
//
// Flattens a PageNumbersConfig onto a freshly-loaded copy of the original
// PDF's bytes via pdf-lib, mirroring lib/pdf/watermark/export.ts's
// structure and reusing the same shared core modules and font pipeline --
// no positioning/rotation/font logic is duplicated here.

import { PDFDocument, degrees, rgb } from "pdf-lib";
import type { PageNumbersConfig } from "./config.ts";
import { formatPageLabel } from "./config.ts";
import { resolvePageIndices } from "../core/pageRanges.ts";
import {
  cornerAnchorPct,
  toNativePoint,
  normalizePageRotation,
  visualPageSize,
  manualNativeAnchor,
} from "../core/placement.ts";
import { hexToRgb01, embedTextFonts, pickFont } from "../core/text.ts";

export async function exportPageNumberedPdf(
  originalBytes: ArrayBuffer,
  config: PageNumbersConfig,
): Promise<{ bytes: Uint8Array; skippedPages: number[] }> {
  const doc = await PDFDocument.load(originalBytes);
  const skippedPages: number[] = [];
  const allSelectedIndices = resolvePageIndices(config.pageRange, doc.getPageCount());

  // skipFirstPage removes the lowest-index selected page from DRAWING, but
  // it still occupies position 1 in the numbering sequence -- see
  // PageNumbersConfig.skipFirstPage's own doc comment for why.
  const firstSelectedIndex = allSelectedIndices[0];
  const drawIndices = config.skipFirstPage
    ? allSelectedIndices.filter((index) => index !== firstSelectedIndex)
    : allSelectedIndices;
  const totalNumberedPages = allSelectedIndices.length;

  if (drawIndices.length === 0) {
    return { bytes: await doc.save(), skippedPages };
  }

  const fonts = await embedTextFonts(doc);
  const font = pickFont(fonts, config.bold, config.italic);
  const { r, g, b } = hexToRgb01(config.color);

  for (const pageIndex of drawIndices) {
    const page = doc.getPages()[pageIndex];
    if (!page) continue; // page range referenced a page that doesn't exist -- skip that page, not a failure

    try {
      // Sequence position within the FULL selected range (1-based), offset
      // by startNumber -- skipFirstPage only removes this page from
      // drawing, not from the position count, so later pages' numbers are
      // unaffected by whether the first page is shown.
      const sequencePosition = allSelectedIndices.indexOf(pageIndex) + 1;
      const displayNumber = config.startNumber + sequencePosition - 1;
      const text = formatPageLabel(displayNumber, totalNumberedPages, config);

      const { width: nativeWidth, height: nativeHeight } = page.getSize();
      const rotation = normalizePageRotation(page.getRotation().angle);
      const { width: visualWidth, height: visualHeight } = visualPageSize(rotation, nativeWidth, nativeHeight);

      const sizePt = config.fontSizePt;
      const textWidthPt = font.widthOfTextAtSize(text, sizePt);
      const textHeightPt = sizePt;
      const widthPct = (textWidthPt / visualWidth) * 100;
      const heightPct = (textHeightPt / visualHeight) * 100;

      const isManual = config.placement.mode === "manual";
      const anchor = config.placement.mode === "corner"
        ? cornerAnchorPct(config.placement.corner, config.marginPct, widthPct, heightPct, 0, visualWidth, visualHeight)
        : { xPct: config.placement.xPct, yPct: config.placement.yPct };

      // Page numbers are never rotated relative to their own content (only
      // the page's own /Rotate value composes in) -- so totalRotateDeg is
      // just the page's rotation, matching Watermark's composeRotationDegrees
      // with a zero user-chosen rotation.
      const totalRotateDeg = rotation;

      const nativeAnchor = isManual
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
    } catch {
      skippedPages.push(pageIndex);
    }
  }

  const bytes = await doc.save();
  return { bytes, skippedPages };
}
