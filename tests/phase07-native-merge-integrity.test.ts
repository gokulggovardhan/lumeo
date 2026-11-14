import assert from "node:assert/strict";
import test from "node:test";
import { degrees, PDFDict, PDFDocument, PDFName, PDFRawStream, StandardFonts } from "pdf-lib";
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
  const firstSnapshot = new Uint8Array(first.slice(0));
  const secondSnapshot = new Uint8Array(second.slice(0));
  const progress: number[] = [];
  const output = await mergeNativeDocuments([
    { name: "first.pdf", bytes: first, rotation: 90 },
    { name: "second.pdf", bytes: second, rotation: 270 },
  ], { format: "original", marginPoints: 0, onProgress: (completed) => progress.push(completed) });

  assert.deepEqual(progress, [1, 2, 3]);
  assert.equal(output.pageCount, 3);
  assert.deepEqual(new Uint8Array(first), firstSnapshot, "first source bytes must remain unchanged");
  assert.deepEqual(new Uint8Array(second), secondSnapshot, "second source bytes must remain unchanged");
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


test("Phase 07 cancellation during page progress never returns a partial merged document", async () => {
  const first = await fixture("PROGRESS", [0, 90]);
  const second = await fixture("SECOND", [180]);
  const controller = new AbortController();
  const completed: number[] = [];
  await assert.rejects(
    mergeNativeDocuments([
      { name: "progress.pdf", bytes: first, rotation: 0 },
      { name: "second.pdf", bytes: second, rotation: 0 },
    ], {
      format: "original",
      marginPoints: 0,
      signal: controller.signal,
      onProgress: (pages) => {
        completed.push(pages);
        if (pages === 1) controller.abort();
      },
    }),
    (error: unknown) => error instanceof DOMException && error.name === "AbortError",
  );
  assert.deepEqual(completed, [1], "no further page progress after cancellation");
});


