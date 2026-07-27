import assert from "node:assert/strict";
import test from "node:test";
import zlib from "node:zlib";
import { PDFDocument, degrees } from "pdf-lib";
import { exportEditedPdf } from "../lib/pdf/edit/export.ts";
import {
  createInkElement,
  createShapeElement,
  createTextElement,
  createWhiteoutElement,
} from "../lib/pdf/edit/elements.ts";

// A minimal valid 1x1 PNG, used as the ink element's data URL -- Node's
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
// concatenated plaintext content-stream operators, so tests can assert on
// the exact numbers pdf-lib wrote (not just "did export succeed") --
// independent verification of the rotation math, not a re-check of
// export.ts's own formulas.
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
      // Not a compressed stream (or not flate) -- skip, not every stream in
      // the file is content-stream data (fonts, images, etc.).
    }
    searchFrom = endIdx + endMarker.length;
  }
  return combined;
}

function approxEqual(actual: number, expected: number, tolerance = 0.01) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `expected ~${expected}, got ${actual}`);
}

test("exportEditedPdf returns valid PDF bytes with no elements", async () => {
  const original = await makeBlankPdf(1);
  const { bytes, skippedPages } = await exportEditedPdf(original, []);
  const reloaded = await PDFDocument.load(bytes);
  assert.equal(reloaded.getPageCount(), 1);
  assert.deepEqual(skippedPages, []);
});

test("exportEditedPdf draws a text element onto its page", async () => {
  const original = await makeBlankPdf(1);
  const element = createTextElement("t1", 0, 20, 20);
  const withText = { ...element, text: "Hello" };
  const { bytes } = await exportEditedPdf(original, [withText]);
  const reloaded = await PDFDocument.load(bytes);
  assert.equal(reloaded.getPageCount(), 1);
  // A page with real drawn text/graphics content is larger than a blank one.
  assert.ok(bytes.byteLength > original.byteLength);
});

test("exportEditedPdf draws shape and whiteout elements", async () => {
  const original = await makeBlankPdf(1);
  const rect = createShapeElement("s1", 0, 10, 10, "rect");
  const whiteout = createWhiteoutElement("w1", 0, 40, 40);
  const { bytes, skippedPages } = await exportEditedPdf(original, [rect, whiteout]);
  const reloaded = await PDFDocument.load(bytes);
  assert.equal(reloaded.getPageCount(), 1);
  assert.deepEqual(skippedPages, []);
  assert.ok(bytes.byteLength > original.byteLength);
});

test("exportEditedPdf skips a page whose index doesn't exist, without throwing", async () => {
  const original = await makeBlankPdf(1);
  const outOfRange = createTextElement("t2", 5, 10, 10);
  const withText = { ...outOfRange, text: "orphaned" };
  const { bytes, skippedPages } = await exportEditedPdf(original, [withText]);
  const reloaded = await PDFDocument.load(bytes);
  assert.equal(reloaded.getPageCount(), 1);
  assert.deepEqual(skippedPages, []); // out-of-range elements are silently skipped per-element, not counted as a page failure
});

test("exportEditedPdf ignores an empty text element (nothing to draw)", async () => {
  const original = await makeBlankPdf(1);
  const empty = createTextElement("t3", 0, 10, 10); // text: ""
  const { bytes } = await exportEditedPdf(original, [empty]);
  const reloaded = await PDFDocument.load(bytes);
  assert.equal(reloaded.getPageCount(), 1);
  assert.ok(bytes.byteLength >= original.byteLength);
});

// ---------------------------------------------------------------------------
// Rotation-aware export
//
// Native page is always 612x792 (portrait). For rotation 90/270, pdfjs's
// rotation-aware viewport (what the preview's percent coordinates are
// relative to) reports a swapped, landscape 792x612 -- so a visual point is
// converted to points using the SWAPPED dimensions before being mapped back
// into the page's native (unrotated) space.
// ---------------------------------------------------------------------------

