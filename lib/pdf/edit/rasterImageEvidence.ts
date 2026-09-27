import type { PDFPageProxy } from "pdfjs-dist";
import {
  loadPdfJsModule,
  PAGE_RENDER_TIMEOUT_MS,
  withPageTimeout,
} from "../pdfjs.ts";

export type PdfJsRasterImageOps = Readonly<{
  paintImageXObject?: number;
  paintInlineImageXObject?: number;
  paintImageMaskXObject?: number;
  paintSolidColorImageMask?: number;
}>;

/**
 * True only when the actual PDF.js operator list paints raster/image-mask
 * content. Resource dictionaries alone are not enough: an unused image
 * resource must not make a page look scanned.
 */
export function hasRasterImageEvidence(
  fnArray: readonly number[],
  ops: PdfJsRasterImageOps,
): boolean {
  const imageOps = new Set(
    [
      ops.paintImageXObject,
      ops.paintInlineImageXObject,
      ops.paintImageMaskXObject,
      ops.paintSolidColorImageMask,
    ].filter((value): value is number => typeof value === "number"),
  );
  return fnArray.some((operation) => imageOps.has(operation));
}

/**
 * Browser-local, best-effort raster evidence for capability classification.
 * Failure returns false instead of promoting an unknown page to scanned.
 */
export async function detectRasterImageEvidence(
  page: Pick<PDFPageProxy, "getOperatorList">,
  pageNumber: number,
): Promise<boolean> {
  try {
    const [pdfjs, operatorList] = await Promise.all([
      loadPdfJsModule(),
      withPageTimeout(
        page.getOperatorList(),
        pageNumber,
        PAGE_RENDER_TIMEOUT_MS,
        "inspect image operators on",
      ),
    ]);
    return hasRasterImageEvidence(operatorList.fnArray, pdfjs.OPS);
  } catch {
    return false;
  }
}