test("Phase 07 original merge retains embedded image resources alongside selectable text", async () => {
  const sourcePdf = await PDFDocument.create();
  const font = await sourcePdf.embedFont(StandardFonts.Helvetica);
  const image = await sourcePdf.embedPng(Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1sAAAAASUVORK5CYII=", "base64"));
  const page = sourcePdf.addPage([300, 300]);
  page.drawImage(image, { x: 30, y: 30, width: 80, height: 80 });
  page.drawText("IMAGE RESOURCE", { x: 30, y: 150, font, size: 16 });
  const source = bufferOf(await sourcePdf.save());
  const snapshot = new Uint8Array(source.slice(0));
  const merged = await mergeNativeDocuments([
    { name: "image.pdf", bytes: source, rotation: 0 },
    { name: "text.pdf", bytes: await fixture("TEXT", [0]), rotation: 0 },
  ], { format: "original", marginPoints: 0 });
  assert.deepEqual(new Uint8Array(source), snapshot, "image source bytes must not be mutated");
  const output = await PDFDocument.load(merged.bytes);
  assert.equal(output.getPageCount(), 2);
  assert.ok(output.getPage(0).node.Resources()?.lookup(PDFName.of("XObject")),
    "copied page must retain its image XObject resources");
  const task = pdfjsLib.getDocument({ data: new Uint8Array(merged.bytes.slice(0)), useSystemFonts: true });
  try {
    const pdf = await task.promise;
    const first = await pdf.getPage(1);
    const operators = await first.getOperatorList();
    assert.ok(operators.fnArray.some(op => op === pdfjsLib.OPS.paintImageXObject ||
      op === pdfjsLib.OPS.paintInlineImageXObject || op === pdfjsLib.OPS.paintImageXObjectRepeat),
      "merged image must remain a native PDF image paint operation");
    const content = await first.getTextContent();
    assert.ok(content.items.some(item => "str" in item && item.str.includes("IMAGE RESOURCE")),
      "selectable text must survive alongside embedded images");
  } finally {
    await task.destroy();
  }
});

/**
 * A copied native page must retain the exact image stream and its decoded
 * resource contract, not merely still reference an XObject name. Comparing
 * the actual PDF stream bytes also covers alpha-mask image resources without
 * assuming how a PDF viewer renders one particular colour profile.
 */
function pageImageFingerprint(document: PDFDocument, pageIndex: number) {
  const resources = document.getPage(pageIndex).node.Resources();
  assert.ok(resources, "image page must have resource dictionary");
  const xObjects = resources.lookup(PDFName.of("XObject"));
  assert.ok(xObjects instanceof PDFDict, "image XObject dictionary must survive");
  const images = xObjects.entries().flatMap(([alias, ref]) => {
    const value = document.context.lookup(ref);
    if (!(value instanceof PDFRawStream) ||
        value.dict.lookup(PDFName.of("Subtype"))?.toString() !== "/Image") return [];
    const fields = ["Type", "Subtype", "Width", "Height", "ColorSpace",
      "BitsPerComponent", "Filter", "Decode", "Mask", "SMask"];
    return [{
      alias: alias.toString(),
      stream: Buffer.from(value.getContents()).toString("base64"),
      dictionary: Object.fromEntries(fields.map(name =>
        [name, value.dict.get(PDFName.of(name))?.toString() ?? null])),
    }];
  });
  assert.ok(images.length > 0, "actual image streams must be present");
  return images.sort((a, b) => a.alias.localeCompare(b.alias));
}

function pageFontFingerprint(document: PDFDocument, pageIndex: number) {
  const resources = document.getPage(pageIndex).node.Resources();
  assert.ok(resources, "font page must have resources");
  const fonts = resources.lookup(PDFName.of("Font"));
  assert.ok(fonts instanceof PDFDict, "source fonts must remain native");
  const fields = ["Type", "Subtype", "BaseFont", "Encoding", "FirstChar", "LastChar"];
  return fonts.entries().map(([alias, ref]) => {
    const font = document.context.lookup(ref);
    assert.ok(font instanceof PDFDict, "font reference must resolve to a dictionary");
    return {
      alias: alias.toString(),
      dictionary: Object.fromEntries(fields.map(name =>
        [name, font.get(PDFName.of(name))?.toString() ?? null])),
      // The full dictionary also captures encoding differences. These
      // generated standard fonts have no embedded font file streams.
      encoded: font.toString(),
    };
  }).sort((a, b) => a.alias.localeCompare(b.alias));
}

test("Phase 07 native copied page retains exact PNG image stream and font provenance", async () => {
  const source = await PDFDocument.create();
  const helvetica = await source.embedFont(StandardFonts.Helvetica);
  const courier = await source.embedFont(StandardFonts.Courier);
  const image = await source.embedPng(Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1sAAAAASUVORK5CYII=", "base64"));
  const page = source.addPage([420, 520]);
  page.drawImage(image, { x: 28, y: 34, width: 86, height: 76 });
  page.drawText("RESOURCE PROVENANCE HELVETICA", { x: 40, y: 350, font: helvetica, size: 15 });
  page.drawText("RESOURCE PROVENANCE COURIER", { x: 40, y: 300, font: courier, size: 13 });
  const serialized = bufferOf(await source.save());
  const parsedInput = await PDFDocument.load(serialized.slice(0));
  const sourceImages = pageImageFingerprint(parsedInput, 0);
  const sourceFonts = pageFontFingerprint(parsedInput, 0);
  assert.ok(sourceFonts.length >= 2, "test must embed distinct native font resources");

  const result = await mergeNativeDocuments([
    { name: "image-fonts.pdf", bytes: serialized, rotation: 0 },
    { name: "second.pdf", bytes: await fixture("SECOND", [90]), rotation: 0 },
  ], { format: "original", marginPoints: 0 });
  const output = await PDFDocument.load(result.bytes);
  assert.equal(output.getPageCount(), 2);
  assert.deepEqual(pageImageFingerprint(output, 0), sourceImages,
    "copied image payload bytes, filter, colour and dimensions must exactly match the source");
  assert.deepEqual(pageFontFingerprint(output, 0), sourceFonts,
    "original font dictionaries and encodings must not be substituted or rasterized");
  assert.equal(output.getPage(0).getWidth(), 420);
  assert.equal(output.getPage(0).getHeight(), 520);
});

test("Phase 07 refuses native merge of URL link annotations without losing any source bytes", async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 600]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText("LINK PRESERVATION REQUIRED", { x: 30, y: 500, font, size: 15 });
  const link = doc.context.obj({
    Type: "Annot", Subtype: "Link", Rect: [20, 470, 200, 510],
    Border: [0, 0, 0], A: { S: "URI", URI: "https://example.invalid/link" },
  });
  const linkRef = doc.context.register(link);
  page.node.set(PDFName.of("Annots"), doc.context.obj([linkRef]));
  const original = bufferOf(await doc.save());
  const snapshot = new Uint8Array(original.slice(0));
  const parsed = await PDFDocument.load(original.slice(0));
  assert.equal(parsed.getPage(0).node.Annots()?.size(), 1,
    "fixture must actually contain a URL link annotation");
  await assert.rejects(mergeNativeDocuments([
    { name: "linked.pdf", bytes: original, rotation: 0 },
    { name: "plain.pdf", bytes: await fixture("PLAIN", [0]), rotation: 0 },
  ], { format: "original", marginPoints: 0 }), /protected or interactive document structure/,
  "a rejected interactive document must not produce a damaged merged download");
  assert.deepEqual(new Uint8Array(original), snapshot,
    "input URL link and all original source bytes must remain untouched");
});
