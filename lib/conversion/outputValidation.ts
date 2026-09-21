import JSZip from "jszip";
import { XMLValidator } from "fast-xml-parser";
import { PDFDocument } from "pdf-lib";

const PDF_SIGNATURE = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
const MIN_PDF_BYTES = 64;
const MIN_DOCX_BYTES = 512;

function hasPrefix(bytes: Uint8Array, prefix: Uint8Array): boolean {
  return (
    bytes.length >= prefix.length &&
    prefix.every((value, index) => bytes[index] === value)
  );
}

function countMatches(value: string, pattern: RegExp): number {
  return Array.from(value.matchAll(pattern)).length;
}

export type DocxOutputExpectations = {
  expectedPageCount: number;
  minimumEditableTextRuns?: number;
  expectedBackgroundImages?: number;
};

export async function validateGeneratedDocx(
  blob: Blob,
  expectations: DocxOutputExpectations,
): Promise<void> {
  if (blob.size < MIN_DOCX_BYTES) {
    throw new Error("Generated DOCX is unexpectedly small.");
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(await blob.arrayBuffer());
  } catch (error) {
    throw new Error(
      `Generated DOCX is not a valid ZIP package: ${
        error instanceof Error ? error.message : "unknown ZIP error"
      }`,
    );
  }

  const required = [
    "[Content_Types].xml",
    "_rels/.rels",
    "word/document.xml",
    "word/_rels/document.xml.rels",
  ] as const;
  for (const path of required) {
    if (!zip.file(path)) {
      throw new Error(`Generated DOCX is missing required part ${path}.`);
    }
  }

  const [contentTypes, documentXml, relationships] = await Promise.all([
    zip.file("[Content_Types].xml")!.async("string"),
    zip.file("word/document.xml")!.async("string"),
    zip.file("word/_rels/document.xml.rels")!.async("string"),
  ]);

  for (const [name, xml] of [
    ["[Content_Types].xml", contentTypes],
    ["word/document.xml", documentXml],
    ["word/_rels/document.xml.rels", relationships],
  ] as const) {
    const result = XMLValidator.validate(xml);
    if (result !== true) {
      throw new Error(`Generated DOCX contains invalid XML in ${name}.`);
    }
  }

  if (
    !/application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document\.main\+xml/.test(
      contentTypes,
    )
  ) {
    throw new Error("Generated DOCX does not declare a Word main document part.");
  }

  const sectionCount = countMatches(documentXml, /<w:sectPr(?:\s|>)/g);
  if (sectionCount !== expectations.expectedPageCount) {
    throw new Error(
      `Generated DOCX page structure mismatch: expected ${expectations.expectedPageCount}, found ${sectionCount} section(s).`,
    );
  }

  const minimumEditableTextRuns = expectations.minimumEditableTextRuns ?? 0;
  if (
    minimumEditableTextRuns > 0 &&
    countMatches(documentXml, /<w:t(?:\s|>)/g) < minimumEditableTextRuns
  ) {
    throw new Error(
      "Generated DOCX lost a material amount of expected editable text.",
    );
  }

  const expectedBackgroundImages = expectations.expectedBackgroundImages ?? 0;
  if (expectedBackgroundImages > 0) {
    const imageCount = Object.keys(zip.files).filter((name) =>
      /^word\/media\/page-\d+\.(?:jpe?g|png)$/i.test(name),
    ).length;
    if (imageCount < expectedBackgroundImages) {
      throw new Error(
        `Generated DOCX lost page fidelity imagery: expected at least ${expectedBackgroundImages}, found ${imageCount}.`,
      );
    }
  }
}

export async function validateGeneratedPdf(blob: Blob): Promise<number> {
  if (blob.size < MIN_PDF_BYTES) {
    throw new Error("Generated PDF is unexpectedly small.");
  }

  const header = new Uint8Array(await blob.slice(0, PDF_SIGNATURE.length).arrayBuffer());
  if (!hasPrefix(header, PDF_SIGNATURE)) {
    throw new Error("Generated PDF is missing the PDF signature.");
  }

  let document: PDFDocument;
  try {
    // This validation runs after LibreOffice has already produced the output.
    // Use the worker-free OOXML/PDF utility already shipped in the browser
    // bundle instead of starting PDF.js solely to count pages. That keeps the
    // validation local while avoiding a redundant pdf.worker network request.
    document = await PDFDocument.load(await blob.arrayBuffer());
  } catch (error) {
    throw new Error(
      `Generated PDF could not be parsed: ${
        error instanceof Error ? error.message : "unknown PDF parse error"
      }`,
    );
  }

  const pageCount = document.getPageCount();
  if (!Number.isInteger(pageCount) || pageCount < 1) {
    throw new Error("Generated PDF contains no readable pages.");
  }
  return pageCount;
}
