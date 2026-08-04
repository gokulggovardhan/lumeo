import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import { parseDocumentXml } from "../lib/docx/parseDocumentXml.ts";
import { parseDocx, DocxParseError } from "../lib/docx/parseDocx.ts";

function wordXml(bodyXml: string) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${bodyXml}</w:body>
</w:document>`;
}

test("parseDocumentXml reads plain paragraph text", () => {
  const xml = wordXml(`
    <w:p><w:r><w:t>Hello world</w:t></w:r></w:p>
  `);
  const doc = parseDocumentXml(xml);
  assert.equal(doc.paragraphs.length, 1);
  assert.equal(doc.paragraphs[0].runs.length, 1);
  assert.equal(doc.paragraphs[0].runs[0].text, "Hello world");
  assert.equal(doc.paragraphs[0].runs[0].bold, false);
});

test("parseDocumentXml reads bold, italic, and underline run properties", () => {
  const xml = wordXml(`
    <w:p>
      <w:r>
        <w:rPr><w:b/><w:i/><w:u w:val="single"/></w:rPr>
        <w:t>Styled</w:t>
      </w:r>
    </w:p>
  `);
  const [paragraph] = parseDocumentXml(xml).paragraphs;
  assert.equal(paragraph.runs[0].bold, true);
  assert.equal(paragraph.runs[0].italic, true);
  assert.equal(paragraph.runs[0].underline, true);
});

test("parseDocumentXml treats w:val=\"false\" as the property being off", () => {
  const xml = wordXml(`
    <w:p><w:r><w:rPr><w:b w:val="false"/></w:rPr><w:t>Not bold</w:t></w:r></w:p>
  `);
  const [paragraph] = parseDocumentXml(xml).paragraphs;
  assert.equal(paragraph.runs[0].bold, false);
});

test("parseDocumentXml joins multiple w:t nodes within one run and decodes entities", () => {
  const xml = wordXml(`
    <w:p><w:r><w:t>Tom &amp; Jerry</w:t></w:r></w:p>
  `);
  const [paragraph] = parseDocumentXml(xml).paragraphs;
  assert.equal(paragraph.runs[0].text, "Tom & Jerry");
});

test("parseDocumentXml represents w:tab and w:br as literal characters", () => {
  const xml = wordXml(`
    <w:p><w:r><w:t>a</w:t><w:tab/><w:t>b</w:t><w:br/></w:r></w:p>
  `);
  const [paragraph] = parseDocumentXml(xml).paragraphs;
  assert.equal(paragraph.runs[0].text, "ab\t\n");
});

test("parseDocumentXml drops runs with no visible text", () => {
  const xml = wordXml(`
    <w:p><w:r><w:rPr><w:b/></w:rPr></w:r></w:p>
  `);
  const [paragraph] = parseDocumentXml(xml).paragraphs;
  assert.equal(paragraph.runs.length, 0);
});

test("parseDocumentXml handles multiple paragraphs", () => {
  const xml = wordXml(`
    <w:p><w:r><w:t>First</w:t></w:r></w:p>
    <w:p><w:r><w:t>Second</w:t></w:r></w:p>
  `);
  const doc = parseDocumentXml(xml);
  assert.equal(doc.paragraphs.length, 2);
  assert.equal(doc.paragraphs[0].runs[0].text, "First");
  assert.equal(doc.paragraphs[1].runs[0].text, "Second");
});

test("parseDocx unzips a real docx-shaped archive and parses its document.xml", async () => {
  const zip = new JSZip();
  zip.file("word/document.xml", wordXml(`<w:p><w:r><w:t>From a real zip</w:t></w:r></w:p>`));
  const bytes = await zip.generateAsync({ type: "uint8array" });

  const doc = await parseDocx(bytes);
  assert.equal(doc.paragraphs.length, 1);
  assert.equal(doc.paragraphs[0].runs[0].text, "From a real zip");
});

test("parseDocx rejects a zip missing word/document.xml", async () => {
  const zip = new JSZip();
  zip.file("readme.txt", "not a word document");
  const bytes = await zip.generateAsync({ type: "uint8array" });

  await assert.rejects(() => parseDocx(bytes), DocxParseError);
});

test("parseDocx rejects bytes that aren't a zip at all", async () => {
  const bytes = new TextEncoder().encode("plain text, not a zip");
  await assert.rejects(() => parseDocx(bytes), DocxParseError);
});
