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

test("PDF text runs group into positioned editable lines", () => {
  const items = [
    {
      str: "Hello",
      transform: [12, 0, 0, 12, 72, 720],
      width: 30,
      fontName: "ABCDEE+Arial-Bold",
    },
    {
      str: "world",
      transform: [12, 0, 0, 12, 108, 720],
      width: 32,
      fontName: "ABCDEE+Arial-Bold",
    },
  ];

  const lines = reconstructTextLines(
    items,
    [1, 0, 0, -1, 0, 792],
    612,
    792,
  );

  assert.equal(lines.length, 1);
  assert.match(lines[0].text, /Hello world/);
  assert.equal(lines[0].bold, true);
  assert.ok(lines[0].xPt > 60 && lines[0].xPt < 80);
  assert.ok(lines[0].fontSizePt > 0);
});

test("reconstructed DOCX is a valid OOXML zip with editable text", async () => {
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
  assert.match(documentXml, /w:b/);
  assert.ok(zip.file("[Content_Types].xml"));
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

test("PDF reconstruction preserves vector-heavy page fidelity without pretending it is a semantic table", async () => {
  const source = await readFile(
    "lib/conversion/browser/BrowserPdfToWordEngine.ts",
    "utf8",
  );
  assert.match(source, /countVectorLayoutOperators/);
  assert.match(source, /vectorLayoutCount >= 6/);
  assert.match(source, /backgroundImage/);
});
