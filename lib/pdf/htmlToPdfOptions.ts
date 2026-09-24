export type PageSize = "a4" | "letter" | "legal";
export type Orientation = "portrait" | "landscape";
export type MarginPreset = "none" | "normal" | "wide";

export interface Html2PdfOptions {
  margin: number | [number, number] | [number, number, number, number];
  filename: string;
  image: {
    type: "jpeg" | "png" | "webp";
    quality: number;
  };
  enableLinks?: boolean;
  html2canvas: {
    scale: number;
    useCORS: boolean;
    backgroundColor: string;
    width: number;
    windowWidth: number;
  };
  jsPDF: {
    unit: string;
    format: string | [number, number];
    orientation: "portrait" | "landscape";
  };
  pagebreak: {
    mode: Array<"avoid-all" | "css" | "legacy">;
  };
}

export const MARGIN_MM: Record<MarginPreset, number> = {
  none: 0,
  normal: 12,
  wide: 24,
};

const PAGE_DIMENSIONS_MM: Record<PageSize, { width: number; height: number }> = {
  a4: { width: 210, height: 297 },
  letter: { width: 215.9, height: 279.4 },
  legal: { width: 215.9, height: 355.6 },
};

const MM_PER_INCH = 25.4;
const CSS_PX_PER_INCH = 96;

function orientedPageDimensionsMm(
  pageSize: PageSize,
  orientation: Orientation,
): { width: number; height: number } {
  const dimensions = PAGE_DIMENSIONS_MM[pageSize];
  return orientation === "landscape"
    ? { width: dimensions.height, height: dimensions.width }
    : dimensions;
}

// The captured DOM must be rendered at the PDF page's real pixel width, not
// whatever arbitrary width the on-screen preview happens to have -- jsPDF
// rescaling a differently-proportioned capture to fit the page is what
// causes generated output to look misaligned/different from the preview.
export function getPageContentWidthPx(pageSize: PageSize, orientation: Orientation): number {
  const { width } = orientedPageDimensionsMm(pageSize, orientation);
  return Math.round((width / MM_PER_INCH) * CSS_PX_PER_INCH);
}

// html2pdf.js slices a supplied canvas using the printable page's inner
// height/width ratio. Lumeo uses the same ratio while preparing CSS page-break
// spacers on the live export surface, so direct browser capture and the final
// PDF splitter agree on the exact page boundary even when margins change.
export function getPageSliceHeightPx(
  pageSize: PageSize,
  orientation: Orientation,
  margin: MarginPreset,
  contentWidthPx: number,
): number {
  const { width, height } = orientedPageDimensionsMm(pageSize, orientation);
  const marginMm = MARGIN_MM[margin];
  const innerWidthMm = Math.max(width - marginMm * 2, 1);
  const innerHeightMm = Math.max(height - marginMm * 2, 1);
  return Math.max(1, Math.floor(contentWidthPx * (innerHeightMm / innerWidthMm)));
}

export function validateHtmlSource(source: string): string | null {
  if (!source.trim()) return "Add some HTML before generating a PDF.";
  return null;
}

export function buildHtml2PdfOptions(options: {
  fileName: string;
  pageSize: PageSize;
  orientation: Orientation;
  margin: MarginPreset;
  contentWidthPx: number;
  contentHeightPx: number;
}): Html2PdfOptions {
  return {
    filename: options.fileName,
    margin: MARGIN_MM[options.margin],
    image: { type: "jpeg", quality: 0.95 },
    // Kept as a conservative fallback configuration for html2pdf.js. The
    // production path captures Lumeo's sanitized live export surface directly
    // and supplies that canvas to html2pdf.js, bypassing its lossy DOM clone.
    html2canvas: {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      width: options.contentWidthPx,
      windowWidth: options.contentWidthPx,
    },
    jsPDF: { unit: "mm", format: options.pageSize, orientation: options.orientation },
    // Lumeo applies CSS/legacy page-break spacing on the live sanitized export
    // surface before direct capture. Retain these modes as a safe fallback if
    // html2pdf.js ever receives an element source again.
    pagebreak: { mode: ["css", "legacy"] },
  };
}
