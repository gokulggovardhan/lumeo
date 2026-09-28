import {
  PDFDocument,
  StandardFonts,
  TextRenderingMode,
  beginText,
  degrees,
  endText,
  setTextRenderingMode,
} from "pdf-lib";
import { encodeWithFallbackFont } from "./fallbackFont.ts";
import type { OcrPageResult, OcrWord } from "./localOcr.ts";

export const MAX_SEARCHABLE_OCR_WORDS = 5_000;

export type SearchableOcrSkippedWord = Readonly<{
  wordIndex: number;
  text: string;
  reason:
    | "empty"
    | "invalid-geometry"
    | "unsupported-text"
    | "too-small"
    | "draw-failed";
}>;

export type SearchableOcrLayerOutcome = Readonly<{
  bytes: Uint8Array;
  pageIndex: number;
  writtenWords: readonly string[];
  writtenWordIndices: readonly number[];
  skippedWords: readonly SearchableOcrSkippedWord[];
}>;

type PageRotation = 0 | 90 | 180 | 270;

type PreparedWord = Readonly<{
  wordIndex: number;
  text: string;
  boundsPct: OcrWord["boundsPct"];
}>;

function normalizeVerifiedOcrText(value: string): string {
  return value.replace(/\s+/g, " ").trim().normalize("NFKC").toLocaleLowerCase();
}

/**
 * Verifies OCR publication against independently extracted PDF.js text items.
 * Each claimed written word consumes one exact normalized item occurrence, so
 * duplicates need duplicate evidence and a substring inside another word can
 * never satisfy the proof accidentally.
 */
export function firstMissingSearchableOcrWord(
  writtenWords: readonly string[],
  extractedItems: readonly string[],
): string | null {
  const available = new Map<string, number>();
  for (const item of extractedItems) {
    const normalized = normalizeVerifiedOcrText(item);
    if (!normalized) continue;
    available.set(normalized, (available.get(normalized) ?? 0) + 1);
  }

  for (const word of writtenWords) {
    const normalized = normalizeVerifiedOcrText(word);
    if (!normalized) return word;
    const count = available.get(normalized) ?? 0;
    if (count <= 0) return word;
    if (count === 1) available.delete(normalized);
    else available.set(normalized, count - 1);
  }
  return null;
}

function normalizePageRotation(angle: number): PageRotation {
  const normalized = ((Math.round(angle / 90) * 90) % 360 + 360) % 360;
  return normalized === 90 || normalized === 180 || normalized === 270
    ? normalized
    : 0;
}

function visualPageSize(
  rotation: PageRotation,
  nativeWidth: number,
  nativeHeight: number,
) {
  return rotation === 90 || rotation === 270
    ? { width: nativeHeight, height: nativeWidth }
    : { width: nativeWidth, height: nativeHeight };
}

/**
 * Inverse of PDF.js PageViewport's 0/90/180/270-degree transform.
 * OCR boxes use the rendered-page coordinate system: top-left origin, y down.
 * pdf-lib draws in native page space: bottom-left origin, y up.
 */
function toNativePoint(
  rotation: PageRotation,
  nativeWidth: number,
  nativeHeight: number,
  visualX: number,
  visualY: number,
): { x: number; y: number } {
  switch (rotation) {
    case 90:
      return { x: visualY, y: visualX };
    case 180:
      return { x: nativeWidth - visualX, y: visualY };
    case 270:
      return { x: nativeWidth - visualY, y: nativeHeight - visualX };
    default:
      return { x: visualX, y: nativeHeight - visualY };
  }
}

function finitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function prepareWords(
  words: readonly OcrWord[],
): {
  prepared: PreparedWord[];
  skipped: SearchableOcrSkippedWord[];
} {
  if (words.length > MAX_SEARCHABLE_OCR_WORDS) {
    throw new Error(
      `This OCR page contains ${words.length} words; the searchable-layer safety limit is ${MAX_SEARCHABLE_OCR_WORDS}.`,
    );
  }

  const prepared: PreparedWord[] = [];
  const skipped: SearchableOcrSkippedWord[] = [];

  for (const [wordIndex, word] of words.entries()) {
    const text = word.text.replace(/\s+/g, " ").trim();
    if (!text) {
      skipped.push({ wordIndex, text: "", reason: "empty" });
      continue;
    }
    const { xPct, yPct, widthPct, heightPct } = word.boundsPct;
    if (
      !Number.isFinite(xPct) ||
      !Number.isFinite(yPct) ||
      !finitePositive(widthPct) ||
      !finitePositive(heightPct) ||
      xPct < 0 ||
      yPct < 0 ||
      xPct + widthPct > 100.001 ||
      yPct + heightPct > 100.001
    ) {
      skipped.push({ wordIndex, text, reason: "invalid-geometry" });
      continue;
    }

    // The initial searchable-layer writer deliberately uses Helvetica /
    // WinAnsi only. This is a search/accessibility layer, not a visible
    // substitute-font feature. Never corrupt unsupported Unicode and never
    // claim it was written.
    if (!encodeWithFallbackFont(text)) {
      skipped.push({ wordIndex, text, reason: "unsupported-text" });
      continue;
    }

    prepared.push({ wordIndex, text, boundsPct: { ...word.boundsPct } });
  }

  return { prepared, skipped };
}

