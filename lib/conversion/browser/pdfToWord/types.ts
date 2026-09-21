export type ReconstructedTextLine = {
  text: string;
  xPt: number;
  yPt: number;
  widthPt: number;
  heightPt: number;
  fontSizePt: number;
  fontFamily: string;
  bold: boolean;
  italic: boolean;
  textColorHex?: string;
  backgroundColorHex?: string;
};

export type ReconstructedPage = {
  pageNumber: number;
  widthPt: number;
  heightPt: number;
  lines: ReconstructedTextLine[];
  backgroundImage?: Blob | File | null;
  backgroundExtension?: "jpg" | "png";
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
