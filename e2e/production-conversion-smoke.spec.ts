import { expect, test, type Page, type Request } from "@playwright/test";
import type { Download } from "@playwright/test";
import JSZip from "jszip";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { collectPageTextOperators } from "../lib/pdf/edit/formXObjects.ts";
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
import { TEXT_ONLY_PDF, writeFixtures } from "./fixtures";
import { waitForStageReady } from "./helpers";

type FailedRequest = {
  method: string;
  url: string;
  errorText: string;
};

type RuntimeWatch = {
  pageErrors: string[];
  failedRequests: FailedRequest[];
  successfulResponseUrls: Set<string>;
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
  const failedRequests: FailedRequest[] = [];
  const successfulResponseUrls = new Set<string>();
  const retiredTransportRequests: string[] = [];

  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("response", (response) => {
    if (response.ok()) successfulResponseUrls.add(response.url());
  });
  page.on("requestfailed", (request) => {
    if (isExpectedOfficePreflightAbort(request)) return;
    failedRequests.push({
      method: request.method(),
      url: request.url(),
      errorText: request.failure()?.errorText ?? "failed",
    });
  });
  page.on("request", (request) => {
    const url = new URL(request.url());
    const pathname = url.pathname;
    const retiredApi =
      pathname === "/api/tools/word-to-pdf" ||
      pathname === "/api/tools/pdf-to-word" ||
      pathname === "/api/tools/word-to-pdf/cleanup";
    const retiredStorageUpload =
      pathname.startsWith("/storage/v1/") &&
      request.method() !== "GET";
    const retiredContainer =
      url.hostname === "lumeo-word-to-pdf-converter.onrender.com";

    if (retiredApi || retiredStorageUpload || retiredContainer) {
      retiredTransportRequests.push(`${request.method()} ${request.url()}`);
    }
  });

  return {
    pageErrors,
    failedRequests,
    successfulResponseUrls,
    retiredTransportRequests,
  };
}

function isRecoveredPdfWorkerBootstrapFailure(
  failure: FailedRequest,
  successfulResponseUrls: Set<string>,
): boolean {
  if (
    failure.method !== "GET" ||
    failure.errorText !== "net::ERR_BLOCKED_BY_RESPONSE"
  ) {
    return false;
  }
  const url = new URL(failure.url);
  const isBundledPdfWorker =
    url.origin === "https://lumeo.in" &&
    /^\/_next\/static\/media\/pdf\.worker\.[A-Za-z0-9_-]+\.mjs$/.test(
      url.pathname,
    );
  return isBundledPdfWorker && successfulResponseUrls.has(failure.url);
}

function isExpectedAnalyticsNavigationAbort(failure: FailedRequest): boolean {
  if (failure.method !== "POST") return false;

  const url = new URL(failure.url);
  if (url.pathname !== "/rest/v1/rpc/record_public_analytics_event") return false;

  return /(?:Load request cancelled|NS_BINDING_ABORTED|net::ERR_ABORTED)/i.test(
    failure.errorText,
  );
}

