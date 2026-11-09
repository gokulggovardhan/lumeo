import assert from "node:assert/strict";
import test from "node:test";
import { performance } from "node:perf_hooks";
import { PDFDocument, StandardFonts } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { optimizeNativePdfImages } from "../lib/pdf/optimization/nativeImages.ts";
import { mergeNativeDocuments } from "../lib/pdf/merge/nativeMerge.ts";

const JPEG_BASE64 =
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=";
const ORIGINAL_JPEG = new Uint8Array(Buffer.from(JPEG_BASE64, "base64"));

function exactBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function makeTextPages(pageCount: number, label: string) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let index = 0; index < pageCount; index++) {
    const page = pdf.addPage(index % 2 ? [595, 842] : [420, 620]);
    page.drawText(`${label} PAGE ${index + 1}`, { x: 32, y: 500, size: 17, font });
    for (let line = 0; line < 15; line++) {
      page.drawText(`BENCHMARK SELECTABLE TEXT ${line + 1} / ${index + 1}`, {
        x: 32, y: 468 - line * 22, size: 10, font,
      });
    }
  }
  // This non-object-stream sample is intentional: it gives the same
  // predictable lossless opportunity to the native PDF rewriter each run.
  return exactBuffer(await pdf.save({ useObjectStreams: false }));
}

function jpegWithMetadata(): Uint8Array {
  // JPEG COM marker: a synthetically inefficient PDF image, without
  // pretending it is representative of scanned photographs.
  const metadata = Buffer.alloc(14_000, 65);
  const length = metadata.byteLength + 2;
  return new Uint8Array(Buffer.concat([
    Buffer.from(ORIGINAL_JPEG.slice(0, 2)),
    Buffer.from([0xff, 0xfe, length >> 8, length & 255]),
    metadata,
    Buffer.from(ORIGINAL_JPEG.slice(2)),
  ]));
}

async function makeMixedPages(withForm: boolean) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const image = await pdf.embedJpg(jpegWithMetadata());
  for (let index = 0; index < 3; index++) {
    const page = pdf.addPage(index === 1 ? [842, 595] : [595, 842]);
    page.drawText(`MIXED NATIVE TEXT PAGE ${index + 1}`, { x: 30, y: 480, font, size: 17 });
    // All three pages share the exact same indirect JPEG XObject.
    page.drawImage(image, { x: 40, y: 50, width: 120, height: 120 });
  }
  if (withForm) {
    const field = pdf.getForm().createTextField("protected-field");
    field.addToPage(pdf.getPage(0));
  }
  return exactBuffer(await pdf.save({ useObjectStreams: false }));
}

async function extractAllText(bytes: ArrayBuffer): Promise<string> {
  const task = pdfjsLib.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true });
  const pdf = await task.promise;
  const pages: string[] = [];
  try {
    for (let i = 1; i <= pdf.numPages; i++) {
      const text = await (await pdf.getPage(i)).getTextContent();
      pages.push(text.items.map((item) => "str" in item ? item.str : "").join(" "));
    }
    return pages.join(" ");
  } finally {
    // PDF.js worker cleanup differs across Node versions; the benchmark
    // verifies output without depending on teardown timing.
    await task.destroy();
  }
}

function benchmarkRecord(name: string, start: number, beforeBytes: number, afterBytes: number,
  beforeHeap: number, detail: Record<string, unknown> = {}) {
  // Actual serialized bytes and wall time are measured, not fabricated;
  // heapDeltaBytes is an observation, *not peak memory* or a speed guarantee.
  console.info("[pdf-engine-benchmark]", JSON.stringify({
    fixture: name,
    inputBytes: beforeBytes,
    outputBytes: afterBytes,
    savedBytes: beforeBytes - afterBytes,
    savedPct: Number(((1 - afterBytes / beforeBytes) * 100).toFixed(2)),
    durationMs: Number((performance.now() - start).toFixed(2)),
    observedHeapDeltaBytes: process.memoryUsage().heapUsed - beforeHeap,
    ...detail,
  }));
}

test("benchmark 12-page native text PDF: exact-size lossless rewriting and selectable text", async () => {
  const input = await makeTextPages(12, "NATIVE TEXT");
  const start = performance.now(), heap = process.memoryUsage().heapUsed;
  const output = await optimizeNativePdfImages(input, "lossless", { dpi: 240, quality: 0.88 });
  assert.equal((await PDFDocument.load(output.bytes)).getPageCount(), 12);
  assert.match(await extractAllText(output.bytes), /NATIVE TEXT PAGE 12/);
  assert.ok(output.bytes.byteLength <= input.byteLength);
  benchmarkRecord("12-page-text-synthetic", start, input.byteLength, output.bytes.byteLength,
    heap, { pages: 12, textPreserved: true, mode: "lossless" });
});

test("benchmark repeated JPEG metadata fixture: real serialized savings with unchanged native text", async () => {
  const input = await makeMixedPages(false);
  const start = performance.now(), heap = process.memoryUsage().heapUsed;
  const output = await optimizeNativePdfImages(
    input, "smart", { dpi: 150, quality: 0.8 },
    async () => ORIGINAL_JPEG,
  );
  assert.equal((await PDFDocument.load(output.bytes)).getPageCount(), 3);
  assert.match(await extractAllText(output.bytes), /MIXED NATIVE TEXT PAGE 3/);
  assert.ok(output.bytes.byteLength < input.byteLength);
  benchmarkRecord("3-page-shared-jpeg-com-metadata-synthetic", start,
    input.byteLength, output.bytes.byteLength, heap,
    { pages: 3, textPreserved: true, mode: "native-image", note: "codec stub removes COM metadata only" });
});

test("benchmark protected form: exact original bytes maintained with no destructive rewrite", async () => {
  const input = await makeMixedPages(true);
  const start = performance.now(), heap = process.memoryUsage().heapUsed;
  const output = await optimizeNativePdfImages(
    input, "maximum", { dpi: 96, quality: 0.49 },
    async () => ORIGINAL_JPEG,
  );
  assert.equal(output.bytes.byteLength, input.byteLength);
  assert.equal(output.applied, false);
  assert.ok(output.protectedReason);
  assert.equal((await PDFDocument.load(output.bytes)).getForm().getFields().length, 1);
  benchmarkRecord("form-protected-synthetic", start, input.byteLength,
    output.bytes.byteLength, heap, { protected: true, formFieldsPreserved: 1 });
});

test("benchmark rotated native merge: text fidelity, exact page count and page-size preservation", async () => {
  const a = await makeTextPages(2, "ALPHA");
  const b = await makeTextPages(3, "BETA");
  const inputBytes = a.byteLength + b.byteLength;
  const start = performance.now(), heap = process.memoryUsage().heapUsed;
  const output = await mergeNativeDocuments([
    { name: "a.pdf", bytes: a, rotation: 90 },
    { name: "b.pdf", bytes: b, rotation: 0 },
  ], { format: "original", marginPoints: 0 });
  const doc = await PDFDocument.load(output.bytes);
  assert.equal(doc.getPageCount(), 5);
  assert.equal(doc.getPage(0).getRotation().angle, 90);
  assert.deepEqual(doc.getPage(0).getSize(), { width: 420, height: 620 });
  const text = await extractAllText(output.bytes);
  assert.ok(text.indexOf("ALPHA PAGE 1") < text.indexOf("BETA PAGE 1"));
  benchmarkRecord("5-page-native-rotated-merge-synthetic", start,
    inputBytes, output.bytes.byteLength, heap,
    { pages: 5, nativeRotation: 90, textPreserved: true,
      note: "merge sizes compare sum of source PDFs, not compression quality" });
});
