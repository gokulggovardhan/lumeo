import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("native PDF matching cannot publish an early fallback before PDF.js detection has finished", () => {
  const source = readFileSync("components/pdf/EditPdfTool.tsx", "utf8");
  const start = source.indexOf("// Phase 9.1: matches each run the effect above detected");
  const end = source.indexOf("// Keyed on pagePointSize, NOT pageDisplaySize", start);
  assert.ok(start >= 0 && end > start, "Expected active native match effect and ownership comment");
  const effect = source.slice(start, end);

  assert.match(
    effect,
    /!\s*textDetectionCurrent\s*\|\|/,
    "A pending PDF.js extraction must not authorize native fallback matching",
  );
  assert.match(
    effect,
    /\[\s*pdf,\s*pdfLibDoc,\s*editEngine,\s*pageIndex,\s*detectedTextRuns,\s*textDetectionCurrent,/,
    "Native matching must rerun when the exact PDF.js detection revision becomes current",
  );
  assert.match(
    effect,
    /if\s*\(runs\.length\s*===\s*0\)\s*\{/,
    "Preserve native-only fallback when PDF.js has actually finished with zero runs",
  );
  assert.match(
    source,
    /textDetectionRevision\?\.bytes\s*===\s*pdf\?\.bytes\s*&&\s*textDetectionRevision\?\.pageIndex\s*===\s*pageIndex/,
    "The readiness gate must be tied to exact source bytes and page",
  );
});
