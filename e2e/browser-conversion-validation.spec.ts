import { expect, test } from "@playwright/test";
import type { Download } from "@playwright/test";
import JSZip from "jszip";
import {
  PDFDocument,
  StandardFonts,
  rgb,
} from "pdf-lib";
import { readFile } from "node:fs/promises";

const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z3xkAAAAASUVORK5CYII=",
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

  test("Word to PDF converts small and rich DOCX and generated PDFs really open", async ({
    page,
    browserName,
  }) => {
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
