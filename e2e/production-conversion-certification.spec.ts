import { expect, test, type Page, type Request } from "@playwright/test";
import type { Download } from "@playwright/test";
import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";
import { readFile } from "node:fs/promises";

import { makeProfessionalDocx } from "./professional-docx-fixture";
import {
  makeSemanticLetterPdf,
  makeTwoColumnReportPdf,
  makeWhitespaceStatementPdf,
} from "./semantic-pdf-fixtures";

type FailedRequest = {
  method: string;
  url: string;
  errorText: string;
};

type RuntimeWatch = {
  pageErrors: string[];
  consoleErrors: string[];
  failedRequests: FailedRequest[];
  successfulResponseUrls: Set<string>;
  retiredTransportRequests: string[];
  officeRuntimeRequests: string[];
};

function isExpectedOfficePreflightAbort(request: Request): boolean {
  const failure = request.failure()?.errorText ?? "";
  const url = new URL(request.url());
  if (url.origin !== "https://lumeo.in" || !url.pathname.startsWith("/office-runtime/")) {
    return false;
  }

  if (!/ERR_ABORTED|NS_BINDING_ABORTED|cancel/i.test(failure)) return false;

  const asset = url.pathname.split("/").at(-1) ?? "";
  if (asset === "soffice.js" && request.method() === "HEAD") return true;

  return (
    request.method() === "GET" &&
    ["soffice.wasm", "soffice.data", "soffice.data.js.metadata"].includes(asset) &&
    request.headers()["range"] === "bytes=0-0"
  );
}

function watchConversionRuntime(page: Page): RuntimeWatch {
  const watch: RuntimeWatch = {
    pageErrors: [],
    consoleErrors: [],
    failedRequests: [],
    successfulResponseUrls: new Set<string>(),
    retiredTransportRequests: [],
    officeRuntimeRequests: [],
  };

  page.on("pageerror", (error) => watch.pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") watch.consoleErrors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.ok()) watch.successfulResponseUrls.add(response.url());
  });
  page.on("requestfailed", (request) => {
    if (isExpectedOfficePreflightAbort(request)) return;
    watch.failedRequests.push({
      method: request.method(),
      url: request.url(),
      errorText: request.failure()?.errorText ?? "failed",
    });
  });
  page.on("request", (request) => {
    const url = new URL(request.url());
    const pathname = url.pathname;

    if (url.origin === "https://lumeo.in" && pathname.startsWith("/office-runtime/")) {
      watch.officeRuntimeRequests.push(`${request.method()} ${request.url()}`);
    }

    const retiredApi =
      pathname === "/api/tools/word-to-pdf" ||
      pathname === "/api/tools/pdf-to-word" ||
      pathname === "/api/tools/word-to-pdf/cleanup";
    const retiredStorageWrite =
      pathname.startsWith("/storage/v1/") &&
      !["GET", "HEAD"].includes(request.method());
    const retiredContainer =
      url.hostname === "lumeo-word-to-pdf-converter.onrender.com";

    if (retiredApi || retiredStorageWrite || retiredContainer) {
      watch.retiredTransportRequests.push(`${request.method()} ${request.url()}`);
    }
  });

  return watch;
}

function isRecoveredPdfWorkerBootstrapFailure(
  failure: FailedRequest,
  successfulResponseUrls: Set<string>,
): boolean {
  if (failure.method !== "GET" || failure.errorText !== "net::ERR_BLOCKED_BY_RESPONSE") {
    return false;
  }

  const url = new URL(failure.url);
  return (
    url.origin === "https://lumeo.in" &&
    /^\/_next\/static\/media\/pdf\.worker\.[A-Za-z0-9_-]+\.mjs$/.test(url.pathname) &&
    successfulResponseUrls.has(failure.url)
  );
}

function isFirefoxUnsupportedClipboardPermissionError(message: string): boolean {
  return /^'(clipboard-read|clipboard-write)' \(value of 'name' member of PermissionDescriptor\) is not a valid value for enumeration PermissionName\.$/.test(
    message,
  );
}

function isExpectedSandboxPreviewConsoleError(message: string): boolean {
  return /^Blocked script execution in 'about:srcdoc' because the document's frame is sandboxed and the 'allow-scripts' permission is not set\.$/.test(
    message,
  );
}

function isExpectedOfficeRuntimeDiagnostic(
  message: string,
  browserName?: string,
): boolean {
  const normalized = message.trim();
  if (
    (browserName === "chromium" || browserName === "firefox") &&
    (normalized === "QRect(0,0 0x0) 1" ||
      normalized === "QObject::connect(QWindow, QtFrame): invalid nullptr parameter")
  ) {
    return true;
  }

  return (
    (browserName === "chromium" || browserName === "firefox") &&
    normalized === "warning: unsupported syscall: __syscall_mprotect"
  );
}

