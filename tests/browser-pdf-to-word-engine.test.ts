import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import JSZip from "jszip";

import {
  reconstructTextLines,
} from "../lib/conversion/browser/pdfToWord/layout.ts";
import {
  buildReconstructedDocx,
} from "../lib/conversion/browser/pdfToWord/docx.ts";

test("PDF same-baseline cells remain independently positioned editable runs", () => {
  const items = [
    {
      str: "Hello",
      transform: [12, 0, 0, 12, 72, 720],
      width: 30,
      fontName: "g_d0_f1",
    },
    {
      str: "world",
      transform: [12, 0, 0, 12, 108, 720],
      width: 32,
      fontName: "g_d0_f1",
    },
  ];

  const lines = reconstructTextLines(
    items,
    [1, 0, 0, -1, 0, 792],
    612,
    792,
    { g_d0_f1: { fontFamily: "Arial" } },
  );

  assert.equal(lines.length, 2);
  assert.deepEqual(
    lines.map((line) => line.text),
    ["Hello", "world"],
  );
  assert.equal(lines[0].fontFamily, "Arial");
  assert.ok(lines[0].xPt > 60 && lines[0].xPt < 80);
  assert.ok(lines[1].xPt > lines[0].xPt);
  assert.ok(Math.abs(lines[0].yPt - lines[1].yPt) < 0.5);
});

test("invoice-like columns are never collapsed into one flowing paragraph", () => {
  const items = [
    {
      str: "ITEM-A101",
      transform: [11, 0, 0, 11, 52, 470],
      width: 50,
      fontName: "g_d0_f1",
    },
    {
      str: "Cleaning fluid",
      transform: [11, 0, 0, 11, 112, 470],
      width: 65,
      fontName: "g_d0_f1",
    },
    {
      str: "1.00",
      transform: [11, 0, 0, 11, 208, 470],
      width: 22,
      fontName: "g_d0_f1",
    },
    {
      str: "83.90",
      transform: [11, 0, 0, 11, 258, 470],
      width: 28,
      fontName: "g_d0_f1",
    },
    {
      str: "34030000",
      transform: [11, 0, 0, 11, 390, 470],
      width: 48,
      fontName: "g_d0_f1",
    },
  ];

  const lines = reconstructTextLines(
    items,
    [1, 0, 0, -1, 0, 792],
    612,
    792,
    { g_d0_f1: { fontFamily: "sans-serif" } },
  );

  assert.equal(lines.length, items.length);
  assert.deepEqual(
    lines.map((line) => line.text),
    items.map((item) => item.str),
  );
  assert.deepEqual(
    lines.map((line) => Math.round(line.xPt)),
    [52, 112, 208, 258, 390],
  );
  assert.ok(lines.every((line) => line.fontFamily === "Arial"));
});

test("PDF font metadata maps internal pdf.js identifiers to Word-safe families and styles", () => {
  const lines = reconstructTextLines(
    [
      {
        str: "Bold heading",
        transform: [12, 0, 0, 12, 72, 720],
        width: 80,
        fontName: "g_d0_f2",
      },
      {
        str: "Serif body",
        transform: [12, 0, 0, 12, 72, 700],
        width: 70,
        fontName: "g_d0_f3",
      },
    ],
    [1, 0, 0, -1, 0, 792],
    612,
    792,
    {
      g_d0_f2: { fontFamily: "sans-serif", fontName: "Arial-BoldMT", bold: true },
      g_d0_f3: { fontFamily: "serif", fontName: "TimesNewRomanPSMT" },
    },
  );

  assert.equal(lines[0].fontFamily, "Arial");
  assert.equal(lines[0].bold, true);
  assert.equal(lines[1].fontFamily, "Times New Roman");
});

test("reconstructed DOCX is a valid OOXML zip with editable positioned text", async () => {
  const blob = await buildReconstructedDocx([
    {
      pageNumber: 1,
      widthPt: 612,
      heightPt: 792,
      lines: [
        {
          text: "Editable Lumeo text",
          xPt: 72,
          yPt: 72,
          widthPt: 220,
          heightPt: 16,
          fontSizePt: 12,
          fontFamily: "Arial",
          bold: true,
          italic: false,
        },
      ],
      backgroundImage: null,
    },
  ]);

  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const documentXml = await zip.file("word/document.xml")?.async("string");

  assert.ok(documentXml);
  assert.match(documentXml, /Editable Lumeo text/);
  assert.match(documentXml, /w:framePr/);
  assert.match(documentXml, /w:fitText/);
  assert.match(documentXml, /w:b/);
  assert.ok(zip.file("[Content_Types].xml"));
});

test("masked fidelity backgrounds keep editable text transparent instead of white-boxed", async () => {
  const blob = await buildReconstructedDocx([
    {
      pageNumber: 1,
      widthPt: 612,
      heightPt: 792,
      lines: [
        {
          text: "Table cell",
          xPt: 72,
          yPt: 140,
          widthPt: 55,
          heightPt: 14,
          fontSizePt: 11,
          fontFamily: "Arial",
          bold: false,
          italic: false,
        },
      ],
      backgroundImage: new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], {
        type: "image/jpeg",
      }),
      backgroundExtension: "jpg",
      backgroundTextMasked: true,
    },
  ]);

  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const documentXml = await zip.file("word/document.xml")?.async("string");

  assert.match(documentXml ?? "", /Table cell/);
  assert.doesNotMatch(documentXml ?? "", /<w:shd /);
  assert.match(documentXml ?? "", /behindDoc="1"/);
});

test("DOCX builder embeds page background images when reconstruction needs raster fallback", async () => {
  const blob = await buildReconstructedDocx([
    {
      pageNumber: 1,
      widthPt: 612,
      heightPt: 792,
      lines: [],
      backgroundImage: new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], {
        type: "image/jpeg",
      }),
      backgroundExtension: "jpg",
    },
  ]);

  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  assert.ok(zip.file("word/media/page-1.jpg"));
  const rels = await zip.file("word/_rels/document.xml.rels")?.async("string");
  assert.match(rels ?? "", /relationships\/image/);

  const documentXml = await zip.file("word/document.xml")?.async("string");
  assert.match(documentXml ?? "", /wp:anchor/);
  assert.match(documentXml ?? "", /behindDoc="1"/);
  assert.doesNotMatch(documentXml ?? "", /wp:inline/);
});

test("PDF reconstruction preserves vector-heavy geometry while masking native text from the raster background", async () => {
  const source = await readFile(
    "lib/conversion/browser/BrowserPdfToWordEngine.ts",
    "utf8",
  );
  assert.match(source, /countVectorLayoutOperators/);
  assert.match(source, /vectorLayoutCount > 0/);
  assert.match(source, /maskEditableTextFromBackground/);
  assert.match(source, /imageCount === 0/);
  assert.match(source, /backgroundTextMasked/);
});
