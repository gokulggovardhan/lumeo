import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument, PDFName, PDFRawStream, StandardFonts, degrees } from "pdf-lib";
import { verifyLosslessPdfRewrite } from "../lib/pdf/optimization/losslessIntegrity.ts";
import { optimizeNativePdfImages } from "../lib/pdf/optimization/nativeImages.ts";
import { findEmbeddedJpegs } from "../lib/pdf/embeddedImages.ts";

const JPEG = new Uint8Array(Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=",
  "base64",
));

function buffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function documentFixture(label = "ORIGINAL SEARCHABLE TEXT", withImage = true): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([600, 720]);
  page.setCropBox(10, 20, 560, 680);
  page.setRotation(degrees(90));
  page.drawText(label, { x: 45, y: 130, size: 18, font });
  for (let i = 0; i < 16; i += 1) {
    page.drawText("REPEATED TEXT VECTOR #" + i, { x: 45, y: 180 + i * 17, size: 10, font });
  }
  if (withImage) {
    const image = await doc.embedJpg(JPEG);
    page.drawImage(image, { x: 400, y: 400, width: 80, height: 80 });
  }
  // Plain-object source makes a representative lossless object-stream pass.
  return doc.save({ useObjectStreams: false });
}

test("Phase 4: lossless object-stream candidate preserves searchable operators, fonts and image bytes", async () => {
  const original = await documentFixture();
  const parsed = await PDFDocument.load(original, { updateMetadata: false });
  const candidate = await parsed.save({ useObjectStreams: true });
  assert.equal(await verifyLosslessPdfRewrite(parsed, candidate), true);
  const compressed = await optimizeNativePdfImages(buffer(original), "lossless", { dpi: 150, quality: 0.85 });
  assert.ok(compressed.outputBytes <= original.byteLength);
  assert.equal(compressed.optimizedImages, 0, "Lossless optimisation must never transcode JPEGs");
  if (compressed.applied) {
    assert.ok(compressed.outputBytes < original.byteLength);
    assert.equal(
      await verifyLosslessPdfRewrite(await PDFDocument.load(original), new Uint8Array(compressed.bytes)),
      true,
    );
  }
});

test("Phase 4: tampered page content with identical page count fails integrity check", async () => {
  const original = await PDFDocument.load(await documentFixture());
  const altered = await PDFDocument.load(await documentFixture("CHANGED SEARCHABLE TEXT"));
  assert.equal(original.getPageCount(), altered.getPageCount());
  assert.equal(await verifyLosslessPdfRewrite(original, await altered.save()), false);
});

test("Phase 4: changing page geometry or rotation fails closed", async () => {
  const original = await PDFDocument.load(await documentFixture());
  const resized = await PDFDocument.load(await documentFixture());
  resized.getPage(0).setCropBox(30, 40, 530, 640);
  assert.equal(await verifyLosslessPdfRewrite(original, await resized.save()), false);
  const rotated = await PDFDocument.load(await documentFixture());
  rotated.getPage(0).setRotation(degrees(180));
  assert.equal(await verifyLosslessPdfRewrite(original, await rotated.save()), false);
});

test("Phase 4: mutated embedded JPEG stream cannot be certified as lossless", async () => {
  const original = await PDFDocument.load(await documentFixture());
  const altered = await PDFDocument.load(await documentFixture());
  const [{ ref }] = findEmbeddedJpegs(altered.getPage(0));
  const stream = altered.context.lookup(ref);
  assert.ok(stream instanceof PDFRawStream);
  stream.getContents()[0] ^= 1;
  assert.equal(await verifyLosslessPdfRewrite(original, await altered.save()), false);
});

test("Phase 4: protected documents never undergo object-stream rewriting", async () => {
  const source = await documentFixture();
  const protectedDoc = await PDFDocument.load(source);
  protectedDoc.catalog.set(PDFName.of("OpenAction"), protectedDoc.context.obj({ S: "JavaScript" }));
  const original = await protectedDoc.save();
  const result = await optimizeNativePdfImages(buffer(original), "lossless", { dpi: 150, quality: 0.85 });
  assert.equal(result.applied, false);
  assert.equal(result.outputBytes, original.byteLength);
  assert.deepEqual(new Uint8Array(result.bytes), original);
});

test("Phase 4: already-object-stream-encoded documents never grow", async () => {
  const raw = await documentFixture();
  const pdf = await PDFDocument.load(raw);
  const bytes = await pdf.save({ useObjectStreams: true });
  const result = await optimizeNativePdfImages(buffer(bytes), "lossless", { dpi: 150, quality: 0.85 });
  assert.ok(result.outputBytes <= bytes.byteLength);
  assert.equal((await PDFDocument.load(result.bytes)).getPageCount(), 1);
});
