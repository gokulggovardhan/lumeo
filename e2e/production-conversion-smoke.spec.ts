import { expect, test } from "@playwright/test";
import type { Download, Page } from "@playwright/test";
import JSZip from "jszip";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { readFile } from "node:fs/promises";

async function makeDocx(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
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
  zip.folder("word")?.file(
    "document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Lumeo production browser conversion smoke</w:t></w:r></w:p>
    <w:p><w:r><w:t>Second line for layout validation.</w:t></w:r></w:p>
    <w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr>
  </w:body>
</w:document>`,
  );
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

async function makePdf(): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([612, 792]);
  page.drawText("Lumeo production PDF to Word smoke", {
    x: 72,
    y: 710,
    size: 18,
    font,
  });
  page.drawText("Editable reconstruction text", {
    x: 72,
    y: 675,
    size: 12,
    font,
  });
  return Buffer.from(await pdf.save());
}

async function downloadBytes(download: Download): Promise<Buffer> {
  const path = await download.path();
  if (!path) throw new Error("Downloaded file has no local path.");
  return readFile(path);
}

async function assertPublicToolStillBlocked(
  page: Page,
  route: string,
  actionName: string,
) {
  await page.goto(route);
  await expect(page.getByRole("button", { name: actionName })).toHaveCount(0);
}

test("production Word to PDF converts locally and downloaded PDF opens", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Threaded Office runtime production smoke runs in Chromium.");

  await assertPublicToolStillBlocked(page, "/pdf/word-to-pdf", "Convert to PDF");
  await page.goto("/internal/conversion-production-smoke");

  const tool = page.getByTestId("word-production-smoke");
  await expect(tool.getByText(/Processed locally in your browser/i)).toBeVisible();

  const docx = await makeDocx();
  await tool.locator('input[type="file"]').setInputFiles({
    name: "production-smoke.docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: docx,
  });

  await tool.getByRole("button", { name: "Convert to PDF" }).click();
  await expect(tool.getByText("PDF ready")).toBeVisible({ timeout: 420_000 });

  const downloadPromise = page.waitForEvent("download");
  await tool.getByRole("button", { name: "Download PDF" }).click();
  const bytes = await downloadBytes(await downloadPromise);
  const output = await PDFDocument.load(bytes);
  expect(output.getPageCount()).toBeGreaterThan(0);
});

test("production PDF to Word reconstructs locally and downloaded DOCX opens", async ({
  page,
}) => {
  await assertPublicToolStillBlocked(page, "/pdf/pdf-to-word", "Convert to Word");
  await page.goto("/internal/conversion-production-smoke");

  const tool = page.getByTestId("pdf-production-smoke");
  await expect(tool.getByText(/Processed locally in your browser/i).first()).toBeVisible();

  const pdf = await makePdf();
  await tool.locator('input[type="file"]').setInputFiles({
    name: "production-smoke.pdf",
    mimeType: "application/pdf",
    buffer: pdf,
  });

  await tool.getByRole("button", { name: "Convert to Word" }).click();
  await expect(tool.getByText("Word document ready")).toBeVisible({
    timeout: 180_000,
  });

  const downloadPromise = page.waitForEvent("download");
  await tool.getByRole("button", { name: "Download Word document" }).click();
  const bytes = await downloadBytes(await downloadPromise);
  const docx = await JSZip.loadAsync(bytes);
  const xml = await docx.file("word/document.xml")?.async("string");
  expect(xml).toContain("Lumeo production PDF to Word smoke");
});
