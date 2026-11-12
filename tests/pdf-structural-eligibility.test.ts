import assert from "node:assert/strict";
import test from "node:test";
import {
  PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFRef,
  StandardFonts, degrees,
} from "pdf-lib";
import { inspectPdfStructure, isCanonicalRgbJpegResource } from "../lib/pdf/structuralEligibility.ts";
import { optimizeNativePdfImages } from "../lib/pdf/optimization/nativeImages.ts";
import { mergeNativeDocuments } from "../lib/pdf/merge/nativeMerge.ts";
import { findEmbeddedJpegs } from "../lib/pdf/embeddedImages.ts";

const JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=",
  "base64",
);

function arrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
async function nativeFixture() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([410, 600]);
  page.setRotation(degrees(90));
  page.setCropBox(20, 30, 300, 400);
  page.drawText("STRUCTURE MUST STAY SEARCHABLE", { x: 35, y: 100, size: 18, font });
  return pdf;
}
async function jpgFixture() {
  const pdf = await nativeFixture();
  const jpg = await pdf.embedJpg(JPEG);
  pdf.getPage(0).drawImage(jpg, { x: 50, y: 120, width: 60, height: 60 });
  return pdf;
}

test("Phase 3: simple text pages expose actual boxes, rotations and fonts without private text content", async () => {
  const doc = await PDFDocument.load(await (await nativeFixture()).save());
  const report = inspectPdfStructure(doc);
  assert.equal(report.safeForMerge, true, JSON.stringify(report));
  assert.equal(report.safeForCompression, true, JSON.stringify(report));
  assert.equal(report.pages.length, 1);
  assert.deepEqual(report.pages[0].mediaBox, { x: 0, y: 0, width: 410, height: 600 });
  assert.deepEqual(report.pages[0].cropBox, { x: 20, y: 30, width: 300, height: 400 });
  assert.equal(report.pages[0].rotation, 90);
  assert.ok(report.totalFontResources >= 1);
  assert.equal(report.pages[0].annotationCount, 0);
  assert.equal(JSON.stringify(report).includes("STRUCTURE MUST STAY SEARCHABLE"), false);
  assert.equal(report.protectedFeatures.length, 0);
});

test("Phase 3: only canonical 8-bit RGB DCT JPEG may enter lossy browser transcode", async () => {
  const pdf = await PDFDocument.load(await (await jpgFixture()).save());
  const report = inspectPdfStructure(pdf);
  assert.equal(report.safeForCompression, true);
  assert.equal(report.images.length, 1);
  assert.equal(report.images[0].colorSpace, "DeviceRGB");
  assert.equal(report.images[0].encoding, "DCTDecode");
  assert.equal(report.images[0].isCanonicalRgbJpeg, true);
  const [{ ref }] = findEmbeddedJpegs(pdf.getPage(0));
  const stream = pdf.context.lookup(ref);
  assert.ok(stream instanceof PDFRawStream);
  assert.equal(isCanonicalRgbJpegResource(stream), true);
  stream.dict.set(PDFName.of("SMask"), PDFName.of("ExampleMask"));
  const protectedReport = inspectPdfStructure(pdf);
  assert.equal(protectedReport.images[0].masked, true);
  assert.equal(protectedReport.images[0].isCanonicalRgbJpeg, false);
  assert.equal(protectedReport.safeForCompression, true, "Unsupported image resource does not justify dropping the whole document");
  assert.equal(isCanonicalRgbJpegResource(stream), false);
  stream.dict.delete(PDFName.of("SMask"));
  stream.dict.set(PDFName.of("ColorSpace"), PDFName.of("DeviceCMYK"));
  const cmykReport = inspectPdfStructure(pdf);
  assert.equal(cmykReport.images[0].colorSpace, "DeviceCMYK");
  assert.equal(cmykReport.images[0].isCanonicalRgbJpeg, false);
});

test("Phase 3: AcroForms and action-bearing catalogs cannot be modified or merged", async () => {
  const doc = await nativeFixture();
  doc.getForm().createTextField("customer").addToPage(doc.getPage(0));
  const original = arrayBuffer(await doc.save());
  const report = inspectPdfStructure(await PDFDocument.load(original));
  assert.equal(report.safeForMerge, false);
  assert.equal(report.safeForCompression, false);
  assert.ok(report.protectedFeatures.includes("AcroForm"));
  assert.ok(report.protectedFeatures.includes("PageAnnotations"));
  const compressed = await optimizeNativePdfImages(original, "maximum", { dpi: 120, quality: 0.6 });
  assert.equal(compressed.applied, false);
  assert.equal(compressed.outputBytes, original.byteLength);
  assert.deepEqual(new Uint8Array(compressed.bytes), new Uint8Array(original));
  await assert.rejects(
    mergeNativeDocuments([
      { name: "form.pdf", bytes: original, rotation: 0 },
      { name: "normal.pdf", bytes: arrayBuffer(await (await nativeFixture()).save()), rotation: 0 },
    ], { format: "original", marginPoints: 0 }),
    /protected or interactive document structure/,
  );
  const action = await nativeFixture();
  action.catalog.set(PDFName.of("OpenAction"), action.context.obj({ S: "JavaScript" }));
  assert.ok(inspectPdfStructure(action).protectedFeatures.includes("OpenAction"));
  assert.equal(inspectPdfStructure(action).safeForMerge, false);
});

test("Phase 3: malformed indirect resources and invalid page rotation fail closed", async () => {
  const doc = await PDFDocument.load(await (await nativeFixture()).save());
  const page = doc.getPage(0);
  const resources = page.node.Resources();
  assert.ok(resources);
  resources.set(PDFName.of("XObject"), PDFRef.of(999999, 0));
  const report = inspectPdfStructure(doc);
  assert.equal(report.safeForMerge, false);
  assert.match(report.unsupportedReasons.join(" "), /XObject resource dictionary/);
  resources.delete(PDFName.of("XObject"));
  page.node.set(PDFName.of("Rotate"), PDFNumber.of(45));
  const rotated = inspectPdfStructure(doc);
  assert.equal(rotated.safeForMerge, false);
  assert.match(rotated.unsupportedReasons.join(" "), /rotation/);
});

test("Phase 3: actual serialized native Merge and Compress maintain output parseability", async () => {
  const first = await nativeFixture();
  const second = await nativeFixture();
  const inputs = [
    { name: "first.pdf", bytes: arrayBuffer(await first.save()), rotation: 0 },
    { name: "second.pdf", bytes: arrayBuffer(await second.save()), rotation: 0 },
  ];
  const merged = await mergeNativeDocuments(inputs, { format: "original", marginPoints: 0 });
  const parsed = await PDFDocument.load(merged.bytes);
  assert.equal(parsed.getPageCount(), 2);
  const outputReport = inspectPdfStructure(parsed);
  assert.equal(outputReport.safeForMerge, true, JSON.stringify(outputReport));
  assert.deepEqual(outputReport.pages.map((page) => page.rotation), [90, 90]);
  const compressed = await optimizeNativePdfImages(merged.bytes, "lossless", { dpi: 150, quality: 0.8 });
  assert.ok(compressed.outputBytes <= merged.bytes.byteLength);
  assert.equal((await PDFDocument.load(compressed.bytes)).getPageCount(), 2);
});
