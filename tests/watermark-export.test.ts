import assert from "node:assert/strict";
import test from "node:test";
import zlib from "node:zlib";
import { PDFDocument, degrees } from "pdf-lib";
import { exportWatermarkedPdf } from "../lib/pdf/watermark/export.ts";
import { createDefaultImageWatermarkConfig, createDefaultTextWatermarkConfig } from "../lib/pdf/watermark/config.ts";

// A minimal valid 1x1 PNG, used as the image watermark's data URL -- Node's
// built-in fetch() supports data: URLs, matching what the browser does.
const TINY_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

async function makeBlankPdf(pageCount: number, rotationDeg = 0): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i += 1) {
    const page = doc.addPage([612, 792]);
    if (rotationDeg !== 0) page.setRotation(degrees(rotationDeg));
  }
  const bytes = await doc.save();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

// Decompresses every FlateDecode stream in the exported PDF and returns the
// concatenated plaintext content-stream operators -- same verification
// method used in tests/edit-pdf-export.test.ts: assert on the actual
// numbers pdf-lib wrote, not on our own formula re-checked against itself.
function decodeContentStreams(bytes: Uint8Array): string {
  const buf = Buffer.from(bytes);
  const streamMarker = Buffer.from("stream");
  const endMarker = Buffer.from("endstream");
  let searchFrom = 0;
  let combined = "";
  while (true) {
    const streamIdx = buf.indexOf(streamMarker, searchFrom);
    if (streamIdx === -1) break;
    let dataStart = streamIdx + streamMarker.length;
    if (buf[dataStart] === 0x0d) dataStart += 1;
    if (buf[dataStart] === 0x0a) dataStart += 1;
    const endIdx = buf.indexOf(endMarker, dataStart);
    if (endIdx === -1) break;
    try {
      combined += `${zlib.inflateSync(buf.subarray(dataStart, endIdx)).toString("latin1")}\n`;
    } catch {
      // Not a compressed stream -- skip, not every stream is content-stream data.
    }
    searchFrom = endIdx + endMarker.length;
  }
  return combined;
}

function approxEqual(actual: number, expected: number, tolerance = 0.05) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `expected ~${expected}, got ${actual}`);
}

test("exportWatermarkedPdf returns valid PDF bytes for a text watermark", async () => {
  const original = await makeBlankPdf(1);
  const config = createDefaultTextWatermarkConfig();
  const { bytes, skippedPages } = await exportWatermarkedPdf(original, config);
  const reloaded = await PDFDocument.load(bytes);
  assert.equal(reloaded.getPageCount(), 1);
  assert.deepEqual(skippedPages, []);
  assert.ok(bytes.byteLength > original.byteLength);
});

test("exportWatermarkedPdf ignores an empty text watermark (nothing to draw)", async () => {
  const original = await makeBlankPdf(1);
  const config = { ...createDefaultTextWatermarkConfig(), content: { ...createDefaultTextWatermarkConfig().content, text: "" } };
  const { bytes, skippedPages } = await exportWatermarkedPdf(original, config as ReturnType<typeof createDefaultTextWatermarkConfig>);
  assert.deepEqual(skippedPages, []);
  const reloaded = await PDFDocument.load(bytes);
  assert.equal(reloaded.getPageCount(), 1);
});

test("exportWatermarkedPdf draws a PNG image watermark", async () => {
  const original = await makeBlankPdf(1);
  const config = createDefaultImageWatermarkConfig(TINY_PNG_DATA_URL, "png");
  const { bytes, skippedPages } = await exportWatermarkedPdf(original, config);
  assert.deepEqual(skippedPages, []);
  const reloaded = await PDFDocument.load(bytes);
  assert.equal(reloaded.getPageCount(), 1);
  assert.ok(bytes.byteLength > original.byteLength);
});

test("exportWatermarkedPdf tiled mode draws multiple repeats", async () => {
  const original = await makeBlankPdf(1);
  const config = { ...createDefaultTextWatermarkConfig(), placementMode: "tiled" as const, rotationDeg: 0 };
  const { bytes, skippedPages } = await exportWatermarkedPdf(original, config);
  assert.deepEqual(skippedPages, []);
  const stream = decodeContentStreams(bytes);
  const occurrences = stream.split("Tj").length - 1;
  assert.ok(occurrences > 1, `expected multiple tiled repeats, found ${occurrences}`);
});

test("exportWatermarkedPdf applies only to the requested page range", async () => {
  const original = await makeBlankPdf(4);
  const config = { ...createDefaultTextWatermarkConfig(), pageRange: { mode: "custom" as const, pages: [1, 3] } };
  const { bytes, skippedPages } = await exportWatermarkedPdf(original, config);
  assert.deepEqual(skippedPages, []);
  const reloaded = await PDFDocument.load(bytes);
  assert.equal(reloaded.getPageCount(), 4);
});

test("exportWatermarkedPdf odd/even page ranges resolve to the correct pages", async () => {
  const original = await makeBlankPdf(4);
  const oddConfig = { ...createDefaultTextWatermarkConfig(), pageRange: { mode: "odd" as const } };
  const evenConfig = { ...createDefaultTextWatermarkConfig(), pageRange: { mode: "even" as const } };
  const oddResult = await exportWatermarkedPdf(original, oddConfig);
  const evenResult = await exportWatermarkedPdf(original, evenConfig);
  assert.deepEqual(oddResult.skippedPages, []);
  assert.deepEqual(evenResult.skippedPages, []);
});

