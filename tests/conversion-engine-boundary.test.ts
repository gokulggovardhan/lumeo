import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import test from "node:test";

const TOOL_FILES = [
  "components/pdf/WordToPdfTool.tsx",
  "components/pdf/PdfToWordTool.tsx",
] as const;

const RETIRED_SERVER_PATHS = [
  "app/api/tools/word-to-pdf/route.ts",
  "app/api/tools/pdf-to-word/route.ts",
  "app/api/tools/word-to-pdf/cleanup/route.ts",
  "lib/conversion/legacy/LegacyServerWordToPdfEngine.ts",
  "lib/conversion/legacy/LegacyServerPdfToWordEngine.ts",
  "lib/converters/word-to-pdf.ts",
  "lib/converters/pdf-to-word.ts",
  "services/word-to-pdf-converter/server.js",
] as const;

test("Word/PDF converter UIs use browser engines without server transport", async () => {
  const [word, pdf] = await Promise.all(TOOL_FILES.map((path) => readFile(path, "utf8")));

  assert.match(word, /BrowserWordToPdfEngine/);
  assert.match(word, /new BrowserWordToPdfEngine\(\)/);
  assert.doesNotMatch(word, /LegacyServerWordToPdfEngine/);
  assert.doesNotMatch(word, /\/api\/tools\/word-to-pdf/);

  assert.match(pdf, /BrowserPdfToWordEngine/);
  assert.match(pdf, /new BrowserPdfToWordEngine\(\)/);
  assert.doesNotMatch(pdf, /LegacyServerPdfToWordEngine/);
  assert.doesNotMatch(pdf, /\/api\/tools\/pdf-to-word/);

  for (const source of [word, pdf]) {
    assert.match(source, /ConversionCoordinator/);
    assert.match(source, /conversionCoordinator\.convert\(/);
    assert.doesNotMatch(source, /uploadWordFileForConversion|uploadPdfFileForConversion/);
    assert.doesNotMatch(source, /removeWordUpload|removePdfUpload/);
  }
});

test("retired Word/PDF server backend paths stay absent", () => {
  for (const path of RETIRED_SERVER_PATHS) {
    assert.equal(existsSync(path), false, "Retired server path returned: " + path);
  }
});

test("active conversion and health code do not depend on retired converter configuration", async () => {
  const sources = await Promise.all([
    readFile("components/pdf/WordToPdfTool.tsx", "utf8"),
    readFile("components/pdf/PdfToWordTool.tsx", "utf8"),
    readFile("lib/conversion/browser/BrowserWordToPdfEngine.ts", "utf8"),
    readFile("lib/conversion/browser/BrowserPdfToWordEngine.ts", "utf8"),
    readFile("lib/admin/health.ts", "utf8"),
    readFile("worker/index.ts", "utf8"),
  ]);

  const active = sources.join("\n");
  assert.doesNotMatch(active, /WORD_TO_PDF_CONVERTER_URL/);
  assert.doesNotMatch(active, /WORD_TO_PDF_CONVERTER_SECRET/);
  assert.doesNotMatch(active, /lumeo-word-to-pdf-converter/);
  assert.doesNotMatch(active, /\/api\/tools\/(word-to-pdf|pdf-to-word)/);
});
