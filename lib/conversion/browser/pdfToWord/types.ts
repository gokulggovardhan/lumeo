export type ReconstructedGlyph = {
  text: string;
  code: number | null;
  advancePt: number;
};

export type ReconstructedTextLine = {
  /**
   * A single independently positioned PDF text run.
   *
   * Despite the historical type name, this must not represent a whole visual
   * row. Fixed-layout PDFs often place several unrelated cells on the same
   * baseline, and concatenating them into one flowing Word paragraph destroys
   * column geometry.
   */
  text: string;
  xPt: number;
  yPt: number;
  widthPt: number;
  heightPt: number;
  fontSizePt: number;
  fontFamily: string;
  bold: boolean;
  italic: boolean;
  /** Source baseline in visual page points, top-left origin. */
  baselinePt?: number;
  /** Source text rotation. Zero remains the normal fixed-frame path. */
  rotationDeg?: number;
  sourceFontName?: string;
  fontWeight?: number;
  charSpacingPt?: number;
  wordSpacingPt?: number;
  horizontalScalingPct?: number;
  /**
   * Horizontal scale for the Word fallback font after comparing its known
   * metrics with the source PDF advance. This compensates substitution
   * without relying only on renderer-specific fitText behaviour.
   */
  wordScalePct?: number;
  textRisePt?: number;
  colorHex?: string | null;
  underline?: boolean;
  underlineColorHex?: string | null;
  hyperlinkUrl?: string | null;
  /** Original content-stream order, independent from absolute positioning. */
  readingOrderIndex?: number;
  /** Deterministic top-to-bottom/left-to-right visual order. */
  visualOrderIndex?: number;
  sourceKind?: "operator" | "pdfjs" | "ocr";
  /**
   * Kept in the visual background but not emitted as editable Word text when
   * Word's cross-renderer fixed-layout primitives cannot safely reproduce the
   * source transform (for example arbitrary rotated/clipping text).
   */
  visualOnly?: boolean;
  glyphs?: ReconstructedGlyph[];
  regionKind?: "semantic-text" | "fixed-layout-table" | "fixed-layout" | "footer" | "header";
};

export type ReconstructedRegion = {
  id: string;
  kind: "semantic-text" | "fixed-layout-table" | "fixed-layout" | "image" | "mixed";
  lineIndices: number[];
  xPt: number;
  yPt: number;
  widthPt: number;
  heightPt: number;
  columnAnchorsPt?: number[];
};

export type ReconstructedPage = {
  pageNumber: number;
  widthPt: number;
  heightPt: number;
  lines: ReconstructedTextLine[];
  regions?: ReconstructedRegion[];
  reconstructionMode?: "semantic-text" | "fixed-layout" | "complex-vector" | "image" | "mixed";
  operatorCoverageRatio?: number;
  backgroundImage?: Blob | File | null;
  backgroundExtension?: "jpg" | "png";
  /**
   * True when editable text pixels were removed from the raster fidelity
   * background before embedding it. The DOCX builder can then keep text
   * frames transparent instead of hiding duplicate raster text with opaque
   * white paragraph shading.
   */
  backgroundTextMasked?: boolean;
};

export type OcrTextLine = {
  text: string;
  xPct: number;
  yPct: number;
  widthPct: number;
  heightPct: number;
  fontSizePt?: number;
};

export interface PdfToWordOcrAdapter {
  recognize(
    image: Blob,
    pageNumber: number,
    signal: AbortSignal,
  ): Promise<OcrTextLine[]>;
}