function expectCleanRuntime(
  watch: RuntimeWatch,
  browserName?: string,
  allowOfficeRuntimeDiagnostics = false,
): void {
  const pageErrors =
    browserName === "firefox"
      ? watch.pageErrors.filter(
          (message) => !isFirefoxUnsupportedClipboardPermissionError(message),
        )
      : watch.pageErrors;
  const consoleErrors = watch.consoleErrors.filter(
    (message) =>
      !isExpectedSandboxPreviewConsoleError(message) &&
      !(
        allowOfficeRuntimeDiagnostics &&
        isExpectedOfficeRuntimeDiagnostic(message, browserName)
      ),
  );

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(
    watch.failedRequests
      .filter(
        (failure) =>
          !isRecoveredPdfWorkerBootstrapFailure(
            failure,
            watch.successfulResponseUrls,
          ),
      )
      .map((failure) => `${failure.method} ${failure.url}: ${failure.errorText}`),
  ).toEqual([]);
  expect(watch.retiredTransportRequests).toEqual([]);
}

async function downloadBytes(download: Download): Promise<Buffer> {
  const path = await download.path();
  if (!path) throw new Error("Downloaded file has no local path.");
  return readFile(path);
}

async function replaceControlledText(
  page: Page,
  label: string,
  value: string,
): Promise<void> {
  const field = page.getByLabel(label);
  await field.click();
  await field.press("ControlOrMeta+A");
  await page.keyboard.insertText(value);
  await expect(field).toHaveValue(value);
}

async function readDocxXml(bytes: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(bytes);
  expect(zip.file("[Content_Types].xml")).toBeTruthy();
  expect(zip.file("word/document.xml")).toBeTruthy();
  expect(zip.file("word/_rels/document.xml.rels")).toBeTruthy();
  return (await zip.file("word/document.xml")?.async("string")) ?? "";
}

function occurrences(source: string, needle: string): number {
  return source.split(needle).length - 1;
}

