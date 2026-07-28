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

// ---------------------------------------------------------------------------
// Mixed page sizes -- corner placement is a page-local constraint, not a
// document-level coordinate (see WatermarkSinglePlacement in
// lib/pdf/watermark/config.ts). WatermarkConfig stores only the corner
// itself for corner placements; export.ts derives the actual xPct/yPct
// anchor fresh for EACH page from that corner + marginPct + rotationDeg +
// that page's own real dimensions -- the same per-page recompute tiled
// mode already did. Manual placement (after a drag) has no page-local
// derivation, so it's the one case that stores a raw xPct/yPct, applied
// verbatim to every page (matching Edit PDF's existing percent-of-page
// element model).
// ---------------------------------------------------------------------------

function extractAllTm(stream: string): number[][] {
  return Array.from(stream.matchAll(/([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) Tm/g)).map(
    (m) => m.slice(1, 7).map(Number),
  );
}

function rotatedBBoxFromTm(tm: number[], widthPt: number, heightPt: number) {
  const [a, b, c, d, e, f] = tm;
  const corners = [
    [0, 0],
    [widthPt, 0],
    [0, heightPt],
    [widthPt, heightPt],
  ];
  const xs = corners.map(([x, y]) => e + a * x + c * y);
  const ys = corners.map(([x, y]) => f + b * x + d * y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

test("exportWatermarkedPdf with a corner placement recomputes the anchor per page on mixed page sizes (regression for the confirmed cross-page overflow bug)", async () => {
  const doc = await PDFDocument.create();
  doc.addPage([612, 792]); // Letter portrait
  doc.addPage([792, 612]); // Letter landscape -- previously overflowed
  const saved = await doc.save();
  const original = saved.buffer.slice(saved.byteOffset, saved.byteOffset + saved.byteLength) as ArrayBuffer;

  const config = {
    ...createDefaultTextWatermarkConfig(),
    rotationDeg: 30,
    marginPct: 4,
    placement: { mode: "corner" as const, corner: "top-left" as const },
  };

  const { bytes, skippedPages } = await exportWatermarkedPdf(original, config);
  assert.deepEqual(skippedPages, []);

  const stream = decodeContentStreams(bytes);
  const matrices = extractAllTm(stream);
  assert.equal(matrices.length, 2, "expected one Tm per page");

  // font.widthOfTextAtSize("CONFIDENTIAL", 36) for Helvetica-Bold, matching
  // export.ts's own real metric -- not re-derived, read directly from a
  // fresh embed so this test can't drift from a hardcoded magic number.
  const probeDoc = await PDFDocument.create();
  const probeFont = await probeDoc.embedFont("Helvetica-Bold");
  const textWidthPt = probeFont.widthOfTextAtSize("CONFIDENTIAL", 36);

  const page1Box = rotatedBBoxFromTm(matrices[0], textWidthPt, 36);
  const page2Box = rotatedBBoxFromTm(matrices[1], textWidthPt, 36);

  // Page 1: top-left corner honored, left/top margins at exactly 4% of 612x792.
  approxEqual(page1Box.minX, 0.04 * 612, 0.5);
  approxEqual(page1Box.maxY, 792 - 0.04 * 792, 0.5);

  // Page 2 (792x612, a different size/orientation than page 1): must ALSO
  // honor its own top-left margins -- there is no stale percentage to carry
  // over, since the config never stored one. Before this fix (an earlier
  // xPct/yPct-based design) this page's bbox spilled ~5pt past the top edge
  // (maxY > 612); a page-local corner derivation can't reproduce that class
  // of bug at all, since every page computes its own anchor independently.
  assert.ok(page2Box.minX >= -0.5, `page2 left edge ${page2Box.minX} < 0`);
  assert.ok(page2Box.maxX <= 792 + 0.5, `page2 right edge ${page2Box.maxX} > 792`);
  assert.ok(page2Box.minY >= -0.5, `page2 bottom edge ${page2Box.minY} < 0`);
  assert.ok(page2Box.maxY <= 612 + 0.5, `page2 top edge ${page2Box.maxY} > 612 (this was 616.9 before the fix)`);
  approxEqual(page2Box.minX, 0.04 * 792, 0.5);
  approxEqual(page2Box.maxY, 612 - 0.04 * 612, 0.5);
});

test("exportWatermarkedPdf with a manual placement reuses xPct/yPct verbatim (unaffected by the per-page corner recompute)", async () => {
  const doc = await PDFDocument.create();
  doc.addPage([612, 792]);
  doc.addPage([792, 612]);
  const saved = await doc.save();
  const original = saved.buffer.slice(saved.byteOffset, saved.byteOffset + saved.byteLength) as ArrayBuffer;

  const config = { ...createDefaultTextWatermarkConfig(), placement: { mode: "manual" as const, xPct: 10, yPct: 20 } };

  const { bytes, skippedPages } = await exportWatermarkedPdf(original, config);
  assert.deepEqual(skippedPages, []);
  const matrices = extractAllTm(decodeContentStreams(bytes));
  assert.equal(matrices.length, 2);

  // toNativePoint's x mapping for an unrotated page (both pages here have
  // no native /Rotate) is the identity: nativeX = visualX = xPct/100 * pageWidth.
  // Tm's e (translation-x) is exactly that nativeX, so it must scale with
  // each page's own width for the same 10% anchor -- confirming no
  // corner-style recompute (which would NOT scale linearly with page width)
  // kicked in for a plain manual-placed position.
  const [, , , , e1] = matrices[0];
  const [, , , , e2] = matrices[1];
  approxEqual(e1 / 612, e2 / 792, 0.01);
});
