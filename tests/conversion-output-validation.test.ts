import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PDFDocument } from "pdf-lib";

import { validateGeneratedPdf } from "../lib/conversion/outputValidation.ts";

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
