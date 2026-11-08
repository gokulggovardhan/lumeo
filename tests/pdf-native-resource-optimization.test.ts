import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import { findEmbeddedJpegs } from "../lib/pdf/embeddedImages.ts";
import { optimizeNativePdfImages } from "../lib/pdf/optimization/nativeImages.ts";

const SMALL_JPEG =
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=";

const ORIGINAL_JPEG = new Uint8Array(Buffer.from(SMALL_JPEG, "base64"));

function paddedJpeg(): Uint8Array {
  // JPEG COM marker contains 16 KB of harmless metadata. Its pixels are
  // identical to ORIGINAL_JPEG, so replacing it is visually lossless even
  // though the normal native-JPEG path supports lossy transcoding.
  const comment = Buffer.alloc(16_000, 65);
  const length = comment.byteLength + 2;
  return new Uint8Array(Buffer.concat([
    Buffer.from(ORIGINAL_JPEG.subarray(0, 2)),
    Buffer.from([0xff, 0xfe, length >> 8, length & 255]),
    comment,
    Buffer.from(ORIGINAL_JPEG.subarray(2)),
  ]));
}

async function imageFixture(withForm = false) {
  const pdf = await PDFDocument.create();
  const image = await pdf.embedJpg(paddedJpeg());
  for (let i = 0; i < 2; i++) {
    const page = pdf.addPage([200, 250]);
    page.drawText("LIVE SELECTABLE TEXT", { x: 10, y: 200 });
    page.drawImage(image, { x: 10, y: 10, width: 100, height: 100 });
  }
  if (withForm) {
    pdf.getForm().createTextField("customer").addToPage(pdf.getPage(0));
  }
  const bytes = await pdf.save();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

test("native resource optimisation deduplicates shared JPEG refs and preserves both pages", async () => {
  const input = await imageFixture();
  const callbacks: string[] = [];
  const output = await optimizeNativePdfImages(
    input,
    "smart",
    { dpi: 150, quality: 0.8 },
    async (_bytes, shape) => {
      assert.deepEqual(shape, { width: 1, height: 1, sourceWidth: 1, sourceHeight: 1 });
      return ORIGINAL_JPEG;
    },
    ({ stage }) => callbacks.push(stage),
  );
  assert.equal(output.analyzedImages, 1);
  assert.equal(output.optimizedImages, 1);
  assert.equal(output.applied, true);
  assert.ok(output.outputBytes < output.inputBytes);
  assert.equal(output.outputBytes, output.bytes.byteLength);
  assert.ok(callbacks.includes("validate"));

  const doc = await PDFDocument.load(output.bytes);
  assert.equal(doc.getPageCount(), 2);
  const page1 = findEmbeddedJpegs(doc.getPage(0));
  const page2 = findEmbeddedJpegs(doc.getPage(1));
  assert.equal(page1.length, 1);
  assert.equal(page2.length, 1);
  assert.equal(page1[0].ref.toString(), page2[0].ref.toString());
  assert.equal(page1[0].bytes.byteLength, ORIGINAL_JPEG.byteLength);
});

test("lossless-only and too-large image candidates never increase output size", async () => {
  const input = await imageFixture();
  const original = await optimizeNativePdfImages(input, "lossless", { dpi: 150, quality: 0.8 });
  assert.equal(original.optimizedImages, 0);
  assert.ok(original.outputBytes <= input.byteLength);
  const tooLarge = await optimizeNativePdfImages(input, "smart", { dpi: 150, quality: 0.8 }, async (jpg) => jpg);
  assert.equal(tooLarge.optimizedImages, 0);
  assert.ok(tooLarge.outputBytes <= input.byteLength);
});

test("forms are returned unchanged, not damaged to meet a smaller requested size", async () => {
  const input = await imageFixture(true);
  const result = await optimizeNativePdfImages(input, "maximum", { dpi: 96, quality: 0.55 }, async () => ORIGINAL_JPEG);
  assert.equal(result.applied, false);
  assert.equal(result.outputBytes, input.byteLength);
  assert.match(result.protectedReason || "", /protected/);
  assert.equal((await PDFDocument.load(result.bytes)).getForm().getFields().length, 1);
});

test("invalid resource budgets are rejected before constructing temporary output", async () => {
  const input = await imageFixture();
  await assert.rejects(optimizeNativePdfImages(input, "smart", { dpi: 1, quality: 0.8 }), /Invalid quality/);
  await assert.rejects(optimizeNativePdfImages(input, "smart", { dpi: 150, quality: 0.01 }), /Invalid quality/);
});

test("noncanonical JPEG Decode dictionaries are left untouched to preserve rendering semantics", async () => {
  const source = await PDFDocument.load(await imageFixture());
  const [{ ref }] = findEmbeddedJpegs(source.getPage(0));
  const image = source.context.lookup(ref);
  assert.ok(image instanceof PDFRawStream);
  image.dict.set(PDFName.of("Decode"), source.context.obj([1, 0, 1, 0, 1, 0]));
  const bytes = await source.save();
  const input = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const output = await optimizeNativePdfImages(
    input, "maximum", { dpi: 96, quality: 0.48 }, async () => ORIGINAL_JPEG,
  );
  assert.equal(output.optimizedImages, 0);
  const verified = await PDFDocument.load(output.bytes);
  const [{ ref: outputImageRef }] = findEmbeddedJpegs(verified.getPage(0));
  const keptImage = verified.context.lookup(outputImageRef);
  assert.ok(keptImage instanceof PDFRawStream);
  assert.ok(keptImage.dict.has(PDFName.of("Decode")));
});
