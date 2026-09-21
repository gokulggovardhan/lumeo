import { expect, test, type Page, type Request } from "@playwright/test";
import type { Download } from "@playwright/test";
import JSZip from "jszip";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { readFile } from "node:fs/promises";

type RuntimeWatch = {
  pageErrors: string[];
  failedRequests: string[];
  retiredTransportRequests: string[];
};

function isExpectedOfficePreflightAbort(request: Request): boolean {
  const failure = request.failure()?.errorText ?? "";
  if (!/ERR_ABORTED/i.test(failure)) return false;

  const url = new URL(request.url());
  if (url.origin !== "https://lumeo.in" || !url.pathname.startsWith("/office-runtime/")) {
    return false;
  }

  const asset = url.pathname.split("/").at(-1) ?? "";
  if (asset === "soffice.js" && request.method() === "HEAD") {
    return true;
  }

  if (
    request.method() === "GET" &&
    ["soffice.wasm", "soffice.data", "soffice.data.js.metadata"].includes(asset)
  ) {
    return request.headers()["range"] === "bytes=0-0";
  }

  return false;
}

function watchConversionRuntime(page: Page): RuntimeWatch {
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];
  const retiredTransportRequests: string[] = [];

  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) => {
    if (isExpectedOfficePreflightAbort(request)) return;
    failedRequests.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText ?? "failed"}`);
  });
  page.on("request", (request) => {
    const url = new URL(request.url());
    const pathname = url.pathname;
    const retiredApi =
      pathname === "/api/tools/word-to-pdf" ||
      pathname === "/api/tools/pdf-to-word" ||
      pathname === "/api/tools/word-to-pdf/cleanup";
    const retiredStorageUpload =
      /\.supabase\.(?:co|in)$/.test(url.hostname) &&
      pathname.startsWith("/storage/v1/") &&
      request.method() !== "GET";
    const retiredContainer =
      url.hostname === "lumeo-word-to-pdf-converter.onrender.com";

    if (retiredApi || retiredStorageUpload || retiredContainer) {
      retiredTransportRequests.push(`${request.method()} ${request.url()}`);
    }
  });

  return { pageErrors, failedRequests, retiredTransportRequests };
}

function expectCleanRuntime(watch: RuntimeWatch) {
  expect(watch.pageErrors).toEqual([]);
  expect(watch.failedRequests).toEqual([]);
  expect(watch.retiredTransportRequests).toEqual([]);
}

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

  const runtime = watchConversionRuntime(page);
  await page.goto("/pdf/word-to-pdf");
  await expect(page.getByText(/Processed locally in your browser/i)).toBeVisible();

  const docx = await makeDocx();
  await page.locator('input[type="file"]').setInputFiles({
    name: "production-smoke.docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: docx,
  });

  await page.getByRole("button", { name: "Convert to PDF" }).click();

  const ready = page.getByText("PDF ready");
  const failure = page.getByRole("alert");
  await Promise.race([
    ready.waitFor({ state: "visible", timeout: 420_000 }),
    failure.waitFor({ state: "visible", timeout: 420_000 }).then(async () => {
      throw new Error(`Word to PDF production smoke failed: ${await failure.innerText()}`);
    }),
  ]);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF" }).click();
  const bytes = await downloadBytes(await downloadPromise);
  const output = await PDFDocument.load(bytes);
  expect(output.getPageCount()).toBeGreaterThan(0);
  expectCleanRuntime(runtime);
});

test("production PDF to Word reconstructs locally and downloaded DOCX opens", async ({
  page,
}) => {
  const runtime = watchConversionRuntime(page);
  await page.goto("/pdf/pdf-to-word");
  await expect(page.getByText(/Processed locally in your browser/i).first()).toBeVisible();

  const pdf = await makePdf();
  await page.locator('input[type="file"]').setInputFiles({
    name: "production-smoke.pdf",
    mimeType: "application/pdf",
    buffer: pdf,
  });

  await page.getByRole("button", { name: "Convert to Word" }).click();
  await expect(page.getByText("Word document ready")).toBeVisible({
    timeout: 180_000,
  });

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download Word document" }).click();
  const bytes = await downloadBytes(await downloadPromise);
  const docx = await JSZip.loadAsync(bytes);
  const xml = await docx.file("word/document.xml")?.async("string");
  expect(xml).toContain("Lumeo production PDF to Word smoke");
  expectCleanRuntime(runtime);
});

test("production HTML to PDF generates and downloads a valid PDF locally", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "HTML production smoke runs once in Chromium.");

  const runtime = watchConversionRuntime(page);
  await page.goto("/pdf/html-to-pdf");
  await page.getByLabel("HTML and CSS source").fill(
    `<!doctype html><html><body><h1>Lumeo HTML production smoke</h1><p>Browser-only HTML to PDF validation.</p></body></html>`,
  );
  await page.getByLabel("File name").fill("production-html-smoke");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Generate PDF" }).click();
  const bytes = await downloadBytes(await downloadPromise);
  const output = await PDFDocument.load(bytes);
  expect(output.getPageCount()).toBeGreaterThan(0);
  expectCleanRuntime(runtime);
});
