import assert from "node:assert/strict";
import test from "node:test";
import zlib from "node:zlib";
import { PDFDocument, degrees } from "pdf-lib";
import { exportPageNumberedPdf } from "../lib/pdf/pageNumbers/export.ts";
import { createDefaultPageNumbersConfig } from "../lib/pdf/pageNumbers/config.ts";

async function makeBlankPdf(pageCount: number, rotationDeg = 0): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i += 1) {
    const page = doc.addPage([612, 792]);
    if (rotationDeg !== 0) page.setRotation(degrees(rotationDeg));
  }
  const bytes = await doc.save();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function makeMixedSizePdf(): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  doc.addPage([612, 792]); // US Letter
  doc.addPage([420, 595]); // A4-ish, smaller
  doc.addPage([1000, 1400]); // larger
  const bytes = await doc.save();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

// Same technique used in tests/watermark-export.test.ts: decompress every
// FlateDecode content stream and assert on the actual bytes pdf-lib wrote.
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
      // Not a compressed stream -- skip.
    }
    searchFrom = endIdx + endMarker.length;
  }
  return combined;
}

function countDrawnTextOps(bytes: Uint8Array): number {
  return decodeContentStreams(bytes).split("Tj").length - 1;
}

test("exportPageNumberedPdf draws one number per page by default", async () => {
  const original = await makeBlankPdf(5);
  const config = createDefaultPageNumbersConfig();
  const { bytes, skippedPages } = await exportPageNumberedPdf(original, config);
  assert.deepEqual(skippedPages, []);
  assert.equal(countDrawnTextOps(bytes), 5);
  const reloaded = await PDFDocument.load(bytes);
  assert.equal(reloaded.getPageCount(), 5);
});

test("exportPageNumberedPdf respects odd/even/custom page ranges", async () => {
  const original = await makeBlankPdf(6);

  const odd = await exportPageNumberedPdf(original, { ...createDefaultPageNumbersConfig(), pageRange: { mode: "odd" } });
  assert.equal(countDrawnTextOps(odd.bytes), 3); // pages 1,3,5

  const even = await exportPageNumberedPdf(original, { ...createDefaultPageNumbersConfig(), pageRange: { mode: "even" } });
  assert.equal(countDrawnTextOps(even.bytes), 3); // pages 2,4,6

  const custom = await exportPageNumberedPdf(original, { ...createDefaultPageNumbersConfig(), pageRange: { mode: "custom", pages: [0, 2, 5] } });
  assert.equal(countDrawnTextOps(custom.bytes), 3);

  const first = await exportPageNumberedPdf(original, { ...createDefaultPageNumbersConfig(), pageRange: { mode: "first" } });
  assert.equal(countDrawnTextOps(first.bytes), 1);
});

test("exportPageNumberedPdf skipFirstPage draws one fewer number but does not renumber later pages", async () => {
  const original = await makeBlankPdf(3);
  const withFirst = await exportPageNumberedPdf(original, createDefaultPageNumbersConfig());
  const withoutFirst = await exportPageNumberedPdf(original, { ...createDefaultPageNumbersConfig(), skipFirstPage: true });

  assert.equal(countDrawnTextOps(withFirst.bytes), 3);
  assert.equal(countDrawnTextOps(withoutFirst.bytes), 2);
});

test("exportPageNumberedPdf startNumber offsets the displayed sequence, not which pages are drawn", async () => {
  const original = await makeBlankPdf(2);
  const { bytes, skippedPages } = await exportPageNumberedPdf(original, { ...createDefaultPageNumbersConfig(), startNumber: 5 });
  assert.deepEqual(skippedPages, []);
  assert.equal(countDrawnTextOps(bytes), 2);
});

test("exportPageNumberedPdf handles a document with mixed page sizes without error", async () => {
  const original = await makeMixedSizePdf();
  const { bytes, skippedPages } = await exportPageNumberedPdf(original, createDefaultPageNumbersConfig());
  assert.deepEqual(skippedPages, []);
  assert.equal(countDrawnTextOps(bytes), 3);
  const reloaded = await PDFDocument.load(bytes);
  assert.equal(reloaded.getPageCount(), 3);
});

