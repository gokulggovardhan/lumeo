import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument, degrees } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { collectPageTextOperators } from "../lib/pdf/edit/formXObjects.ts";
import {
  addSearchableOcrTextLayer,
  firstMissingSearchableOcrWord,
  MAX_SEARCHABLE_OCR_WORDS,
} from "../lib/pdf/edit/searchableOcrLayer.ts";
import type { OcrPageResult, OcrWord } from "../lib/pdf/edit/localOcr.ts";

function word(
  text: string,
  xPct: number,
  yPct: number,
  widthPct: number,
  heightPct: number,
): OcrWord {
  return {
    textSource: "ocr",
    text,
    confidence: 98,
    boundsPct: { xPct, yPct, widthPct, heightPct },
  };
}

function result(words: readonly OcrWord[], pageIndex = 0): OcrPageResult {
  return {
    textSource: "ocr",
    pageIndex,
    text: words.map((item) => item.text).join(" "),
    confidence: 98,
    renderScale: 1,
    imageWidthPx: 600,
    imageHeightPx: 800,
    words,
  };
}

async function blankPdf(rotation = 0): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([600, 800]);
  if (rotation) page.setRotation(degrees(rotation));
  const bytes = await doc.save();
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

async function extractedText(bytes: Uint8Array): Promise<string> {
  const doc = await pdfjsLib.getDocument({
    data: bytes.slice(),
    useWorkerFetch: false,
  }).promise;
  try {
    const page = await doc.getPage(1);
    const content = await page.getTextContent();
    return content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  } finally {
    const destroy = (doc as { destroy?: () => Promise<void> | void }).destroy;
    if (destroy) await destroy.call(doc);
  }
}

test("searchable OCR verification requires one extracted occurrence per claimed word", () => {
  assert.equal(
    firstMissingSearchableOcrWord(["scan", "scan"], ["SCAN"]),
    "scan",
  );
  assert.equal(
    firstMissingSearchableOcrWord(["scan", "scan"], ["SCAN", "scan"]),
    null,
  );
});

test("searchable OCR verification does not accept a substring as proof", () => {
  assert.equal(
    firstMissingSearchableOcrWord(["scan"], ["SCANNED"]),
    "scan",
  );
  assert.equal(
    firstMissingSearchableOcrWord(["Scan"], ["  scan  "]),
    null,
  );
});

test("searchable OCR layer writes extractable text with native rendering mode 3", async () => {
  const source = await blankPdf();
  const outcome = await addSearchableOcrTextLayer(
    source,
    result([
      word("SCANNED", 10, 15, 20, 5),
      word("PAGE", 32, 15, 14, 5),
      word("SAMPLE", 48, 15, 20, 5),
    ]),
  );

  assert.deepEqual(outcome.writtenWords, ["SCANNED", "PAGE", "SAMPLE"]);
  assert.deepEqual(outcome.writtenWordIndices, [0, 1, 2]);
  assert.equal(outcome.skippedWords.length, 0);

  const text = await extractedText(outcome.bytes);
  assert.match(text, /SCANNED/);
  assert.match(text, /PAGE/);
  assert.match(text, /SAMPLE/);

  const reopened = await PDFDocument.load(outcome.bytes);
  const located = collectPageTextOperators(reopened, 0);
  assert.equal(located.length, 3);
  assert.ok(
    located.every((entry) => entry.operator.renderMode === 3),
    "every OCR text-showing operator must remain intentionally invisible",
  );
});

test("searchable OCR layer skips unsupported Unicode instead of corrupting or substituting it", async () => {
  const source = await blankPdf();
  const outcome = await addSearchableOcrTextLayer(
    source,
    result([
      word("Readable", 10, 20, 25, 5),
      word("😀", 40, 20, 8, 5),
    ]),
  );

  assert.deepEqual(outcome.writtenWords, ["Readable"]);
  assert.deepEqual(outcome.writtenWordIndices, [0]);
  assert.ok(
    outcome.skippedWords.some(
      (entry) =>
        entry.wordIndex === 1 &&
        entry.text === "😀" &&
        entry.reason === "unsupported-text",
    ),
  );

  const text = await extractedText(outcome.bytes);
  assert.match(text, /Readable/);
  assert.doesNotMatch(text, /😀/);
});

test("searchable OCR layer preserves extraction on rotated pages", async () => {
  const source = await blankPdf(90);
  const outcome = await addSearchableOcrTextLayer(
    source,
    result([
      word("ROTATED", 12, 18, 25, 5),
      word("SCAN", 40, 18, 15, 5),
    ]),
  );

  const text = await extractedText(outcome.bytes);
  assert.match(text, /ROTATED/);
  assert.match(text, /SCAN/);

  const reopened = await PDFDocument.load(outcome.bytes);
  const located = collectPageTextOperators(reopened, 0);
  assert.ok(located.every((entry) => entry.operator.renderMode === 3));
});

test("searchable OCR layer refuses pathological OCR word counts", async () => {
  const source = await blankPdf();
  const words = Array.from(
    { length: MAX_SEARCHABLE_OCR_WORDS + 1 },
    (_unused, index) => word(`w${index}`, 1, 1, 1, 1),
  );

  await assert.rejects(
    () => addSearchableOcrTextLayer(source, result(words)),
    /safety limit/i,
  );
});

test("searchable OCR layer rejects OCR results bound to a page that does not exist", async () => {
  const source = await blankPdf();
  await assert.rejects(
    () =>
      addSearchableOcrTextLayer(
        source,
        result([word("orphan", 10, 10, 20, 5)], 4),
      ),
    /does not exist/i,
  );
});


test("searchable OCR outcome preserves exact source indices across duplicate text and skips", async () => {
  const source = await blankPdf();
  const outcome = await addSearchableOcrTextLayer(
    source,
    result([
      word("same", 10, 30, 15, 5),
      word("😀", 30, 30, 8, 5),
      word("same", 45, 30, 15, 5),
    ]),
  );

  assert.deepEqual(outcome.writtenWords, ["same", "same"]);
  assert.deepEqual(outcome.writtenWordIndices, [0, 2]);
  assert.deepEqual(
    outcome.skippedWords.map((entry) => ({
      wordIndex: entry.wordIndex,
      reason: entry.reason,
    })),
    [{ wordIndex: 1, reason: "unsupported-text" }],
  );
});
