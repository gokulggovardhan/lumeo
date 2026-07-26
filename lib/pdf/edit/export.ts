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

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { EditElement } from "./elements";

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

export async function exportEditedPdf(
  originalBytes: ArrayBuffer,
  elements: EditElement[],
): Promise<{ bytes: Uint8Array; skippedPages: number[] }> {
  const doc = await PDFDocument.load(originalBytes);
  const helvetica = await doc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await doc.embedFont(StandardFonts.HelveticaBold);
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
      const { width: pageWidth, height: pageHeight } = page.getSize();

      for (const element of pageElements) {
        const xPt = (element.xPct / 100) * pageWidth;
        const widthPt = (element.widthPct / 100) * pageWidth;
        const heightPt = (element.heightPct / 100) * pageHeight;
        const topYPt = pageHeight - (element.yPct / 100) * pageHeight;

        if (element.type === "text") {
          if (!element.text.trim()) continue;
          const { r, g, b } = hexToRgb01(element.color);
          page.drawText(element.text, {
            x: xPt,
            y: topYPt - element.fontSizePt,
            size: element.fontSizePt,
            font: element.bold ? helveticaBold : helvetica,
            color: rgb(r, g, b),
          });
        } else if (element.type === "whiteout") {
          const { r, g, b } = element.color === "white" ? { r: 1, g: 1, b: 1 } : { r: 0, g: 0, b: 0 };
          page.drawRectangle({ x: xPt, y: topYPt - heightPt, width: widthPt, height: heightPt, color: rgb(r, g, b) });
        } else if (element.type === "shape") {
          const { r, g, b } = hexToRgb01(element.color);
          const color = rgb(r, g, b);
          if (element.shapeKind === "line") {
            page.drawLine({
              start: { x: xPt, y: topYPt },
              end: { x: xPt + widthPt, y: topYPt - heightPt },
              thickness: 2,
              color,
              opacity: element.opacity,
            });
          } else if (element.shapeKind === "ellipse") {
            page.drawEllipse({
              x: xPt + widthPt / 2,
              y: topYPt - heightPt / 2,
              xScale: widthPt / 2,
              yScale: heightPt / 2,
              color,
              opacity: element.opacity,
            });
          } else {
            // "rect" and "highlight" both render as a rectangle -- highlight
            // is just a rect with a lower default opacity, set at creation.
            page.drawRectangle({ x: xPt, y: topYPt - heightPt, width: widthPt, height: heightPt, color, opacity: element.opacity });
          }
        } else if (element.type === "ink") {
          let bytes = pngCache.get(element.pngDataUrl);
          if (!bytes) {
            const response = await fetch(element.pngDataUrl);
            bytes = new Uint8Array(await response.arrayBuffer());
            pngCache.set(element.pngDataUrl, bytes);
          }
          const embedded = await doc.embedPng(bytes);
          page.drawImage(embedded, { x: xPt, y: topYPt - heightPt, width: widthPt, height: heightPt });
        }
      }
    } catch {
      skippedPages.push(pageIndex);
    }
  }

  const bytes = await doc.save();
  return { bytes, skippedPages };
}