test("exportPageNumberedPdf handles rotated pages (90/180/270deg) without error, page-count preserved", async () => {
  for (const rotationDeg of [90, 180, 270]) {
    const original = await makeBlankPdf(2, rotationDeg);
    const { bytes, skippedPages } = await exportPageNumberedPdf(original, createDefaultPageNumbersConfig());
    assert.deepEqual(skippedPages, [], `rotation ${rotationDeg}`);
    assert.equal(countDrawnTextOps(bytes), 2, `rotation ${rotationDeg}`);
    const reloaded = await PDFDocument.load(bytes);
    assert.equal(reloaded.getPages()[0].getRotation().angle, rotationDeg);
  }
});

test("exportPageNumberedPdf corner placement (all 6 presets) draws successfully on every page", async () => {
  const original = await makeBlankPdf(1);
  const corners = ["top-left", "top-center", "top-right", "bottom-left", "bottom-center", "bottom-right"] as const;
  for (const corner of corners) {
    const config = { ...createDefaultPageNumbersConfig(), placement: { mode: "corner" as const, corner } };
    const { bytes, skippedPages } = await exportPageNumberedPdf(original, config);
    assert.deepEqual(skippedPages, [], corner);
    assert.equal(countDrawnTextOps(bytes), 1, corner);
  }
});

test("exportPageNumberedPdf manual placement draws successfully", async () => {
  const original = await makeBlankPdf(1);
  const config = { ...createDefaultPageNumbersConfig(), placement: { mode: "manual" as const, xPct: 45, yPct: 90 } };
  const { bytes, skippedPages } = await exportPageNumberedPdf(original, config);
  assert.deepEqual(skippedPages, []);
  assert.equal(countDrawnTextOps(bytes), 1);
});

test("exportPageNumberedPdf applies bold/italic font selection and custom color/opacity without error", async () => {
  const original = await makeBlankPdf(1);
  const config = { ...createDefaultPageNumbersConfig(), bold: true, italic: true, color: "#ff0000", opacity: 0.5, fontSizePt: 18 };
  const { bytes, skippedPages } = await exportPageNumberedPdf(original, config);
  assert.deepEqual(skippedPages, []);
  assert.equal(countDrawnTextOps(bytes), 1);
});

test("exportPageNumberedPdf all number formats and numeral styles export without error", async () => {
  const original = await makeBlankPdf(3);
  const formats = ["number", "page-x", "x-of-n", "x-slash-n"] as const;
  const styles = ["arabic", "roman-lower", "roman-upper", "alpha-lower", "alpha-upper"] as const;
  for (const numberFormat of formats) {
    for (const numeralStyle of styles) {
      const config = { ...createDefaultPageNumbersConfig(), numberFormat, numeralStyle };
      const { skippedPages } = await exportPageNumberedPdf(original, config);
      assert.deepEqual(skippedPages, [], `${numberFormat}/${numeralStyle}`);
    }
  }
});

test("exportPageNumberedPdf prefix/suffix export without error", async () => {
  const original = await makeBlankPdf(1);
  const config = { ...createDefaultPageNumbersConfig(), prefix: "-- ", suffix: " --" };
  const { bytes, skippedPages } = await exportPageNumberedPdf(original, config);
  assert.deepEqual(skippedPages, []);
  assert.equal(countDrawnTextOps(bytes), 1);
});

test("exportPageNumberedPdf on an empty page-range selection (custom, no valid pages) draws nothing", async () => {
  const original = await makeBlankPdf(2);
  const config = { ...createDefaultPageNumbersConfig(), pageRange: { mode: "custom" as const, pages: [] } };
  const { bytes, skippedPages } = await exportPageNumberedPdf(original, config);
  assert.deepEqual(skippedPages, []);
  assert.equal(countDrawnTextOps(bytes), 0);
  const reloaded = await PDFDocument.load(bytes);
  assert.equal(reloaded.getPageCount(), 2);
});
