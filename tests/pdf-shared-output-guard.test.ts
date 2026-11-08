import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import { validatePdfOutput } from "../lib/pdf/optimization/validateOutput.ts";

test("shared output guard verifies exact serialized byte length and page count", async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage([200, 300]);
  const bytes = await pdf.save();
  const result = await validatePdfOutput(bytes, 1);
  assert.equal(result.byteLength, bytes.byteLength);
  assert.equal(result.pageCount, 1);
});

test("shared output guard fails closed on empty, corrupt and page-mismatched PDFs", async () => {
  await assert.rejects(validatePdfOutput(new Uint8Array(), 1), /empty/);
  await assert.rejects(validatePdfOutput(new Uint8Array([37, 80, 68, 70, 33, 0, 0, 0]), 1));
  const pdf = await PDFDocument.create();
  pdf.addPage();
  await assert.rejects(validatePdfOutput(await pdf.save(), 2), /Page count/);
  await assert.rejects(validatePdfOutput(await pdf.save(), 0), /Expected page count/);
});
