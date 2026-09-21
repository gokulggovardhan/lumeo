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
};

export type ReconstructedPage = {
  pageNumber: number;
  widthPt: number;
  heightPt: number;
  lines: ReconstructedTextLine[];
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
