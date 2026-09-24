import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("HTML to PDF captures bounded page canvases and assembles them locally", async () => {
  const source = await readFile("components/pdf/HtmlToPdfTool.tsx", "utf8");

  assert.match(source, /function createCaptureMirror\(/);
  assert.match(source, /copyComputedStyleDeclaration\(/);
  assert.match(source, /data-lumeo-capture-node/);
  assert.match(source, /overflow = "hidden"/);
  assert.match(source, /for \(let pageIndex = 0; pageIndex < pageCount; pageIndex \+= 1\)/);
  assert.match(source, /html2canvas\(mirror\.viewport,/);
  assert.match(source, /mirror\.conveyor\.style\.transform/);
  assert.match(source, /PDFDocument/);
  assert.match(source, /pdf\.embedJpg\(jpegBytes\)/);
  assert.match(source, /pdf\.addPage\(\[pageWidthPt, pageHeightPt\]\)/);
  assert.doesNotMatch(source, /html2canvas\(mirror\.container,/);
  assert.doesNotMatch(source, /\.from\(canvas, "canvas"\)\.outputPdf\("blob"\)/);
  assert.doesNotMatch(source, /\.from\(surface\.container\)\.outputPdf\("blob"\)/);
  assert.match(source, /applyLivePageBreaks\(surface\.container, pageSliceHeightPx\)/);
  assert.match(source, /mirror\.host\.remove\(\)/);
});
