import { expect, test } from "@playwright/test";
import type { Download } from "@playwright/test";
import JSZip from "jszip";
import {
  PDFDocument,
  StandardFonts,
  rgb,
} from "pdf-lib";
import { readFile } from "node:fs/promises";

import {
  assertPdfAnchorFidelity,
  assertPdfLineAnchorFidelity,
  assertRenderedPdfSimilarity,
  countPdfImages,
  renderDocxWithLibreOffice,
  writePdfFixture,
} from "./conversion-fidelity-helpers";
import {
  frameXForText,
  makeFixedLayoutInvoicePdf,
} from "./fixed-layout-pdf-fixture";
import { makeProfessionalDocx } from "./professional-docx-fixture";
import { makeAdvancedLayoutDocx } from "./advanced-word-docx-fixture";
import {
  makeSemanticLetterPdf,
  makeTwoColumnReportPdf,
  makeWhitespaceStatementPdf,
} from "./semantic-pdf-fixtures";

const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP8z8Dwn4GBgYGJAQoAHxcCAk+Uzr4AAAAASUVORK5CYII=",
  "base64",
);

async function makeDocx({
  rich = false,
  repeatedParagraphs = 0,
}: {
  rich?: boolean;
  repeatedParagraphs?: number;
} = {}): Promise<Buffer> {
  const zip = new JSZip();

  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
  );

  zip.folder("_rels")?.file(
    ".rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  );

  const repeated = Array.from(
    { length: repeatedParagraphs },
    (_, index) =>
      `<w:p><w:r><w:t>Cancellation paragraph ${index + 1} — Lumeo browser conversion.</w:t></w:r></w:p>`,
  ).join("");

  const richContent = rich
    ? `
<w:p>
  <w:r><w:rPr><w:b/><w:color w:val="C9903A"/><w:sz w:val="36"/></w:rPr><w:t>Lumeo formatted heading</w:t></w:r>
  <w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve"> with italic detail</w:t></w:r>
</w:p>
<w:tbl>
  <w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr>
  <w:tr>
    <w:tc><w:p><w:r><w:t>Table A1</w:t></w:r></w:p></w:tc>
    <w:tc><w:p><w:r><w:t>Table B1</w:t></w:r></w:p></w:tc>
  </w:tr>
  <w:tr>
    <w:tc><w:p><w:r><w:t>Table A2</w:t></w:r></w:p></w:tc>
    <w:tc><w:p><w:r><w:t>Table B2</w:t></w:r></w:p></w:tc>
  </w:tr>
</w:tbl>
<w:p>
  <w:r>
    <w:drawing>
      <wp:inline distT="0" distB="0" distL="0" distR="0">
        <wp:extent cx="952500" cy="952500"/>
        <wp:docPr id="1" name="Lumeo test image"/>
        <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
          <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
            <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
              <pic:nvPicPr>
                <pic:cNvPr id="0" name="pixel.png"/>
                <pic:cNvPicPr/>
              </pic:nvPicPr>
              <pic:blipFill>
                <a:blip r:embed="rIdImage1"/>
                <a:stretch><a:fillRect/></a:stretch>
              </pic:blipFill>
              <pic:spPr>
                <a:xfrm>
                  <a:off x="0" y="0"/>
                  <a:ext cx="952500" cy="952500"/>
                </a:xfrm>
                <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
              </pic:spPr>
            </pic:pic>
          </a:graphicData>
        </a:graphic>
      </wp:inline>
    </w:drawing>
  </w:r>
</w:p>
<w:p><w:r><w:br w:type="page"/></w:r></w:p>
<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>Lumeo second page centered text</w:t></w:r></w:p>`
    : "";

  zip.folder("word")?.file(
    "document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
  xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <w:body>
    <w:p><w:r><w:t>Lumeo browser-only Word conversion fixture</w:t></w:r></w:p>
    ${richContent}
    ${repeated}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
    </w:sectPr>
  </w:body>
</w:document>`,
  );

  zip.folder("word")?.folder("_rels")?.file(
    "document.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdImage1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/pixel.png"/>
</Relationships>`,
  );
  zip.folder("word")?.folder("media")?.file("pixel.png", ONE_PIXEL_PNG);

  return zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}

async function makePdf({
  rich = false,
  pages = 1,
}: {
  rich?: boolean;
  pages?: number;
} = {}): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pixel = rich ? await pdf.embedPng(ONE_PIXEL_PNG) : null;

  for (let index = 0; index < pages; index += 1) {
    const page = pdf.addPage([612, 792]);
    page.drawText(
      index === 0
        ? "Lumeo editable PDF reconstruction fixture"
        : `Lumeo page ${index + 1}`,
      {
        x: 72,
        y: 710,
        size: index === 0 ? 18 : 12,
        font: index === 0 ? bold : regular,
        color: index === 0 ? rgb(0.15, 0.2, 0.35) : rgb(0, 0, 0),
      },
    );

    page.drawText("Paragraph line one with stable positioning.", {
      x: 72,
      y: 675,
      size: 12,
      font: regular,
    });
    page.drawText("Paragraph line two keeps multi-page ordering.", {
      x: 72,
      y: 655,
      size: 12,
      font: regular,
    });

    if (rich && index === 0) {
      for (let row = 0; row < 3; row += 1) {
        for (let column = 0; column < 2; column += 1) {
          page.drawRectangle({
            x: 72 + column * 180,
            y: 480 - row * 55,
            width: 180,
            height: 55,
            borderWidth: 1,
            borderColor: rgb(0.2, 0.2, 0.2),
          });
          page.drawText(`Cell ${row + 1}-${column + 1}`, {
            x: 82 + column * 180,
            y: 508 - row * 55,
            size: 10,
            font: regular,
          });
        }
      }

      if (pixel) {
        page.drawImage(pixel, {
          x: 430,
          y: 590,
          width: 72,
          height: 72,
        });
      }
    }
  }

  return Buffer.from(await pdf.save());
}



