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
    height: number;
    windowWidth: number;
    windowHeight: number;
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
    // width/height/windowWidth/windowHeight are passed explicitly rather
    // than left for html2canvas to auto-detect from the source element's
    // iframe viewport -- an off-screen iframe's viewport can still report
    // its pre-resize height at capture time (a real, observed cross-frame
    // layout timing gap), silently producing a zero-height, blank capture.
    html2canvas: {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      width: options.contentWidthPx,
      height: options.contentHeightPx,
      windowWidth: options.contentWidthPx,
      windowHeight: options.contentHeightPx,
    },
    jsPDF: { unit: "mm", format: options.pageSize, orientation: options.orientation },
    // "css" mode makes html2pdf.js honor page-break-before/after/inside
    // rules in the source HTML when slicing the captured canvas into pages;
    // without it, only fixed-page-height ("legacy") slicing is applied and
    // an explicit forced page break in the user's CSS is ignored.
    pagebreak: { mode: ["css", "legacy"] },
  };
}
