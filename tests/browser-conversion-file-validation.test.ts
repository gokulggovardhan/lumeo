import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  validatePdfConversionFile,
  validateWordConversionFile,
} from "../lib/conversion/fileValidation.ts";

test("Word conversion validates DOCX and legacy DOC signatures from a tiny header slice", async () => {
  const docx = new File(
    [new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4])],
    "sample.docx",
    {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    },
  );
  const doc = new File(
    [
      new Uint8Array([
        0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 1, 2,
      ]),
    ],
    "legacy.doc",
    { type: "application/msword" },
  );

  assert.deepEqual(await validateWordConversionFile(docx), { ok: true });
  assert.deepEqual(await validateWordConversionFile(doc), { ok: true });

  const renamed = new File([new TextEncoder().encode("not a docx")], "fake.docx", {
    type: "application/octet-stream",
  });
  const result = await validateWordConversionFile(renamed);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "malformed-input");
});

test("PDF conversion checks the PDF signature and rejects MIME/extension mismatches", async () => {
  const pdf = new File(
    [new TextEncoder().encode("%PDF-1.7\n")],
    "sample.pdf",
    { type: "application/pdf" },
  );
  assert.deepEqual(await validatePdfConversionFile(pdf), { ok: true });

  const fake = new File(
    [new TextEncoder().encode("hello")],
    "fake.pdf",
    { type: "application/pdf" },
  );
  const malformed = await validatePdfConversionFile(fake);
  assert.equal(malformed.ok, false);
  if (!malformed.ok) assert.equal(malformed.code, "malformed-input");

  const wrongMime = new File(
    [new TextEncoder().encode("%PDF-1.7\n")],
    "sample.pdf",
    { type: "image/png" },
  );
  const unsupported = await validatePdfConversionFile(wrongMime);
  assert.equal(unsupported.ok, false);
  if (!unsupported.ok) assert.equal(unsupported.code, "unsupported-file");
});

test("signature validation never reads the whole document", async () => {
  const source = await readFile("lib/conversion/fileValidation.ts", "utf8");
  assert.match(source, /file\.slice\(0, bytes\)\.arrayBuffer\(\)/);
  assert.doesNotMatch(source, /file\.arrayBuffer\(\)/);
});
