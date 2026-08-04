// lib/docx/parseDocx.ts
//
// Unzips a .docx (a zip archive) and hands word/document.xml to
// parseDocumentXml.ts. JSZip already runs in both the browser and under
// Node's test runner, so no new dependency was needed for this slice --
// it's already used elsewhere in this project for JPG-to-PDF's export.

import JSZip from "jszip";
import { parseDocumentXml, type DocxDocument } from "./parseDocumentXml.ts";

export class DocxParseError extends Error {}

export async function parseDocx(bytes: ArrayBuffer | Uint8Array): Promise<DocxDocument> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new DocxParseError("This doesn't look like a valid .docx file.");
  }

  const documentXmlFile = zip.file("word/document.xml");
  if (!documentXmlFile) {
    throw new DocxParseError("Missing word/document.xml -- this may not be a Word document.");
  }

  const xml = await documentXmlFile.async("string");
  return parseDocumentXml(xml);
}
