import assert from "node:assert/strict";
import test from "node:test";
import { degrees, PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, StandardFonts } from "pdf-lib";
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
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFUlEQVR4nGP4z8DwHwjrGcD0f4YTAD2YB0LLpftwAAAAAElFTkSuQmCC", "base64"));
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
      "BitsPerComponent", "Filter", "Decode"];
    // An indirect soft-mask reference is legitimately renumbered by
    // pdf-lib.copyPages(). Compare the resolved mask bytes and metadata,
    // never the incidental object reference number.
    const softMaskRef = value.dict.get(PDFName.of("SMask"));
    const softMask = softMaskRef ? document.context.lookup(softMaskRef) : undefined;
    assert.ok(!softMaskRef || softMask instanceof PDFRawStream,
      "a referenced alpha mask must resolve to a native image stream");
    const maskStream = softMask instanceof PDFRawStream ? softMask : null;
    const maskKeys = ["Type", "Subtype", "Width", "Height", "ColorSpace",
      "BitsPerComponent", "Filter"];
    return [{
      alias: alias.toString(),
      stream: Buffer.from(value.getContents()).toString("base64"),
      dictionary: Object.fromEntries(fields.map(name =>
        [name, value.dict.get(PDFName.of(name))?.toString() ?? null])),
      softMask: maskStream ? {
        bytes: Buffer.from(maskStream.getContents()).toString("base64"),
        dictionary: Object.fromEntries(maskKeys.map(name =>
          [name, maskStream.dict.get(PDFName.of(name))?.toString() ?? null])),
      } : null,
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
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFUlEQVR4nGP4z8DwHwjrGcD0f4YTAD2YB0LLpftwAAAAAElFTkSuQmCC", "base64"));
  const page = source.addPage([420, 520]);
  page.drawImage(image, { x: 28, y: 34, width: 86, height: 76 });
  page.drawText("RESOURCE PROVENANCE HELVETICA", { x: 40, y: 350, font: helvetica, size: 15 });
  page.drawText("RESOURCE PROVENANCE COURIER", { x: 40, y: 300, font: courier, size: 13 });
  const serialized = bufferOf(await source.save());
  const parsedInput = await PDFDocument.load(serialized.slice(0));
  const sourceImages = pageImageFingerprint(parsedInput, 0);
  const sourceFonts = pageFontFingerprint(parsedInput, 0);
  assert.ok(sourceImages.some(image => image.softMask !== null),
    "fixture must contain a real PNG soft alpha mask, not merely an untested optional branch");
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


/**
 * Original test-only font, generated with fontTools (not copied from any
 * third-party typeface). It contains a real TrueType glyf, cmap, hmtx, name
 * and OS/2 table for the "A" glyph. The fixture is embedded locally and
 * requires no network, added package or CI host-specific fonts.
 */
const PHASE07_SYNTHETIC_TTF_BASE64 =
  "AAEAAAAKAIAAAwAgT1MvMkhBRKMAAAEoAAAAYGNtYXAADACUAAABkAAAADRnbHlmtnzZIgAAAcwAAAAwaGVhZGIMQ84AAACsAAAANmhoZWEF/AKDAAAA5AAAACRobXR4BSgAUAAAAYgAAAAIbG9jYQAYAAAAAAHEAAAABm1heHAABQANAAABCAAAACBuYW1lqsLYQAAAAfwAAAIBcG9zdAAoAAAAAAQAAAAAJgABAAAAAQAAd5Qexl8PPPUAAQPoAAAAAAAAAAAAAAAAAAAAAAB4AAACgALuAAAAAwACAAAAAAAAAAEAAANS/zgAAALQAFAAeAJYAAEAAAAAAAAAAAAAAAAAAAACAAEAAAACAAsAAgAAAAAAAgAAAAAAAAAAAAAAAAAAAAAAAwKUAZAABQAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAPz8/PwAAAEEAQQNS/zgAAANSAMgAAAAAAAAAAAAAAu4AAAAgAAACWAAAAtAAUAAAAAIAAAADAAAAFAADAAEAAAAUAAQAIAAAAAQABAABAAAAQf//AAAAQf///8AAAQAAAAAAAAAAABgAAAACAHgAAAKAAu4ABwAKAAAzEzMTIycjBxMzA3iM0qp4KNIjQZZQAu79EqqqAQ4BQAAAAAwAlgABAAAAAAABABcAAAABAAAAAAACAAcAFwABAAAAAAADABQAHgABAAAAAAAEAB8AMgABAAAAAAAFAAsAUQABAAAAAAAGAB0AXAADAAEECQABAC4AeQADAAEECQACAA4ApwADAAEECQADACgAtQADAAEECQAEAD4A3QADAAEECQAFABYBGwADAAEECQAGADoBMUx1bWVvIFBoYXNlMDcgU3ludGhldGljUmVndWxhckx1bWVvLVBoYXNlMDctVGVzdC0xTHVtZW8gUGhhc2UwNyBTeW50aGV0aWMgUmVndWxhclZlcnNpb24gMS4wTHVtZW9QaGFzZTA3U3ludGhldGljLVJlZ3VsYXIATAB1AG0AZQBvACAAUABoAGEAcwBlADAANwAgAFMAeQBuAHQAaABlAHQAaQBjAFIAZQBnAHUAbABhAHIATAB1AG0AZQBvAC0AUABoAGEAcwBlADAANwAtAFQAZQBzAHQALQAxAEwAdQBtAGUAbwAgAFAAaABhAHMAZQAwADcAIABTAHkAbgB0AGgAZQB0AGkAYwAgAFIAZQBnAHUAbABhAHIAVgBlAHIAcwBpAG8AbgAgADEALgAwAEwAdQBtAGUAbwBQAGgAYQBzAGUAMAA3AFMAeQBuAHQAaABlAHQAaQBjAC0AUgBlAGcAdQBsAGEAcgAAAAACAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAAkAAA=";

function embeddedTrueTypeProgramFingerprints(document: PDFDocument, pageIndex: number) {
  const resources = document.getPage(pageIndex).node.Resources();
  assert.ok(resources, "embedded font page must have resources");
  const fonts = resources.lookup(PDFName.of("Font"));
  assert.ok(fonts instanceof PDFDict, "embedded font page must have font resources");
  const fingerprints = fonts.entries().flatMap(([alias, ref]) => {
    const font = document.context.lookup(ref);
    if (!(font instanceof PDFDict)) return [];
    const descendants = font.lookup(PDFName.of("DescendantFonts"));
    let descriptorOwner = font;
    if (descendants instanceof PDFArray && descendants.size() > 0) {
      const descendant = document.context.lookup(descendants.get(0));
      assert.ok(descendant instanceof PDFDict, "CID descendant must resolve");
      descriptorOwner = descendant;
    }
    const descriptor = descriptorOwner.lookup(PDFName.of("FontDescriptor"));
    if (!(descriptor instanceof PDFDict)) return [];
    const fontFile = descriptor.get(PDFName.of("FontFile2"));
    if (!fontFile) return [];
    const embedded = document.context.lookup(fontFile);
    assert.ok(embedded instanceof PDFRawStream, "TrueType FontFile2 must resolve to a native stream");
    return [{
      alias: alias.toString(),
      subtype: font.get(PDFName.of("Subtype"))?.toString() ?? null,
      baseFont: font.get(PDFName.of("BaseFont"))?.toString() ?? null,
      program: Buffer.from(embedded.getContents()).toString("base64"),
    }];
  });
  assert.ok(fingerprints.length > 0, "a real embedded TrueType font program is mandatory");
  return fingerprints.sort((a, b) => a.alias.localeCompare(b.alias));
}

test("Phase 07 copied page preserves an actual embedded TrueType font program", async () => {
  const fontkitModule = await import("@pdf-lib/fontkit");
  const fontkit = fontkitModule.default ?? fontkitModule;
  const source = await PDFDocument.create();
  source.registerFontkit(fontkit as unknown as Parameters<PDFDocument["registerFontkit"]>[0]);
  const font = await source.embedFont(Buffer.from(PHASE07_SYNTHETIC_TTF_BASE64, "base64"), {
    subset: false,
  });
  const page = source.addPage([390, 520]);
  page.drawText("AAAA", { x: 40, y: 400, size: 28, font });
  const bytes = bufferOf(await source.save());
  const untouchedBytes = new Uint8Array(bytes.slice(0));
  const original = await PDFDocument.load(bytes.slice(0));
  const expected = embeddedTrueTypeProgramFingerprints(original, 0);

  const result = await mergeNativeDocuments([
    { name: "embedded-font.pdf", bytes, rotation: 0 },
    { name: "plain.pdf", bytes: await fixture("PLAIN", [0]), rotation: 0 },
  ], { format: "original", marginPoints: 0 });
  assert.deepEqual(new Uint8Array(bytes), untouchedBytes, "embedded-font source remains immutable");
  const output = await PDFDocument.load(result.bytes);
  assert.equal(output.getPageCount(), 2);
  assert.deepEqual(embeddedTrueTypeProgramFingerprints(output, 0), expected,
    "copied TrueType FontFile2 bytes and native font identity must match the original");
});

test("Phase 07 fitted merge formats retain native text, alpha image operators and target geometry", async () => {
  const source = await PDFDocument.create();
  const font = await source.embedFont(StandardFonts.Helvetica);
  const image = await source.embedPng(Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFUlEQVR4nGP4z8DwHwjrGcD0f4YTAD2YB0LLpftwAAAAAElFTkSuQmCC", "base64"));
  const sourcePage = source.addPage([400, 600]);
  sourcePage.setCropBox(12, 18, 280, 400);
  sourcePage.setRotation(degrees(90));
  sourcePage.drawImage(image, { x: 45, y: 45, width: 65, height: 65 });
  sourcePage.drawText("FITTED NATIVE TEXT", { x: 40, y: 310, font, size: 18 });
  const original = bufferOf(await source.save());
  const second = await fixture("FOLLOWUP", [0]);
  const originalBytes = new Uint8Array(original.slice(0));
  const secondBytes = new Uint8Array(second.slice(0));
  const cases = [
    { format: "smartA4Portrait", width: 595.28, height: 841.89 },
    { format: "smartA4Landscape", width: 841.89, height: 595.28 },
    { format: "matchFirst", width: 280, height: 400 },
  ] as const;

  for (const { format, width, height } of cases) {
    const result = await mergeNativeDocuments([
      { name: "cropped-rotated.pdf", bytes: original, rotation: 270 },
      { name: "following.pdf", bytes: second, rotation: 0 },
    ], { format, marginPoints: 12 });
    assert.equal(result.pageCount, 2, `${format} must preserve both pages`);
    const output = await PDFDocument.load(result.bytes);
    assert.equal(output.getPageCount(), 2);
    for (const page of output.getPages()) {
      const size = page.getSize();
      assert.equal(size.width, width, `${format} output width`);
      assert.equal(size.height, height, `${format} output height`);
    }

    const task = pdfjsLib.getDocument({ data: new Uint8Array(result.bytes.slice(0)), useSystemFonts: true });
    try {
      const document = await task.promise;
      assert.equal(document.numPages, 2);
      const firstPage = await document.getPage(1);
      const text = await firstPage.getTextContent();
      assert.ok(text.items.some(item => "str" in item && item.str.includes("FITTED NATIVE TEXT")),
        `${format} must retain selectable text inside the embedded native page`);
      const operators = await firstPage.getOperatorList();
      assert.ok(operators.fnArray.some(op => op === pdfjsLib.OPS.paintImageXObject ||
        op === pdfjsLib.OPS.paintInlineImageXObject || op === pdfjsLib.OPS.paintImageXObjectRepeat),
        `${format} must keep a native image paint operator, not rasterize the page`);
      const following = await document.getPage(2);
      const followingText = await following.getTextContent();
      assert.ok(followingText.items.some(item => "str" in item && item.str.includes("FOLLOWUP SOURCE PAGE 1")),
        `${format} must retain the second source's selectable text and order`);
    } finally {
      await task.destroy();
    }
    assert.deepEqual(new Uint8Array(original), originalBytes, `${format} must leave the image source unchanged`);
    assert.deepEqual(new Uint8Array(second), secondBytes, `${format} must leave the other source unchanged`);
  }
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
