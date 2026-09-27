import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument, rgb } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { collectPageTextOperators } from "../lib/pdf/edit/formXObjects.ts";
import type { OcrPageResult } from "../lib/pdf/edit/localOcr.ts";
import {
  SearchableOcrLayerError,
  addSearchableOcrTextLayer,
  searchableOcrWordPlacement,
} from "../lib/pdf/edit/searchableOcrLayer.ts";

function ocrResult(words: OcrPageResult["words"]): OcrPageResult {
  return {
    textSource: "ocr",
    pageIndex: 0,
    text: words.map((word) => word.text).join(" "),
    confidence: 97,
    renderScale: 2,
    imageWidthPx: 1000,
    imageHeightPx: 1000,
    words,
  };
}

async function onePagePdf(): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([600, 800]);
  page.drawRectangle({ x: 0, y: 0, width: 600, height: 800, color: rgb(0.96, 0.96, 0.96) });
  const bytes = await doc.save();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

test("searchable OCR geometry converts top-left percent boxes into PDF points", () => {
  const placement = searchableOcrWordPlacement({
    word: {
      textSource: "ocr",
      text: "Invoice",
      confidence: 95,
      boundsPct: { xPct: 10, yPct: 20, widthPct: 25, heightPct: 5 },
    },
    pageWidthPt: 600,
    pageHeightPt: 800,
    widthAtOnePoint: 3,
  });

  assert.equal(placement.text, "Invoice");
  assert.equal(placement.xPt, 60);
  assert.ok(Math.abs(placement.fontSizePt - 30) < 1e-9);
  assert.ok(Math.abs(placement.yPt - 605.4) < 1e-9);
});

test("searchable OCR rejects out-of-page geometry", () => {
  assert.throws(
    () =>
      searchableOcrWordPlacement({
        word: {
          textSource: "ocr",
          text: "Bad",
          confidence: 90,
          boundsPct: { xPct: 95, yPct: 10, widthPct: 10, heightPct: 5 },
        },
        pageWidthPt: 600,
        pageHeightPt: 800,
        widthAtOnePoint: 2,
      }),
    SearchableOcrLayerError,
  );
});

test("searchable OCR writes extractable text with invisible native rendering mode", async () => {
  const sourceBytes = await onePagePdf();
  const result = ocrResult([
    {
      textSource: "ocr",
      text: "SCANNED",
      confidence: 98,
      boundsPct: { xPct: 10, yPct: 15, widthPct: 20, heightPct: 4 },
    },
    {
      textSource: "ocr",
      text: "PAGE",
      confidence: 97,
      boundsPct: { xPct: 32, yPct: 15, widthPct: 12, heightPct: 4 },
    },
  ]);

  const searchable = await addSearchableOcrTextLayer({ sourceBytes, result });

  const pdfjs = await pdfjsLib.getDocument({ data: searchable.bytes }).promise;
  try {
    const page = await pdfjs.getPage(1);
    const content = await page.getTextContent();
    const extracted = (content.items as Array<{ str?: string }>)
      .map((item) => item.str ?? "")
      .join(" ");
    assert.match(extracted, /SCANNED/);
    assert.match(extracted, /PAGE/);
  } finally {
    await pdfjs.destroy();
  }

  const native = await PDFDocument.load(searchable.bytes);
  const operators = collectPageTextOperators(native, 0);
  const searchableOperators = operators.filter((entry) =>
    entry.operator.strings.some((value) => value.byteLength > 0),
  );
  assert.ok(searchableOperators.length >= 2);
  assert.ok(searchableOperators.every((entry) => entry.operator.renderMode === 3));
});

test("searchable OCR rejects unsupported Unicode atomically for the Standard-14 first slice", async () => {
  const sourceBytes = await onePagePdf();
  const result = ocrResult([
    {
      textSource: "ocr",
      text: "English",
      confidence: 98,
      boundsPct: { xPct: 10, yPct: 15, widthPct: 20, heightPct: 4 },
    },
    {
      textSource: "ocr",
      text: "తెలుగు",
      confidence: 96,
      boundsPct: { xPct: 10, yPct: 22, widthPct: 20, heightPct: 4 },
    },
  ]);

  await assert.rejects(
    addSearchableOcrTextLayer({ sourceBytes, result }),
    /embedded Unicode font.*Nothing was changed/i,
  );

  const original = await pdfjsLib.getDocument({ data: new Uint8Array(sourceBytes.slice(0)) }).promise;
  try {
    const page = await original.getPage(1);
    const content = await page.getTextContent();
    assert.equal((content.items as Array<{ str?: string }>).map((item) => item.str ?? "").join("").trim(), "");
  } finally {
    await original.destroy();
  }
});
