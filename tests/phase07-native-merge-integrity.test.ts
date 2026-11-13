import assert from "node:assert/strict";
import test from "node:test";
import { degrees, PDFDocument, StandardFonts } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { mergeNativeDocuments } from "../lib/pdf/merge/nativeMerge.ts";

function bufferOf(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function fixture(label: string, rotations: number[]): Promise<ArrayBuffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let index = 0; index < rotations.length; index++) {
    const page = pdf.addPage([400 + index * 20, 600]);
    page.drawText(`${label} SOURCE PAGE ${index + 1}`, { x: 35, y: 500, size: 16, font });
    page.setRotation(degrees(rotations[index]));
    if (index === 0) page.setCropBox(12, 18, 320, 500);
  }
  return bufferOf(await pdf.save());
}

test("Phase 07 original merge retains source order, native text, crop boxes and composed rotations", async () => {
  const first = await fixture("ALPHA", [90, 0]);
  const second = await fixture("BETA", [180]);
  const firstSize = first.byteLength;
  const secondSize = second.byteLength;
  const progress: number[] = [];
  const output = await mergeNativeDocuments([
    { name: "first.pdf", bytes: first, rotation: 90 },
    { name: "second.pdf", bytes: second, rotation: 270 },
  ], { format: "original", marginPoints: 0, onProgress: (completed) => progress.push(completed) });

  assert.deepEqual(progress, [1, 2, 3]);
  assert.equal(output.pageCount, 3);
  assert.equal(first.byteLength, firstSize, "input buffers must remain intact");
  assert.equal(second.byteLength, secondSize, "input buffers must remain intact");
  const parsed = await PDFDocument.load(output.bytes);
  assert.equal(parsed.getPageCount(), 3);
  assert.deepEqual(parsed.getPages().map(page => page.getRotation().angle), [180, 90, 90]);
  assert.deepEqual(
    [parsed.getPage(0).getCropBox(), parsed.getPage(2).getCropBox()].map(box => [box.x, box.y, box.width, box.height]),
    [[12, 18, 320, 500], [12, 18, 320, 500]],
  );

  const task = pdfjsLib.getDocument({ data: new Uint8Array(output.bytes.slice(0)), useSystemFonts: true });
  const document = await task.promise;
  try {
    assert.equal(document.numPages, 3);
    const expected = ["ALPHA SOURCE PAGE 1", "ALPHA SOURCE PAGE 2", "BETA SOURCE PAGE 1"];
    for (let index = 0; index < expected.length; index++) {
      const page = await document.getPage(index + 1);
      const text = await page.getTextContent();
      assert.ok(text.items.some(item => "str" in item && item.str.includes(expected[index])),
        `merged page ${index + 1} must preserve its source's selectable text`);
    }
  } finally {
    await task.destroy();
  }
});

test("Phase 07 merge cancellation rejects without producing a partial output", async () => {
  const bytes = await fixture("CANCEL", [0]);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    mergeNativeDocuments([
      { name: "a.pdf", bytes, rotation: 0 },
      { name: "b.pdf", bytes, rotation: 0 },
    ], { format: "original", marginPoints: 0, signal: controller.signal }),
    (error: unknown) => error instanceof DOMException && error.name === "AbortError",
  );
});
