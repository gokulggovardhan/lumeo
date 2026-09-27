import {
  PDFDocument,
  StandardFonts,
  TextRenderingMode,
  beginText,
  endText,
  setTextRenderingMode,
} from "pdf-lib";
import type { OcrPageResult, OcrWord } from "./localOcr.ts";

export type SearchableOcrWordPlacement = Readonly<{
  text: string;
  xPt: number;
  yPt: number;
  fontSizePt: number;
}>;

export type SearchableOcrLayerResult = Readonly<{
  bytes: Uint8Array;
  pageIndex: number;
  wordCount: number;
}>;

export class SearchableOcrLayerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SearchableOcrLayerError";
  }
}

function finitePositive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new SearchableOcrLayerError(`${label} must be a positive finite value.`);
  }
  return value;
}

function normalizedWordText(word: OcrWord): string {
  return word.text.trim();
}

export function searchableOcrWordPlacement({
  word,
  pageWidthPt,
  pageHeightPt,
  widthAtOnePoint,
}: {
  word: OcrWord;
  pageWidthPt: number;
  pageHeightPt: number;
  widthAtOnePoint: number;
}): SearchableOcrWordPlacement {
  finitePositive(pageWidthPt, "PDF page width");
  finitePositive(pageHeightPt, "PDF page height");
  finitePositive(widthAtOnePoint, "OCR word font width");

  const text = normalizedWordText(word);
  if (!text) {
    throw new SearchableOcrLayerError("OCR words must contain visible text.");
  }

  const { xPct, yPct, widthPct, heightPct } = word.boundsPct;
  for (const [label, value] of Object.entries({ xPct, yPct, widthPct, heightPct })) {
    if (!Number.isFinite(value)) {
      throw new SearchableOcrLayerError(`OCR ${label} must be finite.`);
    }
  }
  if (
    xPct < 0 ||
    yPct < 0 ||
    widthPct <= 0 ||
    heightPct <= 0 ||
    xPct + widthPct > 100.000001 ||
    yPct + heightPct > 100.000001
  ) {
    throw new SearchableOcrLayerError(
      "OCR word geometry must stay inside the source page.",
    );
  }

  const xPt = (xPct / 100) * pageWidthPt;
  const targetWidthPt = (widthPct / 100) * pageWidthPt;
  const targetHeightPt = (heightPct / 100) * pageHeightPt;
  const bottomPt = pageHeightPt - ((yPct + heightPct) / 100) * pageHeightPt;

  // Searchable OCR is invisible, but its selection geometry should still
  // track the scanned word. Start from the OCR box height, then shrink only
  // when the Helvetica advance would spill outside the recognized box.
  const heightDrivenSize = Math.max(0.1, targetHeightPt * 0.82);
  const widthDrivenSize = targetWidthPt / widthAtOnePoint;
  const fontSizePt = Math.min(heightDrivenSize, widthDrivenSize);
  if (!Number.isFinite(fontSizePt) || fontSizePt < 0.1) {
    throw new SearchableOcrLayerError(
      "OCR word geometry is too small to create a reliable searchable text item.",
    );
  }

  // Helvetica's descender is roughly one fifth of the em. Placing the
  // baseline slightly above the OCR box bottom keeps PDF.js selection boxes
  // close to the source pixels while the text itself remains Tr=3 invisible.
  const yPt = bottomPt + fontSizePt * 0.18;

  return { text, xPt, yPt, fontSizePt };
}

/**
 * Adds an invisible searchable text layer to one OCR-proven scanned page.
 *
 * This mutates only a disposable PDFDocument loaded from sourceBytes and
 * returns serialized bytes. The caller remains responsible for publishing
 * those bytes through the existing ref-backed history snapshot, so Undo/Redo
 * authority does not move into this module.
 *
 * The first safe slice intentionally uses PDF Standard Helvetica. Any OCR
 * word that cannot be encoded in WinAnsi rejects the entire operation before
 * serialization. Phase 7.15 may add a controlled embedded Unicode font path;
 * this function must never silently substitute or drop unsupported glyphs.
 */
export async function addSearchableOcrTextLayer({
  sourceBytes,
  result,
}: {
  sourceBytes: ArrayBuffer;
  result: OcrPageResult;
}): Promise<SearchableOcrLayerResult> {
  if (!(sourceBytes instanceof ArrayBuffer) || sourceBytes.byteLength === 0) {
    throw new SearchableOcrLayerError("Searchable OCR requires non-empty PDF bytes.");
  }
  if (result.textSource !== "ocr") {
    throw new SearchableOcrLayerError("Only browser-local OCR evidence can create this searchable layer.");
  }
  if (!Number.isInteger(result.pageIndex) || result.pageIndex < 0) {
    throw new SearchableOcrLayerError("OCR page index must be a non-negative integer.");
  }

  const words = result.words.filter((word) => normalizedWordText(word).length > 0);
  if (words.length === 0) {
    throw new SearchableOcrLayerError("No recognized OCR words are available to make searchable.");
  }

  const doc = await PDFDocument.load(sourceBytes.slice(0));
  if (result.pageIndex >= doc.getPageCount()) {
    throw new SearchableOcrLayerError("The OCR result does not belong to a page in this PDF revision.");
  }
  const page = doc.getPage(result.pageIndex);
  const { width, height } = page.getSize();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  // Preflight every word before adding any page operators. Even though this
  // document is disposable, an all-or-nothing preflight makes the contract
  // explicit and prevents a future caller from accidentally accepting a
  // partial searchable layer.
  const placements = words.map((word) => {
    const text = normalizedWordText(word);
    try {
      font.encodeText(text);
    } catch {
      throw new SearchableOcrLayerError(
        `“${text}” contains characters that need an embedded Unicode font. Nothing was changed.`,
      );
    }
    let widthAtOnePoint: number;
    try {
      widthAtOnePoint = font.widthOfTextAtSize(text, 1);
    } catch {
      throw new SearchableOcrLayerError(
        `“${text}” could not be measured safely for the searchable OCR layer.`,
      );
    }
    return searchableOcrWordPlacement({
      word,
      pageWidthPt: width,
      pageHeightPt: height,
      widthAtOnePoint,
    });
  });

  page.pushOperators(
    beginText(),
    setTextRenderingMode(TextRenderingMode.Invisible),
    endText(),
  );
  for (const placement of placements) {
    page.drawText(placement.text, {
      x: placement.xPt,
      y: placement.yPt,
      size: placement.fontSizePt,
      font,
    });
  }
  page.pushOperators(
    beginText(),
    setTextRenderingMode(TextRenderingMode.Fill),
    endText(),
  );

  const bytes = await doc.save();
  return {
    bytes,
    pageIndex: result.pageIndex,
    wordCount: placements.length,
  };
}
