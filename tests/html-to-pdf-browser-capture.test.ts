import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("HTML to PDF captures the sanitized live surface before html2pdf page slicing", async () => {
  const source = await readFile("components/pdf/HtmlToPdfTool.tsx", "utf8");

  assert.match(source, /html2canvas\(surface\.container,/);
  assert.match(source, /\.from\(canvas, "canvas"\)\.outputPdf\("blob"\)/);
  assert.doesNotMatch(source, /\.from\(surface\.container\)\.outputPdf\("blob"\)/);
  assert.match(source, /applyLivePageBreaks\(surface\.container, pageSliceHeightPx\)/);
});
