import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import JSZip from "jszip";

import {
  validatePdfConversionFile,
  validateWordConversionFile,
} from "../lib/conversion/fileValidation.ts";


async function makeMinimalDocx(options: {
  includeDocument?: boolean;
  includeMacro?: boolean;
} = {}): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
  );
  zip.folder("_rels")?.file(
    ".rels",
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>',
  );
  if (options.includeDocument !== false) {
    zip.folder("word")?.file(
      "document.xml",
      '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body/></w:document>',
    );
  }
  if (options.includeMacro) {
    zip.folder("word")?.file("vbaProject.bin", new Uint8Array([1, 2, 3]));
  }
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

test("Word conversion validates real DOCX package structure and legacy DOC signatures", async () => {
  const docx = new File(
    [await makeMinimalDocx()],
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

test("DOCX validation rejects missing main document parts", async () => {
  const file = new File(
    [await makeMinimalDocx({ includeDocument: false })],
    "missing-document.docx",
    {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    },
  );

  const result = await validateWordConversionFile(file);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, "malformed-input");
    assert.match(result.message, /word\/document\.xml/i);
  }
});

test("DOCX validation rejects macro-enabled packages", async () => {
  const file = new File(
    [await makeMinimalDocx({ includeMacro: true })],
    "macro.docx",
    {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    },
  );

  const result = await validateWordConversionFile(file);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, "malformed-input");
    assert.match(result.message, /macro-enabled/i);
  }
});

test("DOCX validation distinguishes an OLE encrypted package from a damaged ZIP", async () => {
  const file = new File(
    [
      new Uint8Array([
        0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 1, 2,
      ]),
    ],
    "protected.docx",
    {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    },
  );

  const result = await validateWordConversionFile(file);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "encrypted-input");
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

test("DOCX validation reads bounded slices instead of buffering the whole document", async () => {
  const source = await readFile("lib/conversion/fileValidation.ts", "utf8");
  assert.match(source, /file\.slice\(0, bytes\)\.arrayBuffer\(\)/);
  assert.match(source, /MAX_ZIP_EOCD_SEARCH_BYTES/);
  assert.match(source, /file\.slice\(directoryOffset, directoryOffset \+ directorySize\)/);
  assert.doesNotMatch(source, /file\.arrayBuffer\(\)/);
});
