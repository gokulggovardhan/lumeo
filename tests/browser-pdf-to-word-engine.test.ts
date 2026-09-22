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
import {
  classifyPageReconstruction,
} from "../lib/conversion/browser/pdfToWord/classifier.ts";

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


test("DOCX fixed-layout output preserves color, underline, metric scale, hyperlink and source reading order", async () => {
  const blob = await buildReconstructedDocx([
    {
      pageNumber: 1,
      widthPt: 612,
      heightPt: 792,
      lines: [
        {
          text: "SECOND-SOURCE",
          xPt: 72,
          yPt: 160,
          widthPt: 82,
          heightPt: 12,
          fontSizePt: 10.7,
          fontFamily: "Arial",
          bold: false,
          italic: false,
          readingOrderIndex: 0,
          visualOrderIndex: 1,
          colorHex: "#0000EE",
          underline: true,
          underlineColorHex: "#0000EE",
          wordScalePct: 103.4,
          charSpacingPt: 0.5,
          textRisePt: 1.5,
          hyperlinkUrl: "https://example.com/fidelity",
        },
        {
          text: "FIRST-VISUAL",
          xPt: 72,
          yPt: 100,
          widthPt: 75,
          heightPt: 12,
          fontSizePt: 10.7,
          fontFamily: "Arial",
          bold: false,
          italic: false,
          readingOrderIndex: 1,
          visualOrderIndex: 0,
        },
        {
          text: "ROTATED-BACKGROUND-ONLY",
          xPt: 500,
          yPt: 200,
          widthPt: 100,
          heightPt: 12,
          fontSizePt: 10,
          fontFamily: "Arial",
          bold: false,
          italic: false,
          visualOnly: true,
        },
      ],
      backgroundImage: null,
    },
  ]);

  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const documentXml = await zip.file("word/document.xml")?.async("string");
  const rels = await zip
    .file("word/_rels/document.xml.rels")
    ?.async("string");

  assert.ok(documentXml && rels);
  assert.match(documentXml, /<w:color w:val="0000EE"\/>/);
  assert.match(documentXml, /<w:u w:val="single" w:color="0000EE"\/>/);
  assert.match(documentXml, /<w:w w:val="103"\/>/);
  assert.match(documentXml, /<w:spacing w:val="10"\/>/);
  assert.match(documentXml, /<w:position w:val="3"\/>/);
  assert.match(documentXml, /w:lineRule="exact"/);
  assert.match(documentXml, /w:y="3185"/);
  assert.match(documentXml, /<w:hyperlink r:id="rIdHyperlink1"/);
  assert.match(rels, /relationships\/hyperlink/);
  assert.match(rels, /Target="https:\/\/example\.com\/fidelity"/);
  assert.ok(
    documentXml.indexOf("SECOND-SOURCE") <
      documentXml.indexOf("FIRST-VISUAL"),
    "XML/read order follows source order rather than visual Y order",
  );
  assert.doesNotMatch(documentXml, /ROTATED-BACKGROUND-ONLY/);
});


test("semantic text pages become normal editable Word paragraphs rather than isolated frames", async () => {
  const blob = await buildReconstructedDocx([
    {
      pageNumber: 1,
      widthPt: 612,
      heightPt: 792,
      reconstructionMode: "semantic-text",
      lines: [
        {
          text: "This is a deliberately long first line of an ordinary paragraph that fills most of the available measure.",
          xPt: 72,
          yPt: 72,
          widthPt: 410,
          heightPt: 13,
          fontSizePt: 11,
          fontFamily: "Times New Roman",
          bold: false,
          italic: false,
          baselinePt: 81.5,
          regionKind: "semantic-text",
        },
        {
          text: "The wrapped continuation remains in the same editable paragraph.",
          xPt: 72,
          yPt: 85.5,
          widthPt: 300,
          heightPt: 13,
          fontSizePt: 11,
          fontFamily: "Times New Roman",
          bold: false,
          italic: false,
          baselinePt: 95,
          regionKind: "semantic-text",
        },
      ],
      backgroundImage: null,
    },
  ]);

  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const documentXml = await zip.file("word/document.xml")?.async("string");
  assert.ok(documentXml);
  assert.match(documentXml, /ordinary paragraph/);
  assert.match(documentXml, /wrapped continuation/);
  assert.match(documentXml, /<w:br\/>/);
  assert.match(documentXml, /<w:ind w:left="1440"/);
  assert.doesNotMatch(documentXml, /w:framePr/);
  assert.doesNotMatch(documentXml, /w:fitText/);
});