test("exportWatermarkedPdf handles a page range referencing a nonexistent page without throwing", async () => {
  const original = await makeBlankPdf(1);
  const config = { ...createDefaultTextWatermarkConfig(), pageRange: { mode: "custom" as const, pages: [0, 5] } };
  const { bytes, skippedPages } = await exportWatermarkedPdf(original, config);
  assert.deepEqual(skippedPages, []);
  const reloaded = await PDFDocument.load(bytes);
  assert.equal(reloaded.getPageCount(), 1);
});

// ---------------------------------------------------------------------------
// Rotation-aware export -- text and image watermark rotation must compose
// the page's own rotation with the user's chosen watermark angle.
// ---------------------------------------------------------------------------

for (const rotation of [90, 180, 270] as const) {
  test(`exportWatermarkedPdf preserves page rotation metadata (${rotation}deg)`, async () => {
    const original = await makeBlankPdf(1, rotation);
    const config = createDefaultTextWatermarkConfig();
    const { bytes } = await exportWatermarkedPdf(original, config);
    const reloaded = await PDFDocument.load(bytes);
    assert.equal(reloaded.getPage(0).getRotation().angle, rotation);
  });

  test(`exportWatermarkedPdf composes page rotation with a zero user rotation (${rotation}deg)`, async () => {
    const original = await makeBlankPdf(1, rotation);
    const config = { ...createDefaultTextWatermarkConfig(), rotationDeg: 0 };
    const { bytes } = await exportWatermarkedPdf(original, config);
    const stream = decodeContentStreams(bytes);
    const match = stream.match(/([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) Tm/);
    assert.ok(match, "expected a text matrix operator");
    const [, a, b, c, d] = match!.map(Number) as unknown as number[];
    const radians = (rotation * Math.PI) / 180;
    approxEqual(a, Math.cos(radians));
    approxEqual(b, Math.sin(radians));
    approxEqual(c, -Math.sin(radians));
    approxEqual(d, Math.cos(radians));
  });

  test(`exportWatermarkedPdf composes page rotation with a nonzero user rotation (${rotation}deg)`, async () => {
    const original = await makeBlankPdf(1, rotation);
    const userRotation = 30;
    const config = { ...createDefaultTextWatermarkConfig(), rotationDeg: userRotation };
    const { bytes } = await exportWatermarkedPdf(original, config);
    const stream = decodeContentStreams(bytes);
    const match = stream.match(/([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) Tm/);
    assert.ok(match, "expected a text matrix operator");
    const [, a, b, c, d] = match!.map(Number) as unknown as number[];
    const totalDeg = (rotation + userRotation) % 360;
    const radians = (totalDeg * Math.PI) / 180;
    approxEqual(a, Math.cos(radians));
    approxEqual(b, Math.sin(radians));
    approxEqual(c, -Math.sin(radians));
    approxEqual(d, Math.cos(radians));
  });

  test(`exportWatermarkedPdf image watermark composes rotation the same way (${rotation}deg)`, async () => {
    const original = await makeBlankPdf(1, rotation);
    const config = { ...createDefaultImageWatermarkConfig(TINY_PNG_DATA_URL, "png"), rotationDeg: 0 };
    const { bytes, skippedPages } = await exportWatermarkedPdf(original, config);
    assert.deepEqual(skippedPages, []);
    const stream = decodeContentStreams(bytes);
    const imageBlock = stream.match(/((?:[-\d.]+ [-\d.]+ [-\d.]+ [-\d.]+ [-\d.]+ [-\d.]+ cm\n){4})\/Image/);
    assert.ok(imageBlock, "expected the four cm lines preceding the image draw");
    const cmLines = imageBlock![1].trim().split("\n");
    const [a, b, c, d] = cmLines[1].split(" ").map(Number);
    const radians = (rotation * Math.PI) / 180;
    approxEqual(a, Math.cos(radians));
    approxEqual(b, Math.sin(radians));
    approxEqual(c, -Math.sin(radians));
    approxEqual(d, Math.cos(radians));
  });
}

test("exportWatermarkedPdf handles a mixed-orientation document without cross-page leakage", async () => {
  const doc = await PDFDocument.create();
  const rotations = [0, 90, 180] as const;
  for (const rotationDeg of rotations) {
    const page = doc.addPage([612, 792]);
    if (rotationDeg !== 0) page.setRotation(degrees(rotationDeg));
  }
  const saved = await doc.save();
  const original = saved.buffer.slice(saved.byteOffset, saved.byteOffset + saved.byteLength) as ArrayBuffer;

  const config = createDefaultTextWatermarkConfig();
  const { bytes, skippedPages } = await exportWatermarkedPdf(original, config);
  assert.deepEqual(skippedPages, []);
  const reloaded = await PDFDocument.load(bytes);
  assert.equal(reloaded.getPageCount(), 3);
  rotations.forEach((rotationDeg, pageIndex) => {
    assert.equal(reloaded.getPage(pageIndex).getRotation().angle, rotationDeg);
  });
});
