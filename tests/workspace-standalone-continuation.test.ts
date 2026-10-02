import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { continuationTargetsFor } from "../lib/pdf/workspace/continuation.ts";
import { createFreshPdfContinuation } from "../lib/pdf/workspace/standaloneContinuation.ts";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

test("fresh standalone PDF results start with new identity and empty history", () => {
  const first = createFreshPdfContinuation({
    kind: "merge",
    fileName: "merged.pdf",
    byteLength: 2048,
    pageCount: 3,
  });
  const second = createFreshPdfContinuation({
    kind: "merge",
    fileName: "merged.pdf",
    byteLength: 2048,
    pageCount: 3,
  });

  assert.notEqual(first.document.id, second.document.id);
  assert.equal(first.document.sources[0]?.name, "merged.pdf");
  assert.equal(first.document.pages.length, 3);
  assert.equal(first.session.history.operations.length, 0);
  assert.equal(first.session.history.cursor, 0);
});

test("fresh results may expose every canonical Workspace destination", () => {
  assert.deepEqual(
    continuationTargetsFor("pages", [], true).map((target) => target.area),
    ["edit", "pages", "sign", "enhance", "optimize", "export"],
  );
});

test("PDF-producing standalone tools continue only PDF results", () => {
  const merge = read("components/pdf/MergePdfTool.tsx");
  const split = read("components/pdf/SplitPdfTool.tsx");
  const crop = read("components/pdf/CropPdfTool.tsx");
  const jpg = read("components/pdf/JpgToPdfTool.tsx");
  const word = read("components/pdf/WordToPdfTool.tsx");
  const html = read("components/pdf/HtmlToPdfTool.tsx");

  for (const source of [merge, split, crop, jpg, word, html]) {
    assert.match(source, /ContinueWithPdf/);
    assert.match(source, /createFreshPdfContinuation/);
    assert.match(source, /includeSourceArea/);
    assert.match(source, /fresh Workspace history/);
  }

  assert.match(split, /if \(resultType === "pdf"\)/);
  assert.match(split, /continuationBytes = pdfBuffer\.slice\(0\)/);
  assert.doesNotMatch(split, /resultType === "zip"[\s\S]{0,240}createFreshPdfContinuation/);
});

test("non-PDF standalone outputs are not forced into the PDF Workspace", () => {
  for (const path of [
    "components/pdf/PdfToJpgTool.tsx",
    "components/pdf/PdfToWordTool.tsx",
    "components/pdf/ExtractTextTool.tsx",
  ]) {
    const source = read(path);
    assert.doesNotMatch(source, /createFreshPdfContinuation/);
    assert.doesNotMatch(source, /ContinueWithPdf/);
  }
});


test("Word to PDF reuses its validated page count for continuation", () => {
  const engine = read(
    "lib/conversion/browser/BrowserWordToPdfEngine.ts",
  );
  const word = read("components/pdf/WordToPdfTool.tsx");

  assert.match(engine, /pageCount = await validateGeneratedPdf\(blob\)/);
  assert.match(engine, /pageCount,/);
  assert.match(word, /conversionResult\.metadata\.pageCount/);
  assert.doesNotMatch(word, /PDFDocument\.load\(bytes/);
});
