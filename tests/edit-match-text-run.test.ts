import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument, decodePDFRawStream, PDFRawStream, PDFStream, PDFArray, StandardFonts } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { textRunsFromContent } from "../lib/pdf/edit/textRuns.ts";
import { walkTextShowOperators } from "../lib/pdf/edit/contentStream.ts";
import { matchDetectedRunToOperator } from "../lib/pdf/edit/matchTextRun.ts";

async function decodedContentStreamBytes(pdfBytes: Uint8Array): Promise<Uint8Array> {
  const loaded = await PDFDocument.load(pdfBytes);
  const page = loaded.getPages()[0];
  const contents = page.node.Contents();
  const streams: PDFStream[] =
    contents instanceof PDFArray
      ? Array.from({ length: contents.size() }, (_unused, i) => loaded.context.lookup(contents.get(i), PDFStream))
      : [contents as PDFStream];

  const parts = streams.map((stream) => {
    if (!(stream instanceof PDFRawStream)) throw new Error("Expected a raw content stream.");
    return decodePDFRawStream(stream).decode();
  });
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    combined.set(part, offset);
    offset += part.length;
  }
  return combined;
}

async function loadPdfjsPage(bytes: Uint8Array, pageNumber = 1) {
  // pdfjs's getDocument({ data }) detaches the passed-in ArrayBuffer
  // (confirmed directly: reading `bytes` again afterward throws
  // "Cannot perform %TypedArray%.prototype.slice on a detached
  // ArrayBuffer") -- pass it a copy so callers can still use the original
  // bytes for anything else afterward, matching how the app itself
  // already guards this same call (see components/pdf/EditPdfTool.tsx's
  // copyArrayBuffer(pdf.bytes) before every openPdfJsDocument call).
  const doc = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
  return doc.getPage(pageNumber);
}

test("matchDetectedRunToOperator pairs a real pdfjs-detected run with the real operator that produced it", async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText("Hello World", { x: 50, y: 700, size: 18, font });
  const pdfBytes = await doc.save();

  const pdfjsPage = await loadPdfjsPage(pdfBytes);
  const scale = 1.3; // an arbitrary non-1 scale, matching EditPdfTool.tsx's PAGE_RENDER_SCALE
  const viewport = pdfjsPage.getViewport({ scale });
  const content = await pdfjsPage.getTextContent();
  const runs = textRunsFromContent(content.items as never, viewport.transform, viewport.width, viewport.height);
  assert.equal(runs.length, 1);

  const streamBytes = await decodedContentStreamBytes(pdfBytes);
  const operators = walkTextShowOperators(streamBytes);
  assert.equal(operators.length, 1);

  const matched = matchDetectedRunToOperator(runs[0], viewport.width, viewport.height, operators, viewport.transform);
  assert.equal(matched, operators[0]);
  assert.equal(Buffer.from(matched!.strings[0]).toString("latin1"), "Hello World");
});

test("matchDetectedRunToOperator picks the correct operator among several, not just the first", async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText("First line", { x: 50, y: 700, size: 18, font });
  page.drawText("Second line", { x: 50, y: 650, size: 18, font });
  page.drawText("Third line", { x: 50, y: 600, size: 18, font });
  const pdfBytes = await doc.save();

  const pdfjsPage = await loadPdfjsPage(pdfBytes);
  const viewport = pdfjsPage.getViewport({ scale: 1 });
  const content = await pdfjsPage.getTextContent();
  const runs = textRunsFromContent(content.items as never, viewport.transform, viewport.width, viewport.height);
  assert.equal(runs.length, 3);

  const streamBytes = await decodedContentStreamBytes(pdfBytes);
  const operators = walkTextShowOperators(streamBytes);
  assert.equal(operators.length, 3);

  // Match every detected run and confirm each pairs with the operator
  // carrying the SAME string -- not just "some" operator, and not always
  // the first one in document order.
  for (const run of runs) {
    const matched = matchDetectedRunToOperator(run, viewport.width, viewport.height, operators, viewport.transform);
    assert.ok(matched, `expected a match for run "${run.str}"`);
    assert.equal(Buffer.from(matched!.strings[0]).toString("latin1"), run.str);
  }
});

test("matchDetectedRunToOperator returns null when no operator is close enough", async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText("Hello World", { x: 50, y: 700, size: 18, font });
  const pdfBytes = await doc.save();

  const pdfjsPage = await loadPdfjsPage(pdfBytes);
  const viewport = pdfjsPage.getViewport({ scale: 1 });
  const content = await pdfjsPage.getTextContent();
  const runs = textRunsFromContent(content.items as never, viewport.transform, viewport.width, viewport.height);

  const matched = matchDetectedRunToOperator(runs[0], viewport.width, viewport.height, [], viewport.transform);
  assert.equal(matched, null);
});
