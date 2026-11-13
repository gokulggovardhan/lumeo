import assert from "node:assert/strict";
import test from "node:test";
import { PDFDict, PDFDocument, PDFName, PDFRawStream, StandardFonts } from "pdf-lib";
import { collectDocumentJpegCandidates } from "../lib/pdf/optimization/documentAwareImages.ts";
import { optimizeNativePdfImages } from "../lib/pdf/optimization/nativeImages.ts";
import { findEmbeddedJpegs } from "../lib/pdf/embeddedImages.ts";

// 64×48 original JPEG with real RGB image content, not a claimed PDF benchmark.
const JPEG = new Uint8Array(Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAcFBQYFBAcGBgYIBwcICxILCwoKCxYPEA0SGhYbGhkWGRgcICgiHB4mHhgZIzAkJiorLS4tGyIyNTEsNSgsLSz/2wBDAQcICAsJCxULCxUsHRkdLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCz/wAARCAAwAEADASIAAhEBAxEB/8QAGQABAAMBAQAAAAAAAAAAAAAAAgUGBwQD/8QAMRAAAQEGBgAEBAcGBgYIBwcICxILCwoKCxYPEA0SGhYbGhkWGRgcICgiHB4mHhgZIzAkJiorLS4tGyIyNTEsNSgsLSz/8QAGQEBAQADAQAAAAAAAAAAAAAABAMBAgUA/8QAIxEAAgICAgEEAwAAAAAAAAAAAQIAAzGBESFhEjJBgkJx0f/aAAwDAQACEQMRAD8AoOXMbjLAkbMMS4YhX0zkkvQhU2hC8G1Tok+ZT61FFELSDsoSr4dwOnaYJxBxq8QuUv3aIpaIdYhysb9qS8ClAepSCpPn/Ifm3Xpq5La9zZngPLmdz57McRYOmYlk9kQdPYZylISIhSt9U7iaJqlJFFApVuoqgJLOuQobAuOpop5A5mpaceSW3az068jtu1qhpxx7LZbP46QTt4qCmM08FMMt4na7eLTv+An7Vq3igpQkUBqUg2/TryO27W87BhYR4iMq2o9PHIrbtZae+Q23ax08citu1lp75DbdrYt/PUU+LNR6f+QW/azyC9/t+1hp/wCQW/azyC9/t+1p2ZbUTdi76yL01clte5npt5La9rDTVyW17mem3ktr2sq/NupxEwJT8uMsJHmVKMROJklbiOh3blMHGuyd0OpReEkpqAsHaKg/StCkmrQWUGZrzK3EK5dP3AeyaYhCHkU7ClLcba7VAfckbjuTTdQgitAlWoaceSW3a3JkdJpdiGTYslM2hHcZAxSIZD1y8HkofNP9gggEEUIIBBBDSvXlnP6iCOiZ26cX7qJcT985WFu1iGIUP9W9tPfIbbtbHsFjGmAxOsWYMDuKl8ChAmEC9ClpLtQXRakAgqSgpJ3AhSQf07y2naaJ/ATNc+cIfIRFqduHhh1K+PaC8CiB9QCpNSPTcmtKtN294bPUuzdOGz1JbT/yC37WeQXv9v2sNP8AyC37WeQXv9v2tizLajLsXfWRemrktr3M9NvJbXtYaauS2vcz028lte1lX5t1OImBHpx5JbdrPTryO27WGnHklt2s9OvI7btbS7Nmon4bUenjkVt2tmGGMsZjimEnU7wpMYiW4klfhPIcOX3gh9vDwLSFihQsgAA1ofMH8RUNP08citu1lp75DbdrTtHb6iLACLNSmZBZkyuRTmaSXFMQ7lUVEodl3Ev1BDlSne8kKUfJBIUCD6Gh8wSkG85Be/2/a1NwJlvJcyMP4jgJi7DmLdiHMJHIQC8h1/N/6Sfqkmh/YgKFYywzFmGUkyjXc6l8TMsOxAdulRMO7qt0sBZdgEkJNRvBQog0FQaJoqT8j1A+JS0sgtQ988d/2f/Z", "base64"));
function paddedJpeg(): Uint8Array {
  const comment = Buffer.alloc(12_000, 65);
  const len = comment.byteLength + 2;
  return new Uint8Array(Buffer.concat([
    Buffer.from(JPEG.subarray(0, 2)), Buffer.from([255, 254, len >> 8, len & 255]),
    comment, Buffer.from(JPEG.subarray(2)),
  ]));
}
function exact(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
async function sharedDocument(withForm = false) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const jpeg = await doc.embedJpg(paddedJpeg());
  const small = doc.addPage([20, 20]);
  small.drawImage(jpeg, { x: 0, y: 0, width: 20, height: 15 });
  small.drawText("SHARED", { x: 1, y: 18, size: 3, font });
  const large = doc.addPage([560, 720]);
  large.drawImage(jpeg, { x: 20, y: 20, width: 450, height: 360 });
  large.drawText("SELECTABLE BODY TEXT", { x: 30, y: 670, size: 20, font });
  // The same stream is additionally referenced through an alias on page 1.
  const xobjects = small.node.Resources()?.lookup(PDFName.of("XObject"));
  assert.ok(xobjects instanceof PDFDict);
  const [{ ref }] = findEmbeddedJpegs(small);
  xobjects.set(PDFName.of("SameImageAlias"), ref);
  if (withForm) {
    // A realistic Form XObject with independent graphics state. We must not
    // assume its image placement is captured by the outer page dimensions.
    const form = doc.context.flateStream("q\nQ\n", {
      Type: "XObject", Subtype: "Form", BBox: [0, 0, 10, 10],
      Resources: {},
    });
    const formRef = doc.context.register(form);
    xobjects.set(PDFName.of("VectorForm"), formRef);
  }
  return exact(await doc.save({ useObjectStreams: false }));
}

test("Phase 05: shared image uses largest page envelope instead of first 20-point page", async () => {
  const input = await sharedDocument();
  const parsed = await PDFDocument.load(input);
  const images = collectDocumentJpegCandidates(parsed);
  assert.equal(images.length, 1);
  assert.equal(images[0].pageWidth, 560);
  assert.equal(images[0].pageHeight, 720);
  assert.equal(images[0].usedOnPages, 2);
  assert.equal(images[0].namedAliases, 3);
  assert.equal((await parsed.embedJpg(JPEG)).width, 64);
});

test("Phase 05: actual native optimizer preserves full JPEG dimensions on shared large page", async () => {
  const input = await sharedDocument();
  let called = 0;
  const result = await optimizeNativePdfImages(input, "smart", { dpi: 72, quality: 0.84 },
    async (_jpeg, dims) => {
      called += 1;
      assert.deepEqual(dims, { width: 64, height: 48, sourceWidth: 64, sourceHeight: 48 });
      return JPEG;
    });
  assert.equal(called, 1, "Shared aliases must transcode only once");
  assert.equal(result.optimizedImages, 1);
  assert.ok(result.outputBytes < result.inputBytes);
  const output = await PDFDocument.load(result.bytes);
  assert.equal(output.getPageCount(), 2);
  assert.equal(findEmbeddedJpegs(output.getPage(0))[0].ref.toString(),
    findEmbeddedJpegs(output.getPage(1))[0].ref.toString());
  const ref = findEmbeddedJpegs(output.getPage(1))[0].ref;
  const image = output.context.lookup(ref);
  assert.ok(image instanceof PDFRawStream);
  assert.equal(image.dict.lookup(PDFName.of("Width"))?.toString(), "64");
  assert.equal(image.dict.lookup(PDFName.of("Height"))?.toString(), "48");
});

test("Phase 05: Form XObjects conservatively prevent lossy transcode, preserving original image", async () => {
  const input = await sharedDocument(true);
  const pdf = await PDFDocument.load(input);
  assert.deepEqual(collectDocumentJpegCandidates(pdf), []);
  let transcoded = 0;
  const optimized = await optimizeNativePdfImages(input, "smart", { dpi: 96, quality: 0.65 },
    async () => {
      transcoded += 1;
      return JPEG;
    });
  assert.equal(transcoded, 0);
  assert.equal(optimized.optimizedImages, 0);
  assert.ok(optimized.outputBytes <= input.byteLength);
  const restored = await PDFDocument.load(optimized.bytes);
  assert.equal(restored.getPageCount(), 2);
  const [{ ref }] = findEmbeddedJpegs(restored.getPage(1));
  const stream = restored.context.lookup(ref);
  assert.ok(stream instanceof PDFRawStream);
  assert.deepEqual(new Uint8Array(stream.getContents()), paddedJpeg());
});
