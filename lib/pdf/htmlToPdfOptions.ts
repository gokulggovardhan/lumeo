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

// The captured DOM must be rendered at the PDF page's real pixel width, not
// whatever arbitrary width the on-screen preview happens to have -- jsPDF
// rescaling a differently-proportioned capture to fit the page is what
// causes generated output to look misaligned/different from the preview.
export function getPageContentWidthPx(pageSize: PageSize, orientation: Orientation): number {
  const { width, height } = PAGE_DIMENSIONS_MM[pageSize];
  const widthMm = orientation === "landscape" ? height : width;
  return Math.round((widthMm / MM_PER_INCH) * CSS_PX_PER_INCH);
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
    // Width stays explicit so the hidden export surface maps to the physical
    // PDF page width. Height deliberately remains automatic: html2pdf.js
    // clones and reflows the source into its own page-width container before
    // html2canvas captures it. Pinning that clone to a height measured before
    // the reflow can clip long documents in WebKit/Safari to a single page.
    // The current export surface is same-document Shadow DOM, so the older
    // cross-iframe height workaround is no longer needed.
    html2canvas: {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      width: options.contentWidthPx,
      windowWidth: options.contentWidthPx,
    },
    jsPDF: { unit: "mm", format: options.pageSize, orientation: options.orientation },
    // "css" mode makes html2pdf.js honor page-break-before/after/inside
    // rules in the source HTML when slicing the captured canvas into pages;
    // "legacy" keeps fixed-page-height slicing as a fallback for long flow.
    pagebreak: { mode: ["css", "legacy"] },
  };
}