async function makeCancellationDocx(): Promise<Buffer> {
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

  const paragraphs = Array.from(
    { length: 5000 },
    (_, index) =>
      `<w:p><w:r><w:t>Cancellation regression paragraph ${index + 1} — browser-only Office runtime reuse.</w:t></w:r></w:p>`,
  ).join("");

  zip.folder("word")?.file(
    "document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${paragraphs}
    <w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>
  </w:body>
</w:document>`,
  );

  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

function semanticParagraphFor(xml: string, marker: string): string {
  const index = xml.indexOf(marker);
  expect(index).toBeGreaterThanOrEqual(0);
  const start = xml.lastIndexOf("<w:p>", index);
  const end = xml.indexOf("</w:p>", index);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return xml.slice(start, end + 6);
}

async function convertPdfToWord(
  page: Page,
  input: { name: string; buffer: Buffer; expectedFileName: string },
): Promise<{ bytes: Buffer; xml: string }> {
  await page.locator('input[type="file"]').setInputFiles({
    name: input.name,
    mimeType: "application/pdf",
    buffer: input.buffer,
  });
  await expect(
    page.getByRole("button", { name: `Remove ${input.name}` }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Convert to Word" }).click();
  await expect(page.getByText("Word document ready")).toBeVisible({ timeout: 180_000 });

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download Word document" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(input.expectedFileName);
  const bytes = await downloadBytes(download);
  expect(bytes.length).toBeGreaterThan(1_000);
  return { bytes, xml: await readDocxXml(bytes) };
}

async function convertWordToPdf(
  page: Page,
  input: { name: string; buffer: Buffer; expectedFileName: string },
): Promise<Buffer> {
  await page.locator('input[type="file"]').setInputFiles({
    name: input.name,
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: input.buffer,
  });
  await expect(
    page.getByRole("button", { name: `Remove ${input.name}` }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Convert to PDF" }).click();
  await expect(page.getByText("PDF ready")).toBeVisible({ timeout: 420_000 });

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(input.expectedFileName);
  const bytes = await downloadBytes(download);
  expect(bytes.length).toBeGreaterThan(1_000);
  const pdf = await PDFDocument.load(bytes);
  expect(pdf.getPageCount()).toBeGreaterThan(0);
  return bytes;
}

test("production PDF to Word preserves semantic/table/two-column classification across repeated public conversions", async ({
  page,
  browserName,
}) => {
  const runtime = watchConversionRuntime(page);
  await page.goto("/pdf/pdf-to-word", { waitUntil: "domcontentloaded" });
  await expect(page.getByText(/Processed locally in your browser/i).first()).toBeVisible();

  const semantic = await convertPdfToWord(page, {
    name: "semantic-letter.pdf",
    buffer: await makeSemanticLetterPdf(),
    expectedFileName: "semantic-letter.docx",
  });
  const semanticMarker = "This document exercises normal paragraph reconstruction";
  const semanticParagraph = semanticParagraphFor(semantic.xml, semanticMarker);
  expect(semanticParagraph).not.toContain("w:framePr");
  expect(semanticParagraph).not.toContain("w:fitText");
  expect(semanticParagraph).toContain("<w:br/>");
  expect(occurrences(semantic.xml, semanticMarker)).toBe(1);

  await page.getByRole("button", { name: "Convert another" }).click();
  await expect(page.getByRole("button", { name: "Select PDF" })).toBeVisible();

  const statement = await convertPdfToWord(page, {
    name: "statement.pdf",
    buffer: await makeWhitespaceStatementPdf(),
    expectedFileName: "statement.docx",
  });
  expect(statement.xml).toContain("<w:tbl>");
  expect(statement.xml).toContain('<w:tblLayout w:type="fixed"/>');
  expect(statement.xml).toContain("Monthly service");
  expect(statement.xml).toContain("Priority support");
  expect(occurrences(statement.xml, "Monthly service")).toBe(1);

  await page.getByRole("button", { name: "Convert another" }).click();
  await expect(page.getByRole("button", { name: "Select PDF" })).toBeVisible();

  const columns = await convertPdfToWord(page, {
    name: "two-column-report.pdf",
    buffer: await makeTwoColumnReportPdf(),
    expectedFileName: "two-column-report.docx",
  });
  expect(columns.xml).not.toContain("<w:tbl>");
  expect(columns.xml).toContain("w:framePr");
  expect(columns.xml).toContain("Left column introduces the first topic.");
  expect(columns.xml).toContain("Right column begins an independent topic.");
  expect(occurrences(columns.xml, "Left column introduces the first topic.")).toBe(1);
  expect(occurrences(columns.xml, "Right column begins an independent topic.")).toBe(1);

  expectCleanRuntime(runtime, browserName);
});

test("production Word to PDF reuses Office runtime, survives cancellation, and converts again on the public page", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Full threaded Office runtime certification runs in Chromium.");

  const runtime = watchConversionRuntime(page);
  await page.goto("/pdf/word-to-pdf", { waitUntil: "domcontentloaded" });
  await expect(page.getByText(/Processed locally in your browser/i)).toBeVisible();

  const professional = await makeProfessionalDocx();
  await convertWordToPdf(page, {
    name: "professional-production-certification.docx",
    buffer: professional,
    expectedFileName: "professional-production-certification.pdf",
  });

  const officeRequestsAfterFirstConversion = runtime.officeRuntimeRequests.length;
  expect(officeRequestsAfterFirstConversion).toBeGreaterThan(0);

  await page.getByRole("button", { name: "Convert another" }).click();
  await convertWordToPdf(page, {
    name: "runtime-reuse.docx",
    buffer: professional,
    expectedFileName: "runtime-reuse.pdf",
  });
  expect(runtime.officeRuntimeRequests.length).toBe(officeRequestsAfterFirstConversion);

  await page.getByRole("button", { name: "Convert another" }).click();
  const cancellationDocx = await makeCancellationDocx();
  await page.locator('input[type="file"]').setInputFiles({
    name: "cancellation-regression.docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: cancellationDocx,
  });
  await page.getByRole("button", { name: "Convert to PDF" }).click();

  const liveStatus = page.locator('p[aria-live="polite"]');
  await expect(liveStatus).toContainText(/Processing document|Generating PDF/, {
    timeout: 180_000,
  });
  await page
    .getByRole("button", { name: "Cancel Word to PDF conversion" })
    .click();
  await expect(
    page.locator('div[role="status"]').getByText("Conversion cancelled", { exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Replace file" }).click();
  await convertWordToPdf(page, {
    name: "post-cancellation-retry.docx",
    buffer: professional,
    expectedFileName: "post-cancellation-retry.pdf",
  });

  expectCleanRuntime(runtime, browserName, true);
});

test("production Word to PDF is capability-honest on non-Chromium browsers", async ({
  page,
  browserName,
}) => {
  test.skip(browserName === "chromium", "Chromium is covered by the full Office runtime certification.");

  const runtime = watchConversionRuntime(page);
  await page.goto("/pdf/word-to-pdf", { waitUntil: "domcontentloaded" });
  const source = await makeProfessionalDocx();
  await page.locator('input[type="file"]').setInputFiles({
    name: `capability-${browserName}.docx`,
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: source,
  });
  await page.getByRole("button", { name: "Convert to PDF" }).click();

  const ready = page.getByText("PDF ready");
  const alert = page.getByRole("alert");
  const outcome = await Promise.race([
    ready.waitFor({ state: "visible", timeout: 420_000 }).then(() => "success" as const),
    alert.waitFor({ state: "visible", timeout: 420_000 }).then(() => "error" as const),
  ]);

  if (outcome === "success") {
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download PDF" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(`capability-${browserName}.pdf`);
    const pdf = await PDFDocument.load(await downloadBytes(download));
    expect(pdf.getPageCount()).toBeGreaterThan(0);
  } else {
    await expect(alert).toContainText(/browser|local conversion engine|supported/i);
  }

  expectCleanRuntime(runtime, browserName, true);
});

test("production HTML to PDF preserves styled multi-page content and supports repeat generation", async ({
  page,
  browserName,
}, testInfo) => {
  const runtime = watchConversionRuntime(page);
  await page.goto("/pdf/html-to-pdf", { waitUntil: "domcontentloaded" });

  const repeatedParagraphs = Array.from(
    { length: 80 },
    (_, index) => `<p>Long content row ${index + 1}: Unicode café résumé 日本語 € ✓.</p>`,
  ).join("");
  const png =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP8z8Dwn4GBgYGJAQoAHxcCAk+Uzr4AAAAASUVORK5CYII=";
  const html = `<!doctype html>
<html>
<head>
<style>
  body { font-family: Arial, sans-serif; color: #222; line-height: 1.45; }
  h1 { font-size: 28px; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; }
  th, td { border: 1px solid #444; padding: 8px; text-align: left; }
  .hero { display: flex; gap: 16px; align-items: center; }
  .hero img { width: 72px; height: 72px; image-rendering: auto; }
  .page-break { break-before: page; page-break-before: always; }
</style>
</head>
<body>
  <div class="hero"><img src="${png}" alt="Synthetic fixture"><div><h1>Production HTML certification</h1><p>Styled browser-only export.</p></div></div>
  <table><thead><tr><th>Item</th><th>Qty</th><th>Amount</th></tr></thead><tbody><tr><td>Service</td><td>2</td><td>125.00</td></tr><tr><td>Support</td><td>1</td><td>80.00</td></tr></tbody></table>
  ${repeatedParagraphs}
  <div class="page-break"></div>
  <h2>Forced second section</h2>
  <p>Page break fidelity marker — special characters: © ® ™ ₹.</p>
</body>
</html>`;

  await replaceControlledText(page, "HTML and CSS source", html);
  await page.getByLabel("File name").fill("Production Rich HTML");
  await expect(page.getByLabel("HTML and CSS source")).toHaveValue(html);

  let downloadPromise = page.waitForEvent("download");
  const generate = page.locator("button.lumeo-primary-action").first();
  await expect(generate).toContainText("Generate PDF");
  await generate.click();
  let download = await downloadPromise;
  await expect(generate).toBeEnabled();
  await expect(generate).toContainText("Generate PDF");
  expect(download.suggestedFilename()).toBe("production-rich-html.pdf");
  let bytes = await downloadBytes(download);
  let pdf = await PDFDocument.load(bytes);
  expect(pdf.getPageCount()).toBeGreaterThanOrEqual(2);
  expect(bytes.length).toBeGreaterThan(5_000);

  const repeatHtml =
    "<style>body{font-family:serif}table{border-collapse:collapse}td{border:1px solid #333;padding:6px}</style><h1>Second conversion</h1><table><tr><td>Repeat</td><td>Works</td></tr></table><p>Unicode Ω λ 漢字.</p>";
  await replaceControlledText(page, "HTML and CSS source", repeatHtml);
  await page.getByLabel("File name").fill(`Repeat HTML ${testInfo.project.name}`);
  await expect(page.getByLabel("HTML and CSS source")).toHaveValue(repeatHtml);
  downloadPromise = page.waitForEvent("download");
  await generate.click();
  download = await downloadPromise;
  await expect(generate).toBeEnabled();
  await expect(generate).toContainText("Generate PDF");
  expect(download.suggestedFilename()).toBe(
    `repeat-html-${testInfo.project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.pdf`,
  );
  bytes = await downloadBytes(download);
  pdf = await PDFDocument.load(bytes);
  expect(pdf.getPageCount()).toBeGreaterThan(0);
  expect(bytes.length).toBeGreaterThan(1_000);

  expectCleanRuntime(runtime, browserName);
});