for (const rotation of [90, 180, 270] as const) {
  test(`exportEditedPdf preserves the page's rotation metadata (${rotation}deg)`, async () => {
    const original = await makeBlankPdf(1, rotation);
    const element = createTextElement("t1", 0, 10, 10);
    const { bytes } = await exportEditedPdf(original, [{ ...element, text: "Hi" }]);
    const reloaded = await PDFDocument.load(bytes);
    assert.equal(reloaded.getPage(0).getRotation().angle, rotation);
  });

  test(`exportEditedPdf keeps text upright by countering the page rotation (${rotation}deg)`, async () => {
    const original = await makeBlankPdf(1, rotation);
    const element = { ...createTextElement("t1", 0, 0, 0), text: "Hi" }; // visual top-left corner
    const { bytes } = await exportEditedPdf(original, [element]);
    const stream = decodeContentStreams(bytes);
    const match = stream.match(/([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) Tm/);
    assert.ok(match, "expected a text matrix (Tm) operator in the exported content stream");
    const [, a, b, c, d] = match!.map(Number) as unknown as number[];
    const radians = (rotation * Math.PI) / 180;
    approxEqual(a, Math.cos(radians));
    approxEqual(b, Math.sin(radians));
    approxEqual(c, -Math.sin(radians));
    approxEqual(d, Math.cos(radians));
  });

  test(`exportEditedPdf draws a rectangle whose native box swaps dimensions correctly (${rotation}deg)`, async () => {
    const original = await makeBlankPdf(1, rotation);
    // A wide, short rectangle in visual space (20% wide, 5% tall).
    const rect = { ...createShapeElement("s1", 0, 0, 0, "rect"), widthPct: 20, heightPct: 5 };
    const { bytes, skippedPages } = await exportEditedPdf(original, [rect]);
    assert.deepEqual(skippedPages, []);
    const stream = decodeContentStreams(bytes);
    // translate cm ("1 0 0 1 x y cm") immediately followed by the path's
    // opposite corner via lineTo -- extract both to reconstruct the drawn
    // box's width/height in native points.
    // Path is moveTo(0,0), lineTo(0,height), lineTo(width,height), lineTo(width,0)
    // -- the second lineTo carries the box's full width/height.
    const cornerMatch = stream.match(/0 0 m\n[-\d.]+ [-\d.]+ l\n([-\d.]+) ([-\d.]+) l/);
    assert.ok(cornerMatch, "expected the rectangle's path corners in the content stream");
    const nativeWidth = Number(cornerMatch![1]);
    const nativeHeight = Number(cornerMatch![2]);
    if (rotation === 90 || rotation === 270) {
      // Visual page is 792x612 (swapped from the native 612x792) for 90/270,
      // so 20%-wide x 5%-tall in visual space is 158.4 x 30.6pt visually --
      // axis-swapped again when mapped back into native space.
      approxEqual(Math.abs(nativeWidth), (5 / 100) * 612, 1);
      approxEqual(Math.abs(nativeHeight), (20 / 100) * 792, 1);
    } else {
      approxEqual(Math.abs(nativeWidth), (20 / 100) * 612, 1);
      approxEqual(Math.abs(nativeHeight), (5 / 100) * 792, 1);
    }
  });

  test(`exportEditedPdf draws a line between independently-mapped native endpoints (${rotation}deg)`, async () => {
    const original = await makeBlankPdf(1, rotation);
    const line = { ...createShapeElement("l1", 0, 10, 10, "line"), widthPct: 30, heightPct: 30 };
    const { bytes, skippedPages } = await exportEditedPdf(original, [line]);
    assert.deepEqual(skippedPages, []);
    const stream = decodeContentStreams(bytes);
    // drawLine emits `moveTo(start)` then `lineTo(end)` as raw m/l operators
    // in native page space (no translate/rotate wrapper, unlike rect/image).
    const match = stream.match(/([-\d.]+) ([-\d.]+) m\n([-\d.]+) ([-\d.]+) l/);
    assert.ok(match, "expected moveTo/lineTo operators for the line");
    const [, startX, startY, endX, endY] = match!.map(Number) as unknown as number[];
    // Both endpoints must land inside the native page bounds -- the
    // catastrophic failure mode of the original bug was coordinates far
    // outside [0, nativeWidth] x [0, nativeHeight] for 90/270deg.
    for (const value of [startX, startY]) assert.ok(value >= -1 && value <= 792 + 1);
    for (const value of [endX, endY]) assert.ok(value >= -1 && value <= 792 + 1);
    assert.notEqual(startX, endX);
    assert.notEqual(startY, endY);
  });

  test(`exportEditedPdf draws an ink element with a counter-rotated image (${rotation}deg)`, async () => {
    const original = await makeBlankPdf(1, rotation);
    const ink = createInkElement("i1", 0, 10, 10, 15, 15, TINY_PNG_DATA_URL);
    const { bytes, skippedPages } = await exportEditedPdf(original, [ink]);
    assert.deepEqual(skippedPages, []);
    const reloaded = await PDFDocument.load(bytes);
    assert.equal(reloaded.getPageCount(), 1);
    const stream = decodeContentStreams(bytes);
    // drawImage emits four cm lines in order (translate, rotate, scale,
    // skew) before the XObject draw -- the second cm line is the rotation.
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

  test(`exportEditedPdf draws an ellipse and a whiteout without throwing (${rotation}deg)`, async () => {
    const original = await makeBlankPdf(1, rotation);
    const ellipse = createShapeElement("e1", 0, 30, 30, "ellipse");
    const highlight = createShapeElement("h1", 0, 5, 5, "highlight");
    const whiteout = createWhiteoutElement("w1", 0, 60, 60);
    const { bytes, skippedPages } = await exportEditedPdf(original, [ellipse, highlight, whiteout]);
    assert.deepEqual(skippedPages, []);
    const reloaded = await PDFDocument.load(bytes);
    assert.equal(reloaded.getPageCount(), 1);
    assert.ok(bytes.byteLength > original.byteLength);
  });
}

test("exportEditedPdf handles a mixed-orientation document without cross-page leakage", async () => {
  const doc = await PDFDocument.create();
  const rotations = [0, 90, 180] as const;
  for (const rotationDeg of rotations) {
    const page = doc.addPage([612, 792]);
    if (rotationDeg !== 0) page.setRotation(degrees(rotationDeg));
  }
  const saved = await doc.save();
  const original = saved.buffer.slice(saved.byteOffset, saved.byteOffset + saved.byteLength) as ArrayBuffer;

  const elements = rotations.map((_, pageIndex) => ({
    ...createTextElement(`t${pageIndex}`, pageIndex, 10, 10),
    text: `page ${pageIndex}`,
  }));

  const { bytes, skippedPages } = await exportEditedPdf(original, elements);
  assert.deepEqual(skippedPages, []);
  const reloaded = await PDFDocument.load(bytes);
  assert.equal(reloaded.getPageCount(), 3);
  rotations.forEach((rotationDeg, pageIndex) => {
    assert.equal(reloaded.getPage(pageIndex).getRotation().angle, rotationDeg);
  });
});
