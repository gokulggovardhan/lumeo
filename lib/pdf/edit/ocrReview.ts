import type { OcrPageResult, OcrWord } from "./localOcr.ts";

export const OCR_REVIEW_LOW_CONFIDENCE_THRESHOLD = 80;
export const MAX_OCR_WORD_CORRECTION_CHARACTERS = 200;

export type OcrWordCorrectionValidation =
  | Readonly<{ valid: true; text: string }>
  | Readonly<{ valid: false; reason: string }>;

export type ReviewedOcrSearchableInput =
  | Readonly<{
      kind: "ready";
      pageIndex: number;
      words: readonly OcrWord[];
      correctionCount: number;
      correctedWordIndices: readonly number[];
    }>
  | Readonly<{
      kind: "rejected";
      reason: string;
      wordIndex: number | null;
    }>;

export function validateOcrWordCorrection(
  value: string,
): OcrWordCorrectionValidation {
  if (typeof value !== "string") {
    return { valid: false, reason: "OCR correction text must be a string." };
  }

  if (/[\r\n\t]/.test(value)) {
    return {
      valid: false,
      reason:
        "Correct one OCR word or short fragment at a time. Line breaks and tabs are not supported in a word correction.",
    };
  }
  if (/[\u0000-\u001f\u007f]/.test(value)) {
    return {
      valid: false,
      reason: "OCR correction text contains unsupported control characters.",
    };
  }

  const text = value.trim();
  if (!text) {
    return {
      valid: false,
      reason:
        "A reviewed OCR word cannot be empty. Leave the recognized word unchanged instead.",
    };
  }

  if (Array.from(text).length > MAX_OCR_WORD_CORRECTION_CHARACTERS) {
    return {
      valid: false,
      reason:
        "OCR corrections are limited to " +
        MAX_OCR_WORD_CORRECTION_CHARACTERS +
        " characters per recognized word.",
    };
  }

  return { valid: true, text };
}

export function lowConfidenceOcrWordIndices(
  result: Pick<OcrPageResult, "words">,
  threshold = OCR_REVIEW_LOW_CONFIDENCE_THRESHOLD,
): number[] {
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
    throw new Error("OCR review confidence threshold must be between 0 and 100.");
  }
  const indices: number[] = [];
  result.words.forEach((word, index) => {
    if (word.confidence < threshold) indices.push(index);
  });
  return indices;
}

export class OcrReviewCorrectionError extends Error {
  readonly wordIndex: number;

  constructor(wordIndex: number, message: string) {
    super(message);
    this.name = "OcrReviewCorrectionError";
    this.wordIndex = wordIndex;
  }
}

/**
 * Applies browser-local review text to a publication copy of OCR words.
 *
 * Recognition evidence itself is immutable: bounds, confidence and the
 * original OcrPageResult are never modified. The searchable-layer writer gets
 * a fresh word array whose only possible difference is reviewed text.
 *
 * Corrections are keyed by the exact word index of the exact OcrPageResult
 * owned by the UI revision. A missing/out-of-range index fails closed rather
 * than guessing which newly-recognized word a stale correction belonged to.
 */
export function buildReviewedOcrSearchableInput(
  result: Pick<OcrPageResult, "pageIndex" | "words">,
  corrections: ReadonlyMap<number, string>,
): ReviewedOcrSearchableInput {
  if (!Number.isInteger(result.pageIndex) || result.pageIndex < 0) {
    return {
      kind: "rejected",
      reason: "The OCR review is not bound to a valid PDF page.",
      wordIndex: null,
    };
  }

  for (const index of corrections.keys()) {
    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index >= result.words.length
    ) {
      return {
        kind: "rejected",
        reason:
          "An OCR correction no longer belongs to the current recognition result. Review the current page again.",
        wordIndex: Number.isInteger(index) ? index : null,
      };
    }
  }

  const correctedWordIndices: number[] = [];
  const words = result.words.map((word, index): OcrWord => {
    const candidate = corrections.get(index);
    if (candidate === undefined) return word;

    const validation = validateOcrWordCorrection(candidate);
    if (!validation.valid) {
      throw new OcrReviewCorrectionError(index, validation.reason);
    }
    if (validation.text === word.text) return word;

    correctedWordIndices.push(index);
    return Object.freeze({
      ...word,
      text: validation.text,
      boundsPct: word.boundsPct,
    });
  });

  return {
    kind: "ready",
    pageIndex: result.pageIndex,
    words: Object.freeze(words),
    correctionCount: correctedWordIndices.length,
    correctedWordIndices: Object.freeze(correctedWordIndices),
  };
}


/**
 * Returns only reviewed OCR word indices that the searchable-layer writer
 * actually wrote. Text is deliberately not used as identity: duplicate OCR
 * words are common, and a skipped corrected word must never be counted merely
 * because an identical uncorrected word was written elsewhere on the page.
 */
export function publishedReviewedOcrCorrectionIndices(
  correctedWordIndices: readonly number[],
  writtenWordIndices: readonly number[],
): number[] {
  const written = new Set(
    writtenWordIndices.filter(
      (index) => Number.isInteger(index) && index >= 0,
    ),
  );
  const published: number[] = [];
  const seen = new Set<number>();
  for (const index of correctedWordIndices) {
    if (
      !Number.isInteger(index) ||
      index < 0 ||
      seen.has(index) ||
      !written.has(index)
    ) {
      continue;
    }
    seen.add(index);
    published.push(index);
  }
  return published;
}
