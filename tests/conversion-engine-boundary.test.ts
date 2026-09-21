import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const TOOL_ENGINES = [
  ["components/pdf/WordToPdfTool.tsx", "BrowserWordToPdfEngine"],
  ["components/pdf/PdfToWordTool.tsx", "BrowserPdfToWordEngine"],
] as const;

test("Word/PDF converter UIs use browser engines and contain no retired transport", async () => {
  for (const [path, engine] of TOOL_ENGINES) {
    const source = await readFile(path, "utf8");

    assert.match(source, /ConversionCoordinator/);
    assert.match(source, /conversionCoordinator\.convert\(/);
    assert.ok(source.includes(engine));

    assert.doesNotMatch(source, /uploadWordFileForConversion/);
    assert.doesNotMatch(source, /uploadPdfFileForConversion/);
    assert.doesNotMatch(source, /removeWordUpload/);
    assert.doesNotMatch(source, /removePdfUpload/);
    assert.doesNotMatch(source, /fetch\("\/api\/tools\/(?:word-to-pdf|pdf-to-word)"/);
  }
});
