import assert from "node:assert/strict";
import test from "node:test";

import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  PDFDocument,
  StandardFonts,
  rgb,
} from "pdf-lib";

import { PdfFontRegistry } from "../lib/pdf/edit/fontRegistry.ts";
import {
  reconstructOperatorTextRuns,
} from "../lib/conversion/browser/pdfToWord/operatorRuns.ts";
import {
  classifyPageReconstruction,
} from "../lib/conversion/browser/pdfToWord/classifier.ts";

test("operator reconstruction keeps independently positioned source operators split", async () => {
  const source = await PDFDocument.create();
  const regular = await source.embedFont(StandardFonts.Helvetica);
  const page = source.addPage([612, 792]);

  // Deliberately independent show operators sharing one baseline. PDF.js is
  // free to coalesce these into a single TextItem; source-operator
  // reconstruction must never do so across the large invoice-column gaps.
  page.drawText("71.32", { x: 300, y: 620, size: 11, font: regular });
  page.drawText("34030000", { x: 365, y: 620, size: 11, font: regular });
  page.drawText("18.00", { x: 445, y: 620, size: 11, font: regular });
  page.drawText("BLUE-LINK", {
    x: 72,
    y: 690,
    size: 10,
    font: regular,
    color: rgb(0, 0, 0.93),
  });

  const bytes = await source.save();
  const structural = await PDFDocument.load(bytes.slice());
  const registry = new PdfFontRegistry(structural);
  const pdfjs = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
  const pdfjsPage = await pdfjs.getPage(1);
  const viewport = pdfjsPage.getViewport({ scale: 1 });

  const result = reconstructOperatorTextRuns({
    document: structural,
    registry,
    pageIndex: 0,
    viewportTransform: viewport.transform,
  });

  const cells = result.lines.filter((line) =>
    ["71.32", "34030000", "18.00"].includes(line.text),
  );
  assert.equal(cells.length, 3);
  assert.deepEqual(
    cells.map((line) => Math.round(line.xPt)),
    [300, 365, 445],
  );
  assert.ok(
    cells.every((line) => line.sourceKind === "operator"),
  );

  const blue = result.lines.find((line) => line.text === "BLUE-LINK");
  assert.ok(blue);
  assert.match(blue.colorHex ?? "", /^#0000E[CD-F]$/);
  assert.equal(blue.sourceOrderIndex, 3);
  assert.equal(blue.readingOrderIndex, 0);

  await (pdfjs as { destroy?: () => Promise<void> | void }).destroy?.();
});

test("operator reconstruction separates raw source order from logical editable order", async () => {
  const source = await PDFDocument.create();
  const regular = await source.embedFont(StandardFonts.Helvetica);
  const page = source.addPage([612, 792]);

  // Source/XML order is intentionally different from visual Y order.
  page.drawText("SECOND-VISUALLY", {
    x: 72,
    y: 640,
    size: 12,
    font: regular,
  });
  page.drawText("FIRST-VISUALLY", {
    x: 72,
    y: 700,
    size: 12,
    font: regular,
  });

  const bytes = await source.save();
  const structural = await PDFDocument.load(bytes.slice());
  const registry = new PdfFontRegistry(structural);
  const pdfjs = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
  const pdfjsPage = await pdfjs.getPage(1);
  const viewport = pdfjsPage.getViewport({ scale: 1 });

  const result = reconstructOperatorTextRuns({
    document: structural,
    registry,
    pageIndex: 0,
    viewportTransform: viewport.transform,
  });

  assert.deepEqual(
    result.lines.map((line) => line.text),
    ["FIRST-VISUALLY", "SECOND-VISUALLY"],
    "returned lines use geometric logical order rather than raw operator order",
  );
  const firstVisual = result.lines.find((line) => line.text === "FIRST-VISUALLY");
  const secondVisual = result.lines.find((line) => line.text === "SECOND-VISUALLY");
  assert.ok(firstVisual && secondVisual);
  assert.equal(firstVisual.sourceOrderIndex, 1);
  assert.equal(secondVisual.sourceOrderIndex, 0);
  assert.ok(
    (firstVisual.readingOrderIndex ?? 99) <
      (secondVisual.readingOrderIndex ?? -1),
    "logical/editable order follows visual reading geometry",
  );
  assert.ok(
    (firstVisual.visualOrderIndex ?? 99) <
      (secondVisual.visualOrderIndex ?? -1),
    "visual ordering remains independently available",
  );
  assert.ok((firstVisual.wordScalePct ?? 0) > 90);
  assert.ok((firstVisual.wordScalePct ?? 0) < 110);

  await (pdfjs as { destroy?: () => Promise<void> | void }).destroy?.();
});

test("page classifier recognizes repeated invoice columns without forcing a Word table", () => {
  const lines = Array.from({ length: 4 }, (_, row) =>
    [36, 120, 260, 360, 460].map((x, column) => ({
      text: `R${row}C${column}`,
      xPt: x,
      yPt: 100 + row * 22,
      widthPt: 40,
      heightPt: 10,
      fontSizePt: 9,
      fontFamily: "Arial",
      bold: false,
      italic: false,
      baselinePt: 108 + row * 22,
    })),
  ).flat();

  const result = classifyPageReconstruction({
    lines,
    imageCount: 0,
    vectorLayoutCount: 6,
    pageWidthPt: 595,
  });

  assert.equal(result.mode, "fixed-layout");
  const table = result.regions.find((region) => region.kind === "fixed-layout-table");
  assert.ok(table);
  assert.ok((table.columnAnchorsPt?.length ?? 0) >= 5);
});