function expectCleanRuntime(watch: RuntimeWatch) {
  expect(watch.pageErrors).toEqual([]);
  const unrecoveredFailures = watch.failedRequests.filter(
    (failure) =>
      !isRecoveredPdfWorkerBootstrapFailure(
        failure,
        watch.successfulResponseUrls,
      ) && !isExpectedAnalyticsNavigationAbort(failure),
  );
  expect(
    unrecoveredFailures.map(
      (failure) =>
        `${failure.method} ${failure.url}: ${failure.errorText}`,
    ),
  ).toEqual([]);
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

test.beforeAll(async () => {
  await writeFixtures();
});

test("production Edit PDF certifies native colour, formatting, history and export", async ({
  page,
}) => {
  const runtime = watchConversionRuntime(page);
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  const selectEmployeeAndOpenFormat = async () => {
    await waitForStageReady(page);
    const run = page
      .locator('div[role="button"][aria-label^="Editable text: "][aria-label*="Employee record"]')
      .first();
    await expect(run).toBeVisible({ timeout: 90_000 });
    await run.click();
    await page.getByRole("button", { name: "Format" }).click();
    const panel = page.locator("[data-native-text-formatting]");
    await expect(panel).toBeVisible();
    return {
      colour: page.getByLabel("Native fill colour"),
      scale: page.getByRole("spinbutton", { name: "Native horizontal scale" }),
      editor: page.getByRole("textbox", { name: "Edit text" }),
    };
  };

  await page.goto("/pdf/edit", { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-edit-client-ready='true']")).toBeAttached({ timeout: 30_000 });
  await page.locator('input[type="file"]').first().setInputFiles(TEXT_ONLY_PDF);

  const workspace = page.locator("[data-edit-operation-count]");
  await expect(workspace).toHaveAttribute("data-edit-operation-count", "0");

  const initial = await selectEmployeeAndOpenFormat();
  await expect(initial.colour).toHaveValue("#000000");
  await expect(initial.scale).toHaveValue("100");
  await expect(workspace).toHaveAttribute("data-edit-operation-count", "0");

  await initial.colour.evaluate((node) => {
    const input = node as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (!setter) throw new Error("Browser did not expose the native input value setter.");
    setter.call(input, "#3366cc");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await initial.scale.fill("95");
  await expect(initial.editor).toHaveAttribute("data-native-fill-color", "#3366cc");
  await expect(workspace).toHaveAttribute("data-edit-operation-count", "0");

  await page.getByRole("button", { name: "Apply edit" }).click();
  await expect(workspace).toHaveAttribute("data-edit-operation-count", "1");

  const applied = await selectEmployeeAndOpenFormat();
  await expect(applied.colour).toHaveValue("#3366cc");
  await expect(applied.scale).toHaveValue("95");

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(workspace).toHaveAttribute("data-edit-operation-count", "0");
  const undone = await selectEmployeeAndOpenFormat();
  await expect(undone.colour).toHaveValue("#000000");
  await expect(undone.scale).toHaveValue("100");

  await page.getByRole("button", { name: "Redo" }).click();
  await expect(workspace).toHaveAttribute("data-edit-operation-count", "1");
  const redone = await selectEmployeeAndOpenFormat();
  await expect(redone.colour).toHaveValue("#3366cc");
  await expect(redone.scale).toHaveValue("95");

  await page.getByRole("button", { name: "Export PDF" }).click();
  const downloadButton = page.getByRole("button", { name: "Download edited PDF" });
  await expect(downloadButton).toBeVisible({ timeout: 90_000 });
  const downloadPromise = page.waitForEvent("download");
  await downloadButton.click();
  const bytes = await downloadBytes(await downloadPromise);

  expect(bytes.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  const exported = await PDFDocument.load(bytes);
  expect(exported.getPageCount()).toBe(1);
  const operators = collectPageTextOperators(exported, 0);
  expect(operators.length).toBeGreaterThanOrEqual(2);
  expect(operators[0].operator.fillColor?.colorSpace).toBe("DeviceRGB");
  expect(operators[0].operator.fillColor?.cssHex).toBe("#3366cc");
  expect(operators[0].operator.horizontalScalingPct).toBe(95);
  expect(operators[1].operator.fillColor?.cssHex).toBe("#000000");

  await page.goto("/pdf/edit", { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-edit-client-ready='true']")).toBeAttached({ timeout: 30_000 });
  await page.locator('input[type="file"]').first().setInputFiles({
    name: "native-colour-production-reopened.pdf",
    mimeType: "application/pdf",
    buffer: bytes,
  });
  const reopened = await selectEmployeeAndOpenFormat();
  await expect(reopened.colour).toHaveValue("#3366cc");
  await expect(reopened.scale).toHaveValue("95");

  expect(consoleErrors).toEqual([]);
  expectCleanRuntime(runtime);
});

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

test("production Word to PDF preserves professional formatting against native reference", async ({
  page,
  browserName,
}, testInfo) => {
  test.skip(
    browserName !== "chromium",
    "Threaded Office professional fidelity production gate runs in Chromium.",
  );

  const runtime = watchConversionRuntime(page);
  await page.goto("/pdf/word-to-pdf");
  await expect(page.getByText(/Processed locally in your browser/i)).toBeVisible();

  const source = await makeProfessionalDocx();
  await page.locator('input[type="file"]').setInputFiles({
    name: "professional-production-fidelity.docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: source,
  });

  await page.getByRole("button", { name: "Convert to PDF" }).click();
  await expect(page.getByText("PDF ready")).toBeVisible({
    timeout: 420_000,
  });

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF" }).click();
  const bytes = await downloadBytes(await downloadPromise);
  const generated = await PDFDocument.load(bytes);
  expect(generated.getPageCount()).toBe(2);

  const outputDirectory = testInfo.outputPath("professional-word-production");
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
    maxMae: 18,
    maxChanged: 0.20,
  });

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

test("production PDF to Word preserves fixed-layout invoice and AMC fidelity", async ({
  page,
  browserName,
}, testInfo) => {
  const runtime = watchConversionRuntime(page);
  await page.goto("/pdf/pdf-to-word");
  await expect(
    page.getByText(/Processed locally in your browser/i).first(),
  ).toBeVisible();

  const source = await makeFixedLayoutInvoicePdf();
  await page.locator('input[type="file"]').setInputFiles({
    name: "fixed-layout-production-fidelity.pdf",
    mimeType: "application/pdf",
    buffer: source,
  });

  await page.getByRole("button", { name: "Convert to Word" }).click();
  await expect(page.getByText("Word document ready")).toBeVisible({
    timeout: 180_000,
  });

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download Word document" }).click();
  const bytes = await downloadBytes(await downloadPromise);
  const docx = await JSZip.loadAsync(bytes);
  const documentXml = await docx.file("word/document.xml")?.async("string");
  expect(documentXml).toBeTruthy();
  const xml = documentXml ?? "";

  for (const expected of [
    "ITEM-A101",
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
  ]) {
    expect(xml).toContain(expected);
  }

  expect(xml).not.toContain(
    "Service Water wash Co check chain Pick up &amp; drop",
  );
  expect(xml).not.toContain(
    "ITEM-A101 Cleaning fluid 50 ml 1.00 83.90",
  );
  expect(frameXForText(xml, "ITEM-A101")).toBeLessThan(
    frameXForText(xml, "Cleaning fluid 50 ml"),
  );
  expect(frameXForText(xml, "Cleaning fluid 50 ml")).toBeLessThan(
    frameXForText(xml, "1.00"),
  );
  expect(frameXForText(xml, "Amc No.")).toBeLessThan(
    frameXForText(xml, "Valid Till"),
  );
  expect(frameXForText(xml, "Valid Till")).toBeLessThan(
    frameXForText(xml, "Service"),
  );
  expect(frameXForText(xml, "Service")).toBeLessThan(
    frameXForText(xml, "Water wash"),
  );
  expect(frameXForText(xml, "Water wash")).toBeLessThan(
    frameXForText(xml, "Co check"),
  );

  expect(docx.file("word/media/page-1.jpg")).toBeTruthy();
  expect(docx.file("word/media/page-2.jpg")).toBeTruthy();
  expect(xml).not.toContain("<w:shd ");

  if (browserName === "chromium") {
    const outputDirectory = testInfo.outputPath("fixed-layout-production");
    const sourcePdf = await writePdfFixture(
      source,
      outputDirectory,
      "fixed-layout-source",
    );
    const reconstructedPdf = await renderDocxWithLibreOffice(
      bytes,
      outputDirectory,
      "fixed-layout-current",
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
