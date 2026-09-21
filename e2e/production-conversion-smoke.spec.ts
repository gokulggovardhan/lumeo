import { expect, test } from "@playwright/test";
import type { Download } from "@playwright/test";
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

test("production Word to PDF converts locally and downloaded PDF opens", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Threaded Office runtime production smoke runs in Chromium.");

  await page.goto("/pdf/word-to-pdf");

  const tool = page;
  await expect(tool.getByText(/Processed locally in your browser/i)).toBeVisible();

  const docx = await makeDocx();
  await tool.locator('input[type="file"]').setInputFiles({
    name: "production-smoke.docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: docx,
  });

  await tool.getByRole("button", { name: "Convert to PDF" }).click();

  const ready = tool.getByText("PDF ready");
  const failure = tool.getByRole("alert");
  await Promise.race([
    ready.waitFor({ state: "visible", timeout: 420_000 }),
    failure.waitFor({ state: "visible", timeout: 420_000 }).then(async () => {
      throw new Error(`Word to PDF production smoke failed: ${await failure.innerText()}`);
    }),
  ]);

  const downloadPromise = page.waitForEvent("download");
  await tool.getByRole("button", { name: "Download PDF" }).click();
  const bytes = await downloadBytes(await downloadPromise);
  const output = await PDFDocument.load(bytes);
  expect(output.getPageCount()).toBeGreaterThan(0);
});

test("production PDF to Word reconstructs locally and downloaded DOCX opens", async ({
  page,
}) => {
  await page.goto("/pdf/pdf-to-word");

  const tool = page;
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

test("production HTML to PDF generates locally and downloaded PDF opens", async ({
  page,
}) => {
  await page.goto("/pdf/html-to-pdf");

  await expect(page.getByText(/Browser-only|browser/i).first()).toBeVisible();

  await page.getByLabel("HTML and CSS source").fill(
    "<style>body{font-family:sans-serif;padding:24px}</style><h1>Lumeo HTML production smoke</h1><p>Browser-only HTML to PDF validation.</p>",
  );
  await page.getByLabel("File name").fill("production-html-smoke");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Generate PDF" }).click();
  const bytes = await downloadBytes(await downloadPromise);
  const output = await PDFDocument.load(bytes);

  expect(output.getPageCount()).toBeGreaterThan(0);
});