async function downloadBytes(download: Download) {
  const path = await download.path();
  if (!path) throw new Error("Playwright download has no local path.");
  return readFile(path);
}

async function validatePdfDownload(bytes: Buffer) {
  const pdf = await PDFDocument.load(bytes);
  expect(pdf.getPageCount()).toBeGreaterThan(0);
}

async function validateDocxDownload(bytes: Buffer, expectedText: string) {
  const zip = await JSZip.loadAsync(bytes);
  const documentXml = await zip.file("word/document.xml")?.async("string");
  expect(documentXml).toContain(expectedText);
  expect(zip.file("[Content_Types].xml")).toBeTruthy();
  expect(zip.file("word/_rels/document.xml.rels")).toBeTruthy();
  return zip;
}

test.describe("browser conversion validation lab", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/internal/conversion-lab");
    await expect(page.getByRole("heading", { name: "Browser conversion validation lab" }))
      .toBeVisible();
  });

  test("PDF to Word reconstructs a small editable document", async ({
    page,
  }) => {
    const pdf = await makePdf();

    await page.getByTestId("pdf-input").setInputFiles({
      name: "small.pdf",
      mimeType: "application/pdf",
      buffer: pdf,
    });
    await page.getByTestId("pdf-convert").click();

    await expect(page.getByTestId("pdf-lab")).toHaveAttribute(
      "data-state",
      "success",
      { timeout: 120_000 },
    );

    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("pdf-download").click();
    const bytes = await downloadBytes(await downloadPromise);
    await validateDocxDownload(
      bytes,
      "Lumeo editable PDF reconstruction fixture",
    );
  });

  test("PDF to Word preserves multi-page vector/image fidelity and supports repeat conversion", async ({
    page,
  }) => {
    const richPdf = await makePdf({ rich: true, pages: 3 });

    await page.getByTestId("pdf-input").setInputFiles({
      name: "rich-multipage.pdf",
      mimeType: "application/pdf",
      buffer: richPdf,
    });
    await page.getByTestId("pdf-convert").click();

    await expect(page.getByTestId("pdf-lab")).toHaveAttribute(
      "data-state",
      "success",
      { timeout: 180_000 },
    );

    let downloadPromise = page.waitForEvent("download");
    await page.getByTestId("pdf-download").click();
    let bytes = await downloadBytes(await downloadPromise);
    const richDocx = await validateDocxDownload(
      bytes,
      "Lumeo editable PDF reconstruction fixture",
    );
    expect(richDocx.file("word/media/page-1.jpg")).toBeTruthy();

    const smallPdf = await makePdf({ pages: 2 });
    await page.getByTestId("pdf-input").setInputFiles({
      name: "repeat.pdf",
      mimeType: "application/pdf",
      buffer: smallPdf,
    });
    await page.getByTestId("pdf-convert").click();

    await expect(page.getByTestId("pdf-lab")).toHaveAttribute(
      "data-state",
      "success",
      { timeout: 120_000 },
    );

    downloadPromise = page.waitForEvent("download");
    await page.getByTestId("pdf-download").click();
    bytes = await downloadBytes(await downloadPromise);
    await validateDocxDownload(bytes, "Lumeo page 2");
  });


  test("PDF to Word preserves invoice and AMC column geometry as independent editable runs", async ({
    page,
    browserName,
  }, testInfo) => {
    const pdf = await makeFixedLayoutInvoicePdf();

    await page.getByTestId("pdf-input").setInputFiles({
      name: "synthetic-fixed-layout-invoice.pdf",
      mimeType: "application/pdf",
      buffer: pdf,
    });
    await page.getByTestId("pdf-convert").click();

    await expect(page.getByTestId("pdf-lab")).toHaveAttribute(
      "data-state",
      "success",
      { timeout: 180_000 },
    );

    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("pdf-download").click();
    const bytes = await downloadBytes(await downloadPromise);
    const docx = await validateDocxDownload(bytes, "ITEM-A101");
    const documentXml = await docx.file("word/document.xml")!.async("string");

    for (const expected of [
      "Cleaning fluid 50 ml",
      "ITEM-B202",
      "ITEM-C303",
      "SYNTHETIC LUBRICANT 1200 ML",
      "Parts Total",
      "Labour Total",
      "Grand Total",
      "Amc No.",
      "Valid Till",
      "Water wash",
      "Co check",
      "Pick up &amp; drop",
      "Authorised Signatory",
      "Long service description",
      "continues on a second line",
      "Unicode café résumé €",
      "Serif text validates mixed-family metrics.",
    ]) {
      expect(documentXml).toContain(expected);
    }

    expect(documentXml).not.toContain(
      "Service Water wash Co check chain Pick up &amp; drop",
    );
    expect(documentXml).not.toContain(
      "ITEM-A101 Cleaning fluid 50 ml 1.00 83.90",
    );

    expect(frameXForText(documentXml, "ITEM-A101")).toBeLessThan(
      frameXForText(documentXml, "Cleaning fluid 50 ml"),
    );
    expect(frameXForText(documentXml, "Cleaning fluid 50 ml")).toBeLessThan(
      frameXForText(documentXml, "1.00"),
    );
    expect(frameXForText(documentXml, "Amc No.")).toBeLessThan(
      frameXForText(documentXml, "Valid Till"),
    );
    expect(frameXForText(documentXml, "Valid Till")).toBeLessThan(
      frameXForText(documentXml, "Service"),
    );
    expect(frameXForText(documentXml, "Service")).toBeLessThan(
      frameXForText(documentXml, "Water wash"),
    );
    expect(frameXForText(documentXml, "Water wash")).toBeLessThan(
      frameXForText(documentXml, "Co check"),
    );

    expect(docx.file("word/media/page-1.jpg")).toBeTruthy();
    expect(docx.file("word/media/page-2.jpg")).toBeTruthy();
    expect(documentXml).not.toContain("<w:shd ");
    expect(documentXml).toContain('<w:color w:val="0000ED"');
    expect(documentXml).toContain('<w:u w:val="single"');
    expect(documentXml).toContain("<w:w w:val=");
    expect(documentXml).toContain('w:lineRule="exact"');
    expect(documentXml).not.toContain("ROTATED NOTE");

    const relationships = await docx
      .file("word/_rels/document.xml.rels")
      ?.async("string");
    expect(relationships).toContain(
      "https://example.com/fidelity",
    );
    expect(relationships).toContain(
      "relationships/hyperlink",
    );

    if (
      browserName === "chromium" &&
      process.env.LUMEO_FIDELITY_CLI === "1"
    ) {
      const outputDirectory = testInfo.outputPath("pdf-to-word-fidelity");
      const sourcePdf = await writePdfFixture(
        pdf,
        outputDirectory,
        "synthetic-invoice-source",
      );
      const reconstructedPdf = await renderDocxWithLibreOffice(
        bytes,
        outputDirectory,
        "synthetic-invoice-current",
      );

      await assertPdfAnchorFidelity(
        sourcePdf,
        reconstructedPdf,
        outputDirectory,
        [
          { page: 1, text: "ITEM-A101" },
          { page: 1, text: "ITEM-B202" },
          { page: 1, text: "ITEM-C303" },
          { page: 1, text: "1842.75" },
          { page: 2, text: "AMC9007" },
          { page: 2, text: "1843.00" },
          { page: 2, text: "Authorised" },
          { page: 2, text: "Signatory" },
        ],
        0.03,
      );
      await assertRenderedPdfSimilarity(sourcePdf, reconstructedPdf, {
        maxMae: 20,
        maxChanged: 0.22,
      });
    }
  });

  test("PDF to Word emits normal editable paragraphs for semantic letter content", async ({
    page,
    browserName,
  }, testInfo) => {
    const pdf = await makeSemanticLetterPdf();
    await page.getByTestId("pdf-input").setInputFiles({
      name: "semantic-professional-letter.pdf",
      mimeType: "application/pdf",
      buffer: pdf,
    });
    await page.getByTestId("pdf-convert").click();
    await expect(page.getByTestId("pdf-lab")).toHaveAttribute(
      "data-state",
      "success",
      { timeout: 180_000 },
    );

    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("pdf-download").click();
    const bytes = await downloadBytes(await downloadPromise);
    const docx = await validateDocxDownload(
      bytes,
      "This document exercises normal paragraph reconstruction",
    );
    const documentXml = await docx.file("word/document.xml")!.async("string");
    const relationships = await docx
      .file("word/_rels/document.xml.rels")
      ?.async("string");

    const marker =
      "This document exercises normal paragraph reconstruction";
    const textIndex = documentXml.indexOf(marker);
    expect(textIndex).toBeGreaterThan(0);
    const paragraphStart = documentXml.lastIndexOf("<w:p>", textIndex);
    const paragraphEnd = documentXml.indexOf("</w:p>", textIndex);
    const bodyParagraph = documentXml.slice(paragraphStart, paragraphEnd + 6);

    expect(bodyParagraph).toContain("<w:br/>");
    expect(bodyParagraph).not.toContain("w:framePr");
    expect(bodyParagraph).not.toContain("w:fitText");
    expect(bodyParagraph).toContain(
      "The second visual line continues the same paragraph with stable spacing, baseline placement and selectable text.",
    );
    expect(relationships).toContain(
      "https://example.com/semantic-letter",
    );
    expect(relationships).toContain("relationships/hyperlink");

    if (
      browserName === "chromium" &&
      process.env.LUMEO_FIDELITY_CLI === "1"
    ) {
      const outputDirectory = testInfo.outputPath("semantic-letter-fidelity");
      const sourcePdf = await writePdfFixture(
        pdf,
        outputDirectory,
        "semantic-letter-source",
      );
      const reconstructedPdf = await renderDocxWithLibreOffice(
        bytes,
        outputDirectory,
        "semantic-letter-current",
      );
      await assertPdfLineAnchorFidelity(
        sourcePdf,
        reconstructedPdf,
        outputDirectory,
        [
          { page: 1, contains: "Lumeo Professional Letter" },
          { page: 1, contains: "This document exercises" },
          { page: 1, contains: "The second visual line" },
          { page: 1, contains: "A separate paragraph follows" },
          { page: 1, contains: "Kind regards" },
        ],
        0.03,
      );
      await assertRenderedPdfSimilarity(sourcePdf, reconstructedPdf, {
        maxMae: 20,
        maxChanged: 0.22,
      });
    }
  });

  test("PDF to Word emits a real Word table only for high-confidence whitespace statements", async ({
    page,
    browserName,
  }, testInfo) => {
    const pdf = await makeWhitespaceStatementPdf();
    await page.getByTestId("pdf-input").setInputFiles({
      name: "synthetic-whitespace-statement.pdf",
      mimeType: "application/pdf",
      buffer: pdf,
    });
    await page.getByTestId("pdf-convert").click();
    await expect(page.getByTestId("pdf-lab")).toHaveAttribute(
      "data-state",
      "success",
      { timeout: 180_000 },
    );

    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("pdf-download").click();
    const bytes = await downloadBytes(await downloadPromise);
    const docx = await validateDocxDownload(bytes, "Monthly service");
    const documentXml = await docx.file("word/document.xml")!.async("string");

    expect(documentXml).toContain("<w:tbl>");
    expect(documentXml).toContain('<w:tblLayout w:type="fixed"/>');
    expect(documentXml).toContain('w:vertAnchor="page"');
    expect(documentXml).toContain("Priority support");
    expect(documentXml).toContain("205.00");
    expect(documentXml).toContain('<w:jc w:val="right"/>');

    const tableStart = documentXml.indexOf("<w:tbl>");
    const tableEnd = documentXml.indexOf("</w:tbl>", tableStart);
    const tableXml = documentXml.slice(tableStart, tableEnd + 8);
    expect(tableXml).not.toContain("w:framePr");

    if (
      browserName === "chromium" &&
      process.env.LUMEO_FIDELITY_CLI === "1"
    ) {
      const outputDirectory = testInfo.outputPath("semantic-table-fidelity");
      const sourcePdf = await writePdfFixture(
        pdf,
        outputDirectory,
        "statement-source",
      );
      const reconstructedPdf = await renderDocxWithLibreOffice(
        bytes,
        outputDirectory,
        "statement-current",
      );
      await assertPdfLineAnchorFidelity(
        sourcePdf,
        reconstructedPdf,
        outputDirectory,
        [
          { page: 1, contains: "Account activity statement" },
          { page: 1, contains: "Description" },
          { page: 1, contains: "Monthly service" },
          { page: 1, contains: "Priority support" },
          { page: 1, contains: "205.00", horizontal: "right" },
        ],
        0.03,
      );
      await assertRenderedPdfSimilarity(sourcePdf, reconstructedPdf, {
        maxMae: 20,
        maxChanged: 0.22,
      });
    }
  });

  test("PDF to Word keeps two-column prose independent instead of inventing a table", async ({
    page,
  }) => {
    const pdf = await makeTwoColumnReportPdf();
    await page.getByTestId("pdf-input").setInputFiles({
      name: "two-column-report.pdf",
      mimeType: "application/pdf",
      buffer: pdf,
    });
    await page.getByTestId("pdf-convert").click();
    await expect(page.getByTestId("pdf-lab")).toHaveAttribute(
      "data-state",
      "success",
      { timeout: 180_000 },
    );

    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("pdf-download").click();
    const bytes = await downloadBytes(await downloadPromise);
    const docx = await validateDocxDownload(
      bytes,
      "Left column introduces the first topic.",
    );
    const documentXml = await docx.file("word/document.xml")!.async("string");

    expect(documentXml).not.toContain("<w:tbl>");
    expect(documentXml).toContain("w:framePr");
    expect(documentXml).toContain("Left column introduces the first topic.");
    expect(documentXml).toContain("Right column begins an independent topic.");
    expect(frameXForText(documentXml, "Left column introduces the first topic."))
      .toBeLessThan(
        frameXForText(documentXml, "Right column begins an independent topic."),
      );
  });

  test("PDF to Word remains stable across ten sequential conversions and Unicode filenames", async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== "chromium",
      "Sequential stress is exercised once in Chromium; WebKit and Firefox run the functional corpus.",
    );

    for (let index = 0; index < 10; index += 1) {
      const pdf = await makePdf({ pages: index % 3 === 0 ? 2 : 1 });
      const name =
        index === 4
          ? "invoice résumé 日本語 04.pdf"
          : index === 7
            ? "duplicate name.pdf"
            : index === 8
              ? "duplicate name.pdf"
              : `sequential conversion ${index + 1}.pdf`;

      await page.getByTestId("pdf-input").setInputFiles({
        name,
        mimeType: "application/pdf",
        buffer: pdf,
      });
      await page.getByTestId("pdf-convert").click();
      await expect(page.getByTestId("pdf-lab")).toHaveAttribute(
        "data-state",
        "success",
        { timeout: 120_000 },
      );

      const downloadPromise = page.waitForEvent("download");
      await page.getByTestId("pdf-download").click();
      const bytes = await downloadBytes(await downloadPromise);
      await validateDocxDownload(
        bytes,
        "Lumeo editable PDF reconstruction fixture",
      );
    }
  });

  test("PDF to Word cancellation cleans up and permits retry", async ({ page }) => {
    const slowPdf = await makePdf({ rich: true, pages: 90 });

    await page.getByTestId("pdf-input").setInputFiles({
      name: "cancel.pdf",
      mimeType: "application/pdf",
      buffer: slowPdf,
    });
    await page.getByTestId("pdf-convert").click();

    await expect(page.getByTestId("pdf-lab")).toHaveAttribute(
      "data-state",
      "converting",
    );
    await page.getByTestId("pdf-cancel").click();
    await expect(page.getByTestId("pdf-lab")).toHaveAttribute(
      "data-state",
      "cancelled",
    );

    const retryPdf = await makePdf();
    await page.getByTestId("pdf-input").setInputFiles({
      name: "retry.pdf",
      mimeType: "application/pdf",
      buffer: retryPdf,
    });
    await page.getByTestId("pdf-convert").click();
    await expect(page.getByTestId("pdf-lab")).toHaveAttribute(
      "data-state",
      "success",
      { timeout: 120_000 },
    );
  });

  test("invalid PDF is rejected with a friendly error", async ({ page }) => {
    await page.getByTestId("pdf-input").setInputFiles({
      name: "broken.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("not a pdf"),
    });
    await page.getByTestId("pdf-convert").click();

    await expect(page.getByTestId("pdf-lab")).toHaveAttribute(
      "data-state",
      "error",
    );
    await expect(page.getByTestId("pdf-status")).toContainText(
      /damaged|incomplete|different format/i,
    );
  });

  test("public Word to PDF recovers cross-origin isolation after client navigation", async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== "chromium",
      "Threaded Office client-navigation recovery is validated once in Chromium.",
    );

    await page.goto("/pdf-tools", { waitUntil: "domcontentloaded" });
    expect(await page.evaluate(() => window.crossOriginIsolated)).toBe(false);

    const wordToPdfLink = page.locator('a[href="/pdf/word-to-pdf"]').first();
    await expect(wordToPdfLink).toBeVisible();
    await wordToPdfLink.click();
    await page.waitForURL("**/pdf/word-to-pdf");

    await expect
      .poll(() => page.evaluate(() => window.crossOriginIsolated), {
        timeout: 30_000,
      })
      .toBe(true);

    const docx = await makeDocx({ rich: true });
    await page.locator('input[type="file"]').setInputFiles({
      name: "client-navigation-roundtrip.docx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer: docx,
    });

    await expect(page.getByText("Ready to convert")).toBeVisible({
      timeout: 180_000,
    });
    const convertButton = page.getByRole("button", { name: "Convert to PDF" });
    await expect(convertButton).toBeEnabled();
    await convertButton.click();
    await expect(page.getByText("PDF ready")).toBeVisible({
      timeout: 420_000,
    });

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download PDF" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(
      "client-navigation-roundtrip.pdf",
    );
    const bytes = await downloadBytes(download);
    await validatePdfDownload(bytes);
  });


  test("Word to PDF converts small and rich DOCX and generated PDFs really open", async ({
    page,
    browserName,
  }, testInfo) => {
    test.skip(browserName !== "chromium", "LibreOffice WASM validation runs once in Chromium.");

    await expect(page.getByTestId("capabilities")).toContainText(
      "Threads ready: yes",
      { timeout: 30_000 },
    );

    const small = await makeDocx();
    await page.getByTestId("word-input").setInputFiles({
      name: "small.docx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer: small,
    });
    await page.getByTestId("word-convert").click();

    await expect(page.getByTestId("word-lab")).toHaveAttribute(
      "data-state",
      "success",
      { timeout: 420_000 },
    );

    let downloadPromise = page.waitForEvent("download");
    await page.getByTestId("word-download").click();
    let bytes = await downloadBytes(await downloadPromise);
    await validatePdfDownload(bytes);

    const rich = await makeDocx({ rich: true });
    await page.getByTestId("word-input").setInputFiles({
      name: "rich.docx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer: rich,
    });
    await page.getByTestId("word-convert").click();

    await expect(page.getByTestId("word-lab")).toHaveAttribute(
      "data-state",
      "success",
      { timeout: 240_000 },
    );

    downloadPromise = page.waitForEvent("download");
    await page.getByTestId("word-download").click();
    bytes = await downloadBytes(await downloadPromise);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(2);

    if (process.env.LUMEO_FIDELITY_CLI === "1") {
      const outputDirectory = testInfo.outputPath("word-to-pdf-fidelity");
      const referencePdf = await renderDocxWithLibreOffice(
        rich,
        outputDirectory,
        "rich-word-reference",
      );
      const browserPdf = await writePdfFixture(
        bytes,
        outputDirectory,
        "rich-word-browser",
      );

      await assertPdfLineAnchorFidelity(
        referencePdf,
        browserPdf,
        outputDirectory,
        [
          { page: 1, contains: "Lumeo formatted heading" },
          { page: 1, contains: "Table A1" },
          { page: 1, contains: "Table B2" },
          {
            page: 2,
            contains: "Lumeo second page centered text",
            horizontal: "center",
          },
        ],
        0.025,
      );
      const [referenceImages, browserImages] = await Promise.all([
        countPdfImages(referencePdf),
        countPdfImages(browserPdf),
      ]);
      expect(referenceImages).toBeGreaterThan(0);
      expect(browserImages).toBeGreaterThanOrEqual(referenceImages);
      await assertRenderedPdfSimilarity(referencePdf, browserPdf, {
        maxMae: 18,
        maxChanged: 0.20,
      });
    }
  });



  test("Word to PDF preserves professional formatting against native LibreOffice reference", async ({
    page,
    browserName,
  }, testInfo) => {
    test.skip(
      browserName !== "chromium",
      "Professional Office fidelity comparison runs once in Chromium.",
    );

    await expect(page.getByTestId("capabilities")).toContainText(
      "Threads ready: yes",
      { timeout: 30_000 },
    );

    const source = await makeProfessionalDocx();
    await page.getByTestId("word-input").setInputFiles({
      name: "professional-fidelity-fixture.docx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer: source,
    });
    await page.getByTestId("word-convert").click();
    await expect(page.getByTestId("word-lab")).toHaveAttribute(
      "data-state",
      "success",
      { timeout: 420_000 },
    );

    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("word-download").click();
    const bytes = await downloadBytes(await downloadPromise);
    const generated = await PDFDocument.load(bytes);
    expect(generated.getPageCount()).toBe(2);

    if (process.env.LUMEO_FIDELITY_CLI === "1") {
      const outputDirectory = testInfo.outputPath("professional-word-fidelity");
      const referencePdf = await renderDocxWithLibreOffice(
        source,
        outputDirectory,
        "professional-reference",
      );
      const browserPdf = await writePdfFixture(
        bytes,
        outputDirectory,
        "professional-browser",
      );

      await assertPdfLineAnchorFidelity(
        referencePdf,
        browserPdf,
        outputDirectory,
        [
          {
            page: 1,
            contains: "Lumeo Professional Header",
            horizontal: "right",
          },
          { page: 1, contains: "Professional fidelity fixture" },
          { page: 1, contains: "Times italic underlined sample" },
          { page: 1, contains: "Unicode:" },
          { page: 1, contains: "Merged table heading" },
          { page: 1, contains: "Table A1" },
          {
            page: 1,
            contains: "Professional Footer",
            horizontal: "center",
          },
          {
            page: 2,
            contains: "Lumeo Professional Header",
            horizontal: "right",
          },
          {
            page: 2,
            contains: "Landscape section content",
            horizontal: "center",
          },
          { page: 2, contains: "Landscape Table A" },
          {
            page: 2,
            contains: "Professional Footer",
            horizontal: "center",
          },
        ],
        0.025,
      );

      const [referenceImages, browserImages] = await Promise.all([
        countPdfImages(referencePdf),
        countPdfImages(browserPdf),
      ]);
      expect(referenceImages).toBeGreaterThan(0);
      expect(browserImages).toBeGreaterThanOrEqual(referenceImages);

      await assertRenderedPdfSimilarity(referencePdf, browserPdf, {
        maxMae: 20,
        maxChanged: 0.22,
      });
    }
  });

  test("Word to PDF preserves multi-column sections and vector text-box shapes against native reference", async ({
    page,
    browserName,
  }, testInfo) => {
    test.skip(
      browserName !== "chromium",
      "Threaded Office fidelity comparison runs once in Chromium.",
    );

    await expect(page.getByTestId("capabilities")).toContainText(
      "Threads ready: yes",
      { timeout: 30_000 },
    );

    const source = await makeAdvancedLayoutDocx();
    await page.getByTestId("word-input").setInputFiles({
      name: "advanced-columns-shape.docx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer: source,
    });
    await page.getByTestId("word-convert").click();
    await expect(page.getByTestId("word-lab")).toHaveAttribute(
      "data-state",
      "success",
      { timeout: 420_000 },
    );

    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("word-download").click();
    const bytes = await downloadBytes(await downloadPromise);
    const generated = await PDFDocument.load(bytes);
    expect(generated.getPageCount()).toBe(2);

    if (process.env.LUMEO_FIDELITY_CLI === "1") {
      const outputDirectory = testInfo.outputPath("advanced-word-layout");
      const referencePdf = await renderDocxWithLibreOffice(
        source,
        outputDirectory,
        "advanced-reference",
      );
      const browserPdf = await writePdfFixture(
        bytes,
        outputDirectory,
        "advanced-browser",
      );

      await assertPdfLineAnchorFidelity(
        referencePdf,
        browserPdf,
        outputDirectory,
        [
          {
            page: 1,
            contains: "Advanced multi-column",
            horizontal: "center",
          },
          { page: 1, contains: "First column content begins" },
          { page: 1, contains: "Second column content begins here" },
          { page: 1, contains: "Vector text-box shape fixture" },
          { page: 2, contains: "Second page after columns" },
          { page: 2, contains: "section break restores ordinary" },
        ],
        0.025,
      );
      await assertRenderedPdfSimilarity(referencePdf, browserPdf, {
        maxMae: 18,
        maxChanged: 0.20,
      });
    }
  });

  test("Word to PDF stays stable across five sequential conversions", async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== "chromium",
      "Threaded Office sequential stress runs once in Chromium.",
    );

    await expect(page.getByTestId("capabilities")).toContainText(
      "Threads ready: yes",
      { timeout: 30_000 },
    );

    for (let index = 0; index < 5; index += 1) {
      const source = await makeDocx({ rich: index % 2 === 1 });
      await page.getByTestId("word-input").setInputFiles({
        name:
          index === 2
            ? "professional résumé 日本語.docx"
            : `sequential word ${index + 1}.docx`,
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        buffer: source,
      });
      await page.getByTestId("word-convert").click();
      await expect(page.getByTestId("word-lab")).toHaveAttribute(
        "data-state",
        "success",
        { timeout: 420_000 },
      );
      const downloadPromise = page.waitForEvent("download");
      await page.getByTestId("word-download").click();
      await validatePdfDownload(await downloadBytes(await downloadPromise));
    }
  });

  test("browser converters preserve semantic structure through PDF to Word to PDF round trip", async ({
    page,
    browserName,
  }, testInfo) => {
    test.skip(
      browserName !== "chromium",
      "Office round-trip validation runs once in Chromium.",
    );

    const retiredTransport: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      const retiredApi =
        url.pathname === "/api/tools/word-to-pdf" ||
        url.pathname === "/api/tools/pdf-to-word" ||
        url.pathname === "/api/tools/word-to-pdf/cleanup";
      const storageWrite =
        url.pathname.startsWith("/storage/v1/") &&
        request.method() !== "GET";
      const retiredRender =
        url.hostname === "lumeo-word-to-pdf-converter.onrender.com";
      if (retiredApi || storageWrite || retiredRender) {
        retiredTransport.push(`${request.method()} ${request.url()}`);
      }
    });

    const sourcePdf = await makeSemanticLetterPdf();
    await page.getByTestId("pdf-input").setInputFiles({
      name: "semantic round trip source.pdf",
      mimeType: "application/pdf",
      buffer: sourcePdf,
    });
    await page.getByTestId("pdf-convert").click();
    await expect(page.getByTestId("pdf-lab")).toHaveAttribute(
      "data-state",
      "success",
      { timeout: 180_000 },
    );

    let downloadPromise = page.waitForEvent("download");
    await page.getByTestId("pdf-download").click();
    const reconstructedWord = await downloadBytes(await downloadPromise);
    const reconstructedZip = await validateDocxDownload(
      reconstructedWord,
      "This document exercises normal paragraph reconstruction",
    );
    const reconstructedXml = await reconstructedZip
      .file("word/document.xml")!
      .async("string");
    const semanticMarker =
      "This document exercises normal paragraph reconstruction";
    const markerIndex = reconstructedXml.indexOf(semanticMarker);
    const paragraphStart = reconstructedXml.lastIndexOf("<w:p>", markerIndex);
    const paragraphEnd = reconstructedXml.indexOf("</w:p>", markerIndex);
    expect(
      reconstructedXml.slice(paragraphStart, paragraphEnd + 6),
    ).not.toContain("w:framePr");

    await page.getByTestId("word-input").setInputFiles({
      name: "semantic round trip reconstructed.docx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer: reconstructedWord,
    });
    await page.getByTestId("word-convert").click();
    await expect(page.getByTestId("word-lab")).toHaveAttribute(
      "data-state",
      "success",
      { timeout: 420_000 },
    );
    downloadPromise = page.waitForEvent("download");
    await page.getByTestId("word-download").click();
    const roundTripPdf = await downloadBytes(await downloadPromise);
    await validatePdfDownload(roundTripPdf);

    if (process.env.LUMEO_FIDELITY_CLI === "1") {
      const outputDirectory = testInfo.outputPath("pdf-word-pdf-roundtrip");
      const sourcePath = await writePdfFixture(
        sourcePdf,
        outputDirectory,
        "source",
      );
      const roundTripPath = await writePdfFixture(
        roundTripPdf,
        outputDirectory,
        "roundtrip",
      );
      await assertPdfLineAnchorFidelity(
        sourcePath,
        roundTripPath,
        outputDirectory,
        [
          { page: 1, contains: "Lumeo Professional Letter" },
          { page: 1, contains: "This document exercises" },
          { page: 1, contains: "The second visual line" },
          { page: 1, contains: "A separate paragraph follows" },
          { page: 1, contains: "Kind regards" },
        ],
        0.035,
      );
      await assertRenderedPdfSimilarity(sourcePath, roundTripPath, {
        maxMae: 22,
        maxChanged: 0.25,
      });
    }

    expect(retiredTransport).toEqual([]);
  });

  test("browser converters survive Word to PDF to Word to PDF round trip without retired transport", async ({
    page,
    browserName,
  }, testInfo) => {
    test.skip(
      browserName !== "chromium",
      "Office round-trip validation runs once in Chromium.",
    );

    const retiredTransport: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      const retiredApi =
        url.pathname === "/api/tools/word-to-pdf" ||
        url.pathname === "/api/tools/pdf-to-word" ||
        url.pathname === "/api/tools/word-to-pdf/cleanup";
      const storageWrite =
        url.pathname.startsWith("/storage/v1/") &&
        request.method() !== "GET";
      const retiredRender =
        url.hostname === "lumeo-word-to-pdf-converter.onrender.com";
      if (retiredApi || storageWrite || retiredRender) {
        retiredTransport.push(`${request.method()} ${request.url()}`);
      }
    });

    const sourceWord = await makeDocx({ rich: true });
    await page.getByTestId("word-input").setInputFiles({
      name: "round trip source.docx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer: sourceWord,
    });
    await page.getByTestId("word-convert").click();
    await expect(page.getByTestId("word-lab")).toHaveAttribute(
      "data-state",
      "success",
      { timeout: 420_000 },
    );
    let downloadPromise = page.waitForEvent("download");
    await page.getByTestId("word-download").click();
    const firstPdf = await downloadBytes(await downloadPromise);
    await validatePdfDownload(firstPdf);

    await page.getByTestId("pdf-input").setInputFiles({
      name: "round trip intermediate.pdf",
      mimeType: "application/pdf",
      buffer: firstPdf,
    });
    await page.getByTestId("pdf-convert").click();
    await expect(page.getByTestId("pdf-lab")).toHaveAttribute(
      "data-state",
      "success",
      { timeout: 180_000 },
    );
    downloadPromise = page.waitForEvent("download");
    await page.getByTestId("pdf-download").click();
    const reconstructedWord = await downloadBytes(await downloadPromise);
    await validateDocxDownload(
      reconstructedWord,
      "Lumeo browser-only Word conversion fixture",
    );

    await page.getByTestId("word-input").setInputFiles({
      name: "round trip reconstructed.docx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer: reconstructedWord,
    });
    await page.getByTestId("word-convert").click();
    await expect(page.getByTestId("word-lab")).toHaveAttribute(
      "data-state",
      "success",
      { timeout: 420_000 },
    );
    downloadPromise = page.waitForEvent("download");
    await page.getByTestId("word-download").click();
    const finalPdf = await downloadBytes(await downloadPromise);
    await validatePdfDownload(finalPdf);

    if (process.env.LUMEO_FIDELITY_CLI === "1") {
      const outputDirectory = testInfo.outputPath("word-pdf-word-pdf-roundtrip");
      const firstPdfPath = await writePdfFixture(
        firstPdf,
        outputDirectory,
        "first-pdf",
      );
      const reconstructedWordPdf = await renderDocxWithLibreOffice(
        reconstructedWord,
        outputDirectory,
        "reconstructed-word",
      );
      const finalPdfPath = await writePdfFixture(
        finalPdf,
        outputDirectory,
        "final-pdf",
      );

      await assertRenderedPdfSimilarity(
        firstPdfPath,
        reconstructedWordPdf,
        {
          maxMae: 22,
          maxChanged: 0.25,
        },
      );
      await assertRenderedPdfSimilarity(firstPdfPath, finalPdfPath, {
        maxMae: 22,
        maxChanged: 0.25,
      });
    }

    expect(retiredTransport).toEqual([]);
  });

  test("Word to PDF cancellation resets runtime and a retry can start cleanly", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "LibreOffice WASM validation runs once in Chromium.");

    const large = await makeDocx({ rich: true, repeatedParagraphs: 5000 });
    await page.getByTestId("word-input").setInputFiles({
      name: "cancel.docx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer: large,
    });
    await page.getByTestId("word-convert").click();
    await expect(page.getByTestId("word-lab")).toHaveAttribute(
      "data-state",
      "converting",
    );
    await page.getByTestId("word-cancel").click();
    await expect(page.getByTestId("word-lab")).toHaveAttribute(
      "data-state",
      "cancelled",
      { timeout: 30_000 },
    );

    const retry = await makeDocx();
    await page.getByTestId("word-input").setInputFiles({
      name: "retry.docx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer: retry,
    });
    await page.getByTestId("word-convert").click();

    await expect(page.getByTestId("word-lab")).toHaveAttribute(
      "data-state",
      "success",
      { timeout: 420_000 },
    );
  });

  test("Word runtime loading failure is reported without server fallback", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "Runtime failure validation runs once in Chromium.");

    await page.getByTestId("runtime-base").fill(
      "https://127.0.0.1:9/lumeo-runtime-test/",
    );
    const docx = await makeDocx();
    await page.getByTestId("word-input").setInputFiles({
      name: "runtime-failure.docx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer: docx,
    });
    await page.getByTestId("word-convert").click();

    await expect(page.getByTestId("word-lab")).toHaveAttribute(
      "data-state",
      "error",
      { timeout: 30_000 },
    );
    await expect(page.getByTestId("word-status")).toContainText(
      /local conversion engine could not be loaded/i,
    );
  });

  test("oversized Word input is rejected before conversion starts", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "Oversized upload enforcement is validated once in Chromium.");

    await page.goto("/internal/conversion-ui-lab");
    await page.evaluate(() => {
      const chunk = new Uint8Array(1024 * 1024);
      chunk[0] = 0x50;
      chunk[1] = 0x4b;
      chunk[2] = 0x03;
      chunk[3] = 0x04;
      const file = new File(
        Array.from({ length: 251 }, () => chunk),
        "oversized.docx",
        {
          type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        },
      );
      const transfer = new DataTransfer();
      transfer.items.add(file);
      const input = document.getElementById("word-to-pdf-upload");
      const dropTarget = input?.closest(".l2-upload-stage");
      if (!dropTarget) throw new Error("Word drop target not found.");
      dropTarget.dispatchEvent(
        new DragEvent("drop", {
          bubbles: true,
          cancelable: true,
          dataTransfer: transfer,
        }),
      );
    });

    const wordUi = page.getByTestId("word-public-ui");
    await expect(wordUi.getByRole("alert")).toContainText(/250 MB/i);
    await expect(
      wordUi.getByRole("button", { name: "Select Word document" }),
    ).toBeVisible();
  });

  test("Word customer UI accepts drag-and-drop as well as the file picker", async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== "chromium",
      "Synthetic DataTransfer drop is validated in Chromium; WebKit/Firefox still exercise the real file picker and responsive customer UI.",
    );

    await page.goto("/internal/conversion-ui-lab");
    const word = await makeDocx();
    const base64 = word.toString("base64");
    const name = "drag-drop.docx";

    await page.evaluate(
      ({ base64, name }) => {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) {
          bytes[index] = binary.charCodeAt(index);
        }

        const file = new File([bytes], name, {
          type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        });
        const transfer = new DataTransfer();
        transfer.items.add(file);
        const input = document.getElementById("word-to-pdf-upload");
        const dropTarget = input?.closest(".l2-upload-stage");
        if (!dropTarget) throw new Error("Word drop target not found.");
        dropTarget.dispatchEvent(
          new DragEvent("drop", {
            bubbles: true,
            cancelable: true,
            dataTransfer: transfer,
          }),
        );
      },
      { base64, name },
    );

    const wordUi = page.getByTestId("word-public-ui");
    await expect(
      wordUi.getByRole("button", { name: `Remove ${name}` }),
    ).toBeVisible();
    await expect(wordUi.locator('[aria-live="polite"]')).toContainText(
      "File selected",
    );
  });

  test("customer converter UIs remain keyboard-usable with long names and no horizontal overflow", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto("/internal/conversion-ui-lab");

    const longWordName =
      "this-is-a-very-long-lumeo-word-document-name-for-mobile-overflow-validation-2026.docx";
    const word = await makeDocx();
    const wordUi = page.getByTestId("word-public-ui");
    await wordUi.locator('input[type="file"]').setInputFiles({
      name: longWordName,
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer: word,
    });

    await expect(
      wordUi.getByRole("button", { name: `Remove ${longWordName}` }),
    ).toBeVisible();
    await expect(wordUi.locator('[aria-live="polite"]')).toContainText(
      "File selected",
    );

    const mobileOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(mobileOverflow).toBeLessThanOrEqual(1);

    const removeWord = wordUi.getByRole("button", {
      name: `Remove ${longWordName}`,
    });
    await removeWord.focus();
    await expect(removeWord).toBeFocused();
    await removeWord.press("Enter");
    await expect(
      wordUi.getByRole("button", { name: "Select Word document" }),
    ).toBeVisible();

    const longPdfName =
      "this-is-a-very-long-lumeo-pdf-document-name-for-mobile-overflow-validation-2026.pdf";
    const pdf = await makePdf();
    const pdfUi = page.getByTestId("pdf-public-ui");
    await pdfUi.locator('input[type="file"]').setInputFiles({
      name: longPdfName,
      mimeType: "application/pdf",
      buffer: pdf,
    });
    await expect(
      pdfUi.getByRole("button", { name: `Remove ${longPdfName}` }),
    ).toBeVisible();
    await expect(pdfUi.locator('[aria-live="polite"]')).toContainText(
      "File selected",
    );

    for (const width of [768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
    }
  });

  test("Word path is capability-aware outside Chromium", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName === "chromium", "Chromium Word conversion is covered by the full fidelity tests.");

    await expect(page.getByTestId("capabilities")).not.toContainText(
      "Checking browser capabilities",
      { timeout: 30_000 },
    );
    const capabilities = (await page.getByTestId("capabilities").textContent()) ?? "";

    const docx = await makeDocx();
    await page.getByTestId("word-input").setInputFiles({
      name: `capability-${browserName}.docx`,
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer: docx,
    });
    await page.getByTestId("word-convert").click();

    if (capabilities.includes("Office runtime ready: yes")) {
      await expect(page.getByTestId("word-lab")).toHaveAttribute(
        "data-state",
        "success",
        { timeout: 420_000 },
      );
      const downloadPromise = page.waitForEvent("download");
      await page.getByTestId("word-download").click();
      await validatePdfDownload(await downloadBytes(await downloadPromise));
    } else {
      await expect(page.getByTestId("word-lab")).toHaveAttribute(
        "data-state",
        "error",
        { timeout: 30_000 },
      );
      await expect(page.getByTestId("word-status")).toContainText(
        /browser cannot run the local conversion engine/i,
      );
    }
  });

  test("Word capability failure is friendly", async ({ browser, browserName }) => {
    test.skip(browserName !== "chromium", "Capability override is validated once in Chromium.");

    const context = await browser.newContext();
    await context.addInitScript(() => {
      try {
        Object.defineProperty(globalThis, "SharedArrayBuffer", {
          value: undefined,
          configurable: true,
        });
      } catch {
        // If the browser does not permit overriding this intrinsic, the test
        // assertion below will reveal that instead of hiding the mismatch.
      }
    });
    const page = await context.newPage();

    await page.goto("/internal/conversion-lab");
    const docx = await makeDocx();
    await page.getByTestId("word-input").setInputFiles({
      name: "capability.docx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer: docx,
    });
    await page.getByTestId("word-convert").click();

    await expect(page.getByTestId("word-lab")).toHaveAttribute(
      "data-state",
      "error",
    );
    await expect(page.getByTestId("word-status")).toContainText(
      /browser cannot run the local conversion engine/i,
    );
    await context.close();
  });
});
