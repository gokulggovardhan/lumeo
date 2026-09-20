import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const TOOL_FILES = [
  "components/pdf/WordToPdfTool.tsx",
  "components/pdf/PdfToWordTool.tsx",
] as const;

test("Word/PDF converter UIs depend on ConversionCoordinator, not transport details", async () => {
  for (const path of TOOL_FILES) {
    const source = await readFile(path, "utf8");

    assert.match(source, /ConversionCoordinator/);
    assert.match(source, /conversionCoordinator\.convert\(/);

    assert.doesNotMatch(source, /uploadWordFileForConversion/);
    assert.doesNotMatch(source, /uploadPdfFileForConversion/);
    assert.doesNotMatch(source, /removeWordUpload/);
    assert.doesNotMatch(source, /removePdfUpload/);
    assert.doesNotMatch(source, /fetch\("\/api\/tools\/(?:word-to-pdf|pdf-to-word)"/);
  }
});

test("legacy server transport is isolated behind ConversionEngine adapters", async () => {
  const [wordAdapter, pdfAdapter] = await Promise.all([
    readFile("lib/conversion/legacy/LegacyServerWordToPdfEngine.ts", "utf8"),
    readFile("lib/conversion/legacy/LegacyServerPdfToWordEngine.ts", "utf8"),
  ]);

  assert.match(wordAdapter, /implements ConversionEngine/);
  assert.match(pdfAdapter, /implements ConversionEngine/);
  assert.match(wordAdapter, /fetch\("\/api\/tools\/word-to-pdf"/);
  assert.match(pdfAdapter, /fetch\("\/api\/tools\/pdf-to-word"/);
});
