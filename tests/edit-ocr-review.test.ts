import assert from "node:assert/strict";
import test from "node:test";
import type { OcrPageResult, OcrWord } from "../lib/pdf/edit/localOcr.ts";
import {
  MAX_OCR_WORD_CORRECTION_CHARACTERS,
  OCR_REVIEW_LOW_CONFIDENCE_THRESHOLD,
  OcrReviewCorrectionError,
  buildReviewedOcrSearchableInput,
  lowConfidenceOcrWordIndices,
  publishedReviewedOcrCorrectionIndices,
  validateOcrWordCorrection,
} from "../lib/pdf/edit/ocrReview.ts";

function word(
  text: string,
  confidence: number,
  xPct: number,
): OcrWord {
  return Object.freeze({
    textSource: "ocr",
    text,
    confidence,
    boundsPct: Object.freeze({
      xPct,
      yPct: 10,
      widthPct: 12,
      heightPct: 5,
    }),
  });
}

function result(): OcrPageResult {
  return Object.freeze({
    textSource: "ocr",
    pageIndex: 0,
    text: "Invoice total",
    confidence: 83,
    renderScale: 2,
    imageWidthPx: 1200,
    imageHeightPx: 1600,
    orientationCorrection: 0,
    words: Object.freeze([
      word("Invoice", 94.5, 10),
      word("tota1", 61.25, 25),
    ]),
  });
}

test("OCR review validates one non-empty text fragment without line breaks", () => {
  assert.deepEqual(validateOcrWordCorrection("  total  "), {
    valid: true,
    text: "total",
  });
  assert.equal(validateOcrWordCorrection("").valid, false);
  assert.equal(validateOcrWordCorrection("   ").valid, false);
  assert.equal(validateOcrWordCorrection("two\nlines").valid, false);
  assert.equal(validateOcrWordCorrection("tab\ttext").valid, false);
  assert.equal(
    validateOcrWordCorrection(
      "x".repeat(MAX_OCR_WORD_CORRECTION_CHARACTERS + 1),
    ).valid,
    false,
  );
});

test("OCR review identifies low-confidence words without changing evidence", () => {
  const source = result();
  assert.equal(OCR_REVIEW_LOW_CONFIDENCE_THRESHOLD, 80);
  assert.deepEqual(lowConfidenceOcrWordIndices(source), [1]);
  assert.deepEqual(lowConfidenceOcrWordIndices(source, 95), [0, 1]);
  assert.throws(
    () => lowConfidenceOcrWordIndices(source, 101),
    /between 0 and 100/i,
  );
});

test("OCR review applies corrected text only and preserves confidence and geometry", () => {
  const source = result();
  const originalWord = source.words[1];
  const corrections = new Map<number, string>([[1, "total"]]);
  const reviewed = buildReviewedOcrSearchableInput(source, corrections);
  assert.equal(reviewed.kind, "ready");
  if (reviewed.kind !== "ready") return;

  assert.equal(reviewed.correctionCount, 1);
  assert.deepEqual(reviewed.correctedWordIndices, [1]);
  assert.equal(reviewed.words[0], source.words[0]);
  assert.notEqual(reviewed.words[1], originalWord);
  assert.equal(reviewed.words[1].text, "total");
  assert.equal(reviewed.words[1].confidence, originalWord.confidence);
  assert.equal(reviewed.words[1].boundsPct, originalWord.boundsPct);

  assert.equal(source.words[1].text, "tota1");
  assert.equal(source.text, "Invoice total");
});

test("OCR review ignores a no-op correction without manufacturing review evidence", () => {
  const source = result();
  const reviewed = buildReviewedOcrSearchableInput(
    source,
    new Map([[0, "Invoice"]]),
  );
  assert.equal(reviewed.kind, "ready");
  if (reviewed.kind !== "ready") return;
  assert.equal(reviewed.correctionCount, 0);
  assert.deepEqual(reviewed.correctedWordIndices, []);
  assert.equal(reviewed.words[0], source.words[0]);
});

test("OCR review rejects a stale word index instead of retargeting it", () => {
  const reviewed = buildReviewedOcrSearchableInput(
    result(),
    new Map([[9, "stale"]]),
  );
  assert.equal(reviewed.kind, "rejected");
  if (reviewed.kind !== "rejected") return;
  assert.equal(reviewed.wordIndex, 9);
  assert.match(reviewed.reason, /no longer belongs|current recognition/i);
});

test("OCR review throws the exact invalid correction index at publication preflight", () => {
  assert.throws(
    () =>
      buildReviewedOcrSearchableInput(
        result(),
        new Map([[1, "bad\nvalue"]]),
      ),
    (error: unknown) =>
      error instanceof OcrReviewCorrectionError &&
      error.wordIndex === 1 &&
      /line breaks/i.test(error.message),
  );
});

test("OCR review requires a valid page binding", () => {
  const source = result();
  const reviewed = buildReviewedOcrSearchableInput(
    { pageIndex: -1, words: source.words },
    new Map(),
  );
  assert.equal(reviewed.kind, "rejected");
  if (reviewed.kind !== "rejected") return;
  assert.match(reviewed.reason, /valid PDF page/i);
});


test("OCR review counts publication by exact word index, not duplicate text", () => {
  assert.deepEqual(
    publishedReviewedOcrCorrectionIndices([1, 2], [0, 2, 3]),
    [2],
  );
  assert.deepEqual(
    publishedReviewedOcrCorrectionIndices([2, 2, -1, 7], [2, 7]),
    [2, 7],
  );
});