test("high-confidence whitespace tables become fixed-layout editable Word tables", async () => {
  const lines = [
    ["Description", 72, 100, 130, false],
    ["Qty", 300, 100, 28, true],
    ["Amount", 390, 100, 55, true],
    ["Service A", 72, 122, 90, false],
    ["2", 300, 122, 10, true],
    ["125.00", 390, 122, 42, true],
    ["Service B", 72, 144, 90, false],
    ["1", 300, 144, 10, true],
    ["80.00", 390, 144, 35, true],
    ["Total", 72, 166, 40, false],
    ["3", 300, 166, 10, true],
    ["205.00", 390, 166, 42, true],
  ].map(([text, xPt, yPt, widthPt, bold], index) => ({
    text: String(text),
    xPt: Number(xPt),
    yPt: Number(yPt),
    widthPt: Number(widthPt),
    heightPt: 11,
    fontSizePt: 10,
    fontFamily: "Arial",
    bold: Boolean(bold),
    italic: false,
    baselinePt: Number(yPt) + 8.5,
    readingOrderIndex: index,
    visualOrderIndex: index,
  }));

  const classification = classifyPageReconstruction({
    lines,
    imageCount: 0,
    vectorLayoutCount: 0,
    pageWidthPt: 612,
  });
  const table = classification.regions.find(
    (region) => region.kind === "semantic-table",
  );
  assert.ok(table, "regular whitespace table should be structurally safe");
  assert.ok((table.tableConfidence ?? 0) >= 0.82);
  assert.deepEqual(table.columnAnchorsPt?.map(Math.round), [72, 300, 390]);

  for (const index of table.lineIndices) {
    lines[index].regionKind = "semantic-table";
  }

  const blob = await buildReconstructedDocx([
    {
      pageNumber: 1,
      widthPt: 612,
      heightPt: 792,
      reconstructionMode: "fixed-layout",
      lines,
      regions: classification.regions,
      backgroundImage: null,
    },
  ]);
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const documentXml = await zip.file("word/document.xml")?.async("string");
  assert.ok(documentXml);
  assert.match(documentXml, /<w:tbl>/);
  assert.match(documentXml, /<w:tblLayout w:type="fixed"\/>/);
  assert.match(documentXml, /<w:tblpPr [^>]*w:vertAnchor="page"/);
  assert.match(documentXml, /<w:jc w:val="right"\/>/);
  assert.doesNotMatch(documentXml, /w:framePr/);
});

test("two-column prose is not misclassified as an editable Word table", () => {
  const lines = [
    ["Left column paragraph one", 54, 90],
    ["Right column paragraph one", 320, 90],
    ["Left column paragraph two", 54, 108],
    ["Right column paragraph two", 320, 108],
    ["Left column paragraph three", 54, 126],
    ["Right column paragraph three", 320, 126],
  ].map(([text, xPt, yPt], index) => ({
    text: String(text),
    xPt: Number(xPt),
    yPt: Number(yPt),
    widthPt: 190,
    heightPt: 12,
    fontSizePt: 10,
    fontFamily: "Arial",
    bold: false,
    italic: false,
    baselinePt: Number(yPt) + 8.5,
    readingOrderIndex: index,
    visualOrderIndex: index,
  }));

  const classification = classifyPageReconstruction({
    lines,
    imageCount: 0,
    vectorLayoutCount: 0,
    pageWidthPt: 612,
  });
  assert.equal(
    classification.regions.some((region) => region.kind === "semantic-table"),
    false,
  );
});
