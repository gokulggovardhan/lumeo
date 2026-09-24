import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("HTML to PDF flattens the sanitized Shadow DOM surface into a cloneable light-DOM capture mirror", async () => {
  const source = await readFile("components/pdf/HtmlToPdfTool.tsx", "utf8");

  assert.match(source, /function createCaptureMirror\(surface: ExportSurface\)/);
  assert.match(source, /copyComputedStyleDeclaration\(/);
  assert.match(source, /data-lumeo-capture-node/);
  assert.match(source, /html2canvas\(mirror\.container,/);
  assert.match(source, /\.from\(canvas, "canvas"\)\.outputPdf\("blob"\)/);
  assert.doesNotMatch(source, /html2canvas\(surface\.container,/);
  assert.doesNotMatch(source, /\.from\(surface\.container\)\.outputPdf\("blob"\)/);
  assert.match(source, /applyLivePageBreaks\(surface\.container, pageSliceHeightPx\)/);
  assert.match(source, /mirror\.host\.remove\(\)/);
});
