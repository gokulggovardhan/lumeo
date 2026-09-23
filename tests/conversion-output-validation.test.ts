import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";

import { buildReconstructedDocx } from "../lib/conversion/browser/pdfToWord/docx.ts";
import {
  validateGeneratedDocx,
  validateGeneratedPdf,
} from "../lib/conversion/outputValidation.ts";

test("generated PDF validation parses and counts pages without PDF.js", async () => {
  const document = await PDFDocument.create();
  document.addPage([612, 792]);
  document.addPage([792, 612]);
  const bytes = await document.save();
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);

  const pageCount = await validateGeneratedPdf(
    new Blob([buffer], { type: "application/pdf" }),
  );

  assert.equal(pageCount, 2);
});

test("generated PDF validation rejects a non-PDF blob", async () => {
  await assert.rejects(
    validateGeneratedPdf(
      new Blob([new TextEncoder().encode("not a pdf")], {
        type: "application/pdf",
      }),
    ),
    /unexpectedly small|PDF signature/i,
  );
});

test("generated PDF validation stays worker-free", async () => {
  const source = await readFile("lib/conversion/outputValidation.ts", "utf8");
  assert.doesNotMatch(source, /loadPdfJsModule/);
  assert.doesNotMatch(source, /pdf\.worker/);
  assert.doesNotMatch(source, /createObjectURL/);
  assert.match(source, /PDFDocument\.load/);
});


async function validHyperlinkDocx(): Promise<Blob> {
  return buildReconstructedDocx([
    {
      pageNumber: 1,
      widthPt: 612,
      heightPt: 792,
      reconstructionMode: "semantic-text",
      lines: [
        {
          text: "Editable linked paragraph",
          xPt: 72,
          yPt: 72,
          widthPt: 180,
          heightPt: 13,
          fontSizePt: 11,
          fontFamily: "Arial",
          bold: false,
          italic: false,
          baselinePt: 81.5,
          regionKind: "semantic-text",
          hyperlinkUrl: "https://example.com/validation",
        },
      ],
      backgroundImage: null,
    },
  ]);
}

test("generated DOCX validation accepts intact editable hyperlinks", async () => {
  const blob = await validHyperlinkDocx();
  await validateGeneratedDocx(blob, {
    expectedPageCount: 1,
    minimumEditableTextRuns: 1,
    expectedHyperlinks: 1,
  });
});

test("generated DOCX validation rejects missing relationship targets", async () => {
  const blob = await validHyperlinkDocx();
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const relPath = "word/_rels/document.xml.rels";
  const rels = await zip.file(relPath)!.async("string");
  zip.file(
    relPath,
    rels.replace(
      /<Relationship Id="rIdHyperlink1"[^>]*\/>/,
      "",
    ),
  );
  const broken = await zip.generateAsync({
    type: "blob",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });

  await assert.rejects(
    () =>
      validateGeneratedDocx(broken, {
        expectedPageCount: 1,
        minimumEditableTextRuns: 1,
        expectedHyperlinks: 1,
      }),
    /missing relationship rIdHyperlink1/i,
  );
});

test("generated DOCX validation rejects hidden duplicate text", async () => {
  const blob = await validHyperlinkDocx();
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const path = "word/document.xml";
  const documentXml = await zip.file(path)!.async("string");
  zip.file(
    path,
    documentXml.replace("<w:rPr>", "<w:rPr><w:vanish/>"),
  );
  const hidden = await zip.generateAsync({
    type: "blob",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });

  await assert.rejects(
    () =>
      validateGeneratedDocx(hidden, {
        expectedPageCount: 1,
        minimumEditableTextRuns: 1,
        expectedHyperlinks: 1,
      }),
    /hidden editable text/i,
  );
});
