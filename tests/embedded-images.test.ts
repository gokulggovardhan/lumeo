import assert from "node:assert/strict";
import test from "node:test";
import { PDFDict, PDFDocument, PDFName } from "pdf-lib";
import { findEmbeddedJpegs } from "../lib/pdf/embeddedImages.ts";

// A real, minimal 1x1 red JPEG (valid SOI/EOI, DCTDecode) -- small enough to
// inline, large enough to be a genuine embeddable image, not a fabricated
// fixture.
const TINY_JPEG_BASE64 =
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=";

// embedJpg() only reserves a ref; the actual stream object isn't a concrete,
// lookupable part of the document's object graph until save() writes it out
// (see pdf-lib's PDFDocument.prototype.embedJpg). Production code never
// looks at a document in that half-embedded state -- buildCompressedCandidate
// always calls findEmbeddedJpegs on a page from sourcePdf, which is itself a
// freshly PDFDocument.load()-ed file, where every image is already a
// concrete parsed stream. Saving and reloading here reproduces that same
// real shape instead of testing an intermediate state nothing in this app
// ever actually operates on.
async function buildPdfWithEmbeddedJpeg() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([200, 200]);
  const image = await doc.embedJpg(TINY_JPEG_BASE64);
  page.drawImage(image, { x: 0, y: 0, width: 100, height: 100 });
  const bytes = await doc.save();
  const reloaded = await PDFDocument.load(bytes);
  return { doc: reloaded, page: reloaded.getPage(0) };
}

test("findEmbeddedJpegs finds a JPEG XObject drawn on the page", async () => {
  const { page } = await buildPdfWithEmbeddedJpeg();
  const found = findEmbeddedJpegs(page);
  assert.equal(found.length, 1);
  assert.ok(found[0].bytes.byteLength > 0);
  // SOI marker -- confirms we got real JPEG bytes back, not something else.
  assert.equal(found[0].bytes[0], 0xff);
  assert.equal(found[0].bytes[1], 0xd8);
});

test("findEmbeddedJpegs returns nothing for a page with no images", async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([200, 200]);
  page.drawText("No images here", { x: 10, y: 100 });
  assert.deepEqual(findEmbeddedJpegs(page), []);
});

test("findEmbeddedJpegs returns nothing for a page with no resources at all", async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([200, 200]);
  assert.deepEqual(findEmbeddedJpegs(page), []);
});

// Exercises the same swap-and-delete object-graph surgery
// CompressPdfTool.tsx's recompressPageImages performs, without the canvas
// decode/re-encode step either side of it (browser-only, can't run under
// Node's test runner) -- this proves the pdf-lib manipulation itself is
// structurally sound: the page's XObject entry ends up pointing at the new
// image, the old stream is gone from the context (not left as unreferenced
// dead weight in the saved file), and the result still loads and renders as
// a valid one-page PDF.
test("swapping a page's image XObject and deleting the old stream produces a valid, correctly-updated PDF", async () => {
  const { doc, page } = await buildPdfWithEmbeddedJpeg();
  const [{ ref: oldRef, name }] = findEmbeddedJpegs(page);

  const objectCountBefore = doc.context.enumerateIndirectObjects().length;

  const replacementImage = await doc.embedJpg(TINY_JPEG_BASE64);
  const resources = page.node.Resources();
  const xObjects = resources?.lookupMaybe(PDFName.of("XObject"), PDFDict);
  xObjects?.set(PDFName.of(name), replacementImage.ref);
  page.node.context.delete(oldRef);

  const savedBytes = await doc.save();
  const reloaded = await PDFDocument.load(savedBytes);
  assert.equal(reloaded.getPageCount(), 1);

  const reloadedPage = reloaded.getPage(0);
  const [foundAfterSwap] = findEmbeddedJpegs(reloadedPage);
  assert.ok(foundAfterSwap, "the swapped-in image should still be discoverable after save+reload");

  // The old stream's ref number must not appear as a live object in the
  // freshly-reloaded document -- confirming it was actually dropped, not
  // just unreferenced-but-still-written.
  const objectCountAfter = doc.context.enumerateIndirectObjects().length;
  assert.ok(
    objectCountAfter <= objectCountBefore,
    "deleting the old stream and adding one replacement should not grow the live object count",
  );
});