/**
 * Adds an invisible (PDF text rendering mode 3) searchable text layer from a
 * browser-local OCR result. The raster/image page content is never replaced
 * or covered. The generated text is intentionally classified read-only by
 * Lumeo's existing INVISIBLE_TEXT_LAYER safety gate after reopen.
 *
 * This function does NOT publish history itself. Callers must bind the OCR
 * result to the exact current PDF revision, independently verify the saved
 * bytes, then publish them through the existing ref-backed history snapshot.
 */
export async function addSearchableOcrTextLayer(
  sourceBytes: ArrayBuffer,
  ocrResult: Pick<OcrPageResult, "pageIndex" | "words">,
): Promise<SearchableOcrLayerOutcome> {
  if (!(sourceBytes instanceof ArrayBuffer) || sourceBytes.byteLength === 0) {
    throw new Error("A non-empty PDF revision is required.");
  }
  if (!Number.isInteger(ocrResult.pageIndex) || ocrResult.pageIndex < 0) {
    throw new Error("OCR page index must be a non-negative integer.");
  }

  const doc = await PDFDocument.load(sourceBytes.slice(0));
  const page = doc.getPages()[ocrResult.pageIndex];
  if (!page) {
    throw new Error(`OCR page ${ocrResult.pageIndex + 1} does not exist in this PDF.`);
  }

  const { prepared, skipped } = prepareWords(ocrResult.words);
  if (prepared.length === 0) {
    const unsupported = skipped.filter(
      (word) => word.reason === "unsupported-text",
    ).length;
    throw new Error(
      unsupported > 0
        ? "None of the recognized words can be represented safely in the initial searchable-text font."
        : "The OCR result does not contain any words with safe searchable-layer geometry.",
    );
  }

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const { width: nativeWidth, height: nativeHeight } = page.getSize();
  const rotation = normalizePageRotation(page.getRotation().angle);
  const { width: visualWidth, height: visualHeight } = visualPageSize(
    rotation,
    nativeWidth,
    nativeHeight,
  );

  const placements: Array<{
    wordIndex: number;
    text: string;
    x: number;
    y: number;
    size: number;
  }> = [];

  for (const word of prepared) {
    const visualX = (word.boundsPct.xPct / 100) * visualWidth;
    const visualTop = (word.boundsPct.yPct / 100) * visualHeight;
    const visualWordWidth = (word.boundsPct.widthPct / 100) * visualWidth;
    const visualWordHeight = (word.boundsPct.heightPct / 100) * visualHeight;

    const heightSize = Math.max(1, Math.min(300, visualWordHeight * 0.82));
    let unitWidth = 0;
    try {
      unitWidth = font.widthOfTextAtSize(word.text, 1);
    } catch {
      skipped.push({
        wordIndex: word.wordIndex,
        text: word.text,
        reason: "unsupported-text",
      });
      continue;
    }
    if (!finitePositive(unitWidth) || !finitePositive(visualWordWidth)) {
      skipped.push({
        wordIndex: word.wordIndex,
        text: word.text,
        reason: "too-small",
      });
      continue;
    }

    // Fit the invisible text completely inside the OCR word box. Because the
    // text paints nothing, this sizing is about truthful selection/search
    // geometry rather than visual appearance.
    const widthSize = visualWordWidth / unitWidth;
    const size = Math.max(0.5, Math.min(heightSize, widthSize));
    if (!finitePositive(size) || size < 0.5) {
      skipped.push({
        wordIndex: word.wordIndex,
        text: word.text,
        reason: "too-small",
      });
      continue;
    }

    const baselineVisualY =
      visualTop + Math.min(visualWordHeight * 0.84, visualWordHeight - 0.25);
    const anchor = toNativePoint(
      rotation,
      nativeWidth,
      nativeHeight,
      visualX,
      baselineVisualY,
    );
    placements.push({
      wordIndex: word.wordIndex,
      text: word.text,
      x: anchor.x,
      y: anchor.y,
      size,
    });
  }

  if (placements.length === 0) {
    throw new Error(
      "No OCR words remained after searchable-layer placement validation.",
    );
  }

  const writtenWords: string[] = [];
  const writtenWordIndices: number[] = [];
  page.pushOperators(
    beginText(),
    setTextRenderingMode(TextRenderingMode.Invisible),
    endText(),
  );
  try {
    for (const placement of placements) {
      try {
        page.drawText(placement.text, {
          x: placement.x,
          y: placement.y,
          size: placement.size,
          font,
          rotate: degrees(rotation),
        });
        writtenWords.push(placement.text);
        writtenWordIndices.push(placement.wordIndex);
      } catch {
        skipped.push({
          wordIndex: placement.wordIndex,
          text: placement.text,
          reason: "draw-failed",
        });
      }
    }
  } finally {
    // Never let the invisible text state leak into later content appended by
    // this PDFDocument instance.
    page.pushOperators(
      beginText(),
      setTextRenderingMode(TextRenderingMode.Fill),
      endText(),
    );
  }

  if (writtenWords.length === 0) {
    throw new Error("The searchable OCR layer could not write any verified words.");
  }

  return {
    bytes: await doc.save(),
    pageIndex: ocrResult.pageIndex,
    writtenWords: Object.freeze(writtenWords),
    writtenWordIndices: Object.freeze(writtenWordIndices),
    skippedWords: Object.freeze(skipped),
  };
}
