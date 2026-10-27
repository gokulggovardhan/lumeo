import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("components/pdf/HtmlToPdfTool.tsx", "utf8");

test("HTML-to-PDF invalidates stale fallback and Workspace continuation on every edit", () => {
  assert.match(
    source,
    /function invalidateGeneratedOutput\(\)\s*\{\s*inputRevisionRef\.current \+= 1;\s*setGeneratedPdf\(null\);\s*setContinuation\(null\);/,
  );
  // Definition plus Reset, template selection, source, filename, page size,
  // orientation and margin. No edit path may leave the old download active.
  assert.equal(
    (source.match(/invalidateGeneratedOutput\(\)/g) ?? []).length,
    8,
    "All seven input-change paths must invalidate the previous generated PDF.",
  );
});

test("an async conversion cannot publish or download a superseded input revision", () => {
  assert.match(source, /const generationRevision = inputRevisionRef\.current;/);
  assert.match(
    source,
    /const \{ blob, bytes, pageCount \} = generated;\s*if \(generationRevision !== inputRevisionRef\.current\) \{[\s\S]*?setError\("[^"]*Generate again[^"]*"\);\s*return;\s*\}/,
  );
  assert.match(source, /setGeneratedPdf\(\{ blob, fileName: outputFileName \}\);/);
  assert.match(source, /window\.setTimeout\(\(\) => URL\.revokeObjectURL\(blobUrl\), 60_000\);/);
  assert.match(source, /Download generated PDF/);
});
