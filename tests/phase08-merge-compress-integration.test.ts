import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { PDFDocument, StandardFonts } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { mergeNativeDocuments } from "../lib/pdf/merge/nativeMerge.ts";
import { runNativeCompression } from "../lib/pdf/optimization/compressionPipeline.ts";
import { validatePdfOutput } from "../lib/pdf/optimization/validateOutput.ts";

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function makeSource(label: string, pageCount: number, entropy = false): Promise<ArrayBuffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let index = 0; index < pageCount; index++) {
    const page = pdf.addPage([595, 842]);
    page.drawText(label + " PAGE " + (index + 1), { x: 24, y: 810, size: 15, font });
    if (entropy) {
      // Deterministic high-entropy, text-only PDF; no network or image codec.
      // The corpus is intentionally too large for the 20 KiB target.
      for (let line = 0; line < 52; line++) {
        const value = createHash("sha256").update(label + ":" + index + ":" + line).digest("hex");
        page.drawText(value, { x: 28, y: 780 - line * 14, size: 7, font });
      }
    }
  }
  return asArrayBuffer(await pdf.save({ useObjectStreams: false }));
}

async function textByPage(bytes: ArrayBuffer): Promise<string[]> {
  const task = pdfjsLib.getDocument({ data: new Uint8Array(bytes.slice(0)), useSystemFonts: true });
  try {
    const document = await task.promise;
    const pages: string[] = [];
    for (let index = 1; index <= document.numPages; index++) {
      const text = await (await document.getPage(index)).getTextContent();
      pages.push(text.items.map(item => "str" in item ? item.str : "").join(" "));
    }
    return pages;
  } finally {
    await task.destroy();
  }
}

test("Phase 08 native Merge to recommended/maximum Compress keeps every source page and selectable text", async () => {
  const first = await makeSource("MERGE ALPHA", 2);
  const second = await makeSource("MERGE BETA", 1);
  const firstSnapshot = new Uint8Array(first.slice(0));
  const secondSnapshot = new Uint8Array(second.slice(0));
  const merged = await mergeNativeDocuments([
    { name: "alpha.pdf", bytes: first, rotation: 90 },
    { name: "beta.pdf", bytes: second, rotation: 0 },
  ], { format: "original", marginPoints: 0 });
  const baseline = await textByPage(merged.bytes);
  assert.equal(merged.pageCount, 3);
  assert.ok(baseline[0].includes("MERGE ALPHA PAGE 1"));
  assert.ok(baseline[1].includes("MERGE ALPHA PAGE 2"));
  assert.ok(baseline[2].includes("MERGE BETA PAGE 1"));
  const mergedSnapshot = new Uint8Array(merged.bytes.slice(0));

  for (const goal of ["recommended", "maximum"] as const) {
    const stages: string[] = [];
    const output = await runNativeCompression(merged.bytes, goal, undefined,
      (_value, stage) => stages.push(stage));
    const checked = await validatePdfOutput(output.bytes, merged.pageCount);
    assert.equal(checked.pageCount, 3);
    assert.equal(output.originalBytes, merged.bytes.byteLength);
    assert.equal(output.finalBytes, output.bytes.byteLength);
    assert.ok(output.finalBytes <= output.originalBytes, "optional compression must not enlarge the merged PDF");
    assert.equal(output.achieved, null, "non-target modes must not claim target achievement");
    assert.deepEqual(await textByPage(output.bytes), baseline, "native text and source page order must survive");
    assert.ok(stages.includes("Verified local PDF output") || stages.includes("Original preserved for document safety"));
    assert.deepEqual(new Uint8Array(merged.bytes), mergedSnapshot, "shared compressor cannot mutate merged input");
  }
  assert.deepEqual(new Uint8Array(first), firstSnapshot, "original alpha input must remain immutable");
  assert.deepEqual(new Uint8Array(second), secondSnapshot, "original beta input must remain immutable");
});

test("Phase 08 reachable target reports achieved only against actual merged output bytes", async () => {
  const first = await makeSource("TARGET FIRST", 1);
  const second = await makeSource("TARGET SECOND", 1);
  const merged = await mergeNativeDocuments([
    { name: "first.pdf", bytes: first, rotation: 0 },
    { name: "second.pdf", bytes: second, rotation: 0 },
  ], { format: "original", marginPoints: 0 });
  const target = Math.max(20 * 1024, merged.bytes.byteLength);
  const result = await runNativeCompression(merged.bytes, "target", target);
  assert.equal(result.achieved, true);
  assert.equal(result.targetOutcome, "achieved");
  assert.ok(result.finalBytes <= target, "output must actually meet the announced target");
  await validatePdfOutput(result.bytes, 2);
  const text = await textByPage(result.bytes);
  assert.ok(text[0].includes("TARGET FIRST"));
  assert.ok(text[1].includes("TARGET SECOND"));
});

test("Phase 08 impossible text-only target never reports success or loses pages", async () => {
  const first = await makeSource("UNREACHABLE", 28, true);
  const second = await makeSource("TRAILING", 1);
  const merged = await mergeNativeDocuments([
    { name: "unreachable.pdf", bytes: first, rotation: 0 },
    { name: "trailing.pdf", bytes: second, rotation: 0 },
  ], { format: "original", marginPoints: 0 });
  const target = 20 * 1024;
  assert.ok(merged.bytes.byteLength > target, "fixture must genuinely exceed the chosen target");
  const result = await runNativeCompression(merged.bytes, "target", target);
  assert.ok(result.finalBytes > target, "fixture should remain too large after safe lossless optimization");
  assert.equal(result.achieved, false);
  assert.notEqual(result.targetOutcome, "achieved", "must not misrepresent an unmet target");
  assert.ok(result.finalBytes <= merged.bytes.byteLength, "attempt must not make output larger");
  await validatePdfOutput(result.bytes, 29);
  const text = await textByPage(result.bytes);
  assert.ok(text[0].includes("UNREACHABLE PAGE 1"));
  assert.ok(text[28].includes("TRAILING PAGE 1"));
});

test("Phase 08 target input is rejected before PDF processing even for protected documents", async () => {
  const document = await PDFDocument.create();
  const page = document.addPage([350, 480]);
  document.getForm().createTextField("retained").addToPage(page);
  const bytes = asArrayBuffer(await document.save());
  const snapshot = new Uint8Array(bytes.slice(0));
  const invalid: Array<number | undefined> = [
    undefined, NaN, Infinity, -1, 0, 1.5, 20 * 1024 - 1, 128 * 1024 * 1024 + 1,
  ];
  for (const target of invalid) {
    let visitedPdf = false;
    await assert.rejects(
      runNativeCompression(bytes, "target", target, () => { visitedPdf = true; }),
      /target size|valid target|target no larger/i,
      "the worker must reject invalid target inputs before protected-document early returns",
    );
    assert.equal(visitedPdf, false, "invalid target must fail before reading the PDF");
    assert.deepEqual(new Uint8Array(bytes), snapshot);
  }

  const kept = await runNativeCompression(bytes, "target", 20 * 1024);
  assert.ok(kept.protectedReason, "the protected AcroForm fixture must be preserved");
  assert.deepEqual(new Uint8Array(kept.bytes), snapshot);
  assert.equal(kept.achieved, true, "untouched protected document already fits the target");
  assert.equal(kept.targetOutcome, "achieved", "target result and outcome must agree");
});
