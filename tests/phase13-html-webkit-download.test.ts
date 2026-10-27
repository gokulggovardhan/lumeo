import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("HTML-to-PDF Generate waits for actual hydrated handler on every browser", async () => {
  const source = await readFile("components/pdf/HtmlToPdfTool.tsx", "utf8");
  assert.match(source, /data-generate-client-ready=\{clientReady \? "true" : "false"\}/);
  assert.match(source, /disabled=\{!clientReady \|\| isGenerating \|\| Boolean\(validationError\)\}/);
  assert.match(source, /if \(!clientReady \|\| isGenerating\) return/);
});

test("mobile WebKit retains a real explicit Blob-backed download after local generation", async () => {
  const source = await readFile("components/pdf/HtmlToPdfTool.tsx", "utf8");
  assert.match(source, /setGeneratedPdf\(\{ blob, fileName: outputFileName \}\)/);
  assert.match(source, /Download generated PDF/);
  assert.match(source, /URL\.createObjectURL\(generatedPdf\.blob\)/);
  assert.match(source, /window\.setTimeout\(\(\) => URL\.revokeObjectURL\(url\), 60_000\)/);
  assert.doesNotMatch(source, /localStorage\.setItem\([^)]*generatedPdf/);
});

test("production WebKit browser gate requires generated download and real PDF validation", async () => {
  const source = await readFile("e2e/production-conversion-certification.spec.ts", "utf8");
  assert.match(source, /testInfo\.project\.name === "webkit-mobile-production-conversion"/);
  assert.match(source, /fallback\.click\(\)/);
  assert.match(source, /await PDFDocument\.load\(bytes\)/);
  assert.match(source, /expect\(pdf\.getPageCount\(\)\)\.toBeGreaterThanOrEqual\(2\)/);
});
