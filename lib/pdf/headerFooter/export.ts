// lib/pdf/headerFooter/export.ts
//
// Flattens a HeaderFooterConfig onto a freshly-loaded copy of the original
// PDF's bytes via pdf-lib, mirroring lib/pdf/pageNumbers/export.ts's
// structure and reusing the same shared core modules and font pipeline --
// no positioning/rotation/font logic is duplicated here. PDFDocument.load
// + .save() preserves the original document's metadata by default (pdf-lib
// only rewrites what's explicitly set), so no extra metadata-preservation
// code is needed.

import { PDFDocument, degrees, rgb } from "pdf-lib";
import type { HeaderFooterConfig, TextZoneConfig } from "./config.ts";
import { alignmentToCorner, renderZoneText } from "./config.ts";
import { resolvePageIndices } from "../core/pageRanges.ts";
import { cornerAnchorPct, toNativePoint, normalizePageRotation, visualPageSize } from "../core/placement.ts";
import { hexToRgb01, embedTextFonts, pickFont } from "../core/text.ts";

export async function exportHeaderFooterPdf(
  originalBytes: ArrayBuffer,
  config: HeaderFooterConfig,
  filename: string,
): Promise<{ bytes: Uint8Array; skippedPages: number[] }> {
  const doc = await PDFDocument.load(originalBytes);
  const skippedPages: number[] = [];
  const selectedIndices = resolvePageIndices(config.pageRange, doc.getPageCount());

  if (selectedIndices.length === 0) {
    return { bytes: await doc.save(), skippedPages };
  }

  const fonts = await embedTextFonts(doc);
  const font = pickFont(fonts, config.bold, config.italic);
  const { r, g, b } = hexToRgb01(config.color);
  const totalPages = selectedIndices.length;
  const firstSelectedIndex = selectedIndices[0];

  for (let position = 0; position < selectedIndices.length; position += 1) {
    const pageIndex = selectedIndices[position];
    const page = doc.getPages()[pageIndex];
    if (!page) continue; // page range referenced a page that doesn't exist -- skip that page, not a failure

    try {
      const isFirstSelected = config.firstPageDifferent && pageIndex === firstSelectedIndex;
      const headerZone: TextZoneConfig = isFirstSelected ? config.firstPageHeader : config.header;
      const footerZone: TextZoneConfig = isFirstSelected ? config.firstPageFooter : config.footer;

      const context = { pageNumber: position + 1, totalPages, filename };
      const headerText = renderZoneText(headerZone, context);
      const footerText = renderZoneText(footerZone, context);
      if (!headerText && !footerText) continue;

      const { width: nativeWidth, height: nativeHeight } = page.getSize();
      const rotation = normalizePageRotation(page.getRotation().angle);
      const { width: visualWidth, height: visualHeight } = visualPageSize(rotation, nativeWidth, nativeHeight);
      const sizePt = config.fontSizePt;
      const textHeightPt = sizePt;

      for (const [zone, text] of [["header", headerText] as const, ["footer", footerText] as const]) {
        if (!text) continue;
        const alignment = zone === "header" ? headerZone.alignment : footerZone.alignment;
        const textWidthPt = font.widthOfTextAtSize(text, sizePt);
        const widthPct = (textWidthPt / visualWidth) * 100;
        const heightPct = (textHeightPt / visualHeight) * 100;
        const corner = alignmentToCorner(zone, alignment);
        const anchor = cornerAnchorPct(corner, config.marginPct, widthPct, heightPct, 0, visualWidth, visualHeight);
        const nativeAnchor = toNativePoint(rotation, nativeWidth, nativeHeight, (anchor.xPct / 100) * visualWidth, (anchor.yPct / 100) * visualHeight + textHeightPt);

        page.drawText(text, {
          x: nativeAnchor.x,
          y: nativeAnchor.y,
          size: sizePt,
          font,
          color: rgb(r, g, b),
          opacity: config.opacity,
          rotate: degrees(rotation),
        });
      }
    } catch {
      skippedPages.push(pageIndex);
    }
  }

  const bytes = await doc.save();
  return { bytes, skippedPages };
}
