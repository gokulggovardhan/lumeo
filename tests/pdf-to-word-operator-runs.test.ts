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
import {
  assessOperatorRunCoverage,
} from "../lib/conversion/browser/pdfToWord/coverage.ts";
import {
  reconstructTextLines,
} from "../lib/conversion/browser/pdfToWord/layout.ts";
import {
  makeFixedLayoutInvoicePdf,
} from "../e2e/fixed-layout-pdf-fixture.ts";

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
  const pdfjs = await pdfjsLib.getDocument({
    data: new Uint8Array(bytes),
  }).promise;
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


test("operator coverage accepts merged visible cells only when every visible character is accounted for", () => {
  const visible = [
    {
      text: "20997 09-Dec-2030 3 2",
      xPt: 36,
      yPt: 200,
      widthPt: 190,
      heightPt: 11,
      fontSizePt: 9,
      fontFamily: "Arial",
      bold: false,
      italic: false,
      sourceKind: "pdfjs" as const,
    },
  ];

  const source = [
    {
      text: "09-Dec-2030",
      xPt: 95,
      yPt: 200,
      widthPt: 55,
      heightPt: 11,
      fontSizePt: 9,
      fontFamily: "Arial",
      bold: false,
      italic: false,
      sourceKind: "operator" as const,
    },
    {
      text: "20997",
      xPt: 36,
      yPt: 200,
      widthPt: 35,
      heightPt: 11,
      fontSizePt: 9,
      fontFamily: "Arial",
      bold: false,
      italic: false,
      sourceKind: "operator" as const,
    },
    {
      text: "3",
      xPt: 170,
      yPt: 200,
      widthPt: 7,
      heightPt: 11,
      fontSizePt: 9,
      fontFamily: "Arial",
      bold: false,
      italic: false,
      sourceKind: "operator" as const,
    },
    {
      text: "2",
      xPt: 205,
      yPt: 200,
      widthPt: 7,
      heightPt: 11,
      fontSizePt: 9,
      fontFamily: "Arial",
      bold: false,
      italic: false,
      sourceKind: "operator" as const,
    },
  ];

  const complete = assessOperatorRunCoverage(visible, source);
  assert.equal(complete.safeToUseOperatorRuns, true);
  assert.equal(complete.visibleRunCoverageRatio, 1);
  assert.equal(complete.characterCoverageRatio, 1);

  const missing = assessOperatorRunCoverage(visible, source.slice(0, -1));
  assert.equal(missing.safeToUseOperatorRuns, false);
  assert.equal(missing.visibleRunCoverageRatio, 0);
  assert.equal(missing.characterCoverageRatio, 0);
});

test("operator coverage is geometry-aware and rejects matching text from the wrong row", () => {
  const visible = [
    {
      text: "TOTAL 1536.00",
      xPt: 300,
      yPt: 100,
      widthPt: 150,
      heightPt: 12,
      fontSizePt: 10,
      fontFamily: "Arial",
      bold: true,
      italic: false,
      sourceKind: "pdfjs" as const,
    },
  ];
  const wrongRow = [
    {
      text: "TOTAL",
      xPt: 300,
      yPt: 400,
      widthPt: 40,
      heightPt: 12,
      fontSizePt: 10,
      fontFamily: "Arial",
      bold: true,
      italic: false,
      sourceKind: "operator" as const,
    },
    {
      text: "1536.00",
      xPt: 390,
      yPt: 400,
      widthPt: 55,
      heightPt: 12,
      fontSizePt: 10,
      fontFamily: "Arial",
      bold: true,
      italic: false,
      sourceKind: "operator" as const,
    },
  ];

  const coverage = assessOperatorRunCoverage(visible, wrongRow);
  assert.equal(coverage.safeToUseOperatorRuns, false);
});


test("privacy-safe invoice fixture reaches lossless source-operator coverage on every page", async () => {
  const bytes = await makeFixedLayoutInvoicePdf();
  const structural = await PDFDocument.load(bytes.slice());
  const registry = new PdfFontRegistry(structural);
  const pdfjs = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;

  try {
    for (let pageNumber = 1; pageNumber <= pdfjs.numPages; pageNumber += 1) {
      const page = await pdfjs.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1, rotation: page.rotate });
      const content = await page.getTextContent();
      const visible = reconstructTextLines(
        content.items as never,
        viewport.transform,
        viewport.width,
        viewport.height,
      );
      const source = reconstructOperatorTextRuns({
        document: structural,
        registry,
        pageIndex: pageNumber - 1,
        viewportTransform: viewport.transform,
      });
      const coverage = assessOperatorRunCoverage(visible, source.lines);

      assert.equal(
        coverage.safeToUseOperatorRuns,
        true,
        `page ${pageNumber} operator coverage ${coverage.characterCoverageRatio.toFixed(4)}; unexplained=${JSON.stringify(coverage.unexplainedVisibleText)}`,
      );
    }
  } finally {
    await (pdfjs as { destroy?: () => Promise<void> | void }).destroy?.();
  }
});
