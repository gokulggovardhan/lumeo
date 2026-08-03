import assert from "node:assert/strict";
import test from "node:test";
import zlib from "node:zlib";
import { PDFDocument, degrees } from "pdf-lib";
import { exportHeaderFooterPdf } from "../lib/pdf/headerFooter/export.ts";
import { createDefaultHeaderFooterConfig } from "../lib/pdf/headerFooter/config.ts";

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
  doc.addPage([612, 792]);
  doc.addPage([420, 595]);
  doc.addPage([1000, 1400]);
  const bytes = await doc.save();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

// Same technique used in tests/watermark-export.test.ts and
// tests/page-numbers-export.test.ts.
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

test("exportHeaderFooterPdf draws footer only by default (one Tj per page)", async () => {
  const original = await makeBlankPdf(3);
  const config = createDefaultHeaderFooterConfig();
  const { bytes, skippedPages } = await exportHeaderFooterPdf(original, config, "test.pdf");
  assert.deepEqual(skippedPages, []);
  assert.equal(countDrawnTextOps(bytes), 3);
});

test("exportHeaderFooterPdf draws two Tj per page when both header and footer are enabled", async () => {
  const original = await makeBlankPdf(2);
  const config = { ...createDefaultHeaderFooterConfig(), header: { enabled: true, template: "{filename}", prefix: "", suffix: "", alignment: "left" as const } };
  const { bytes, skippedPages } = await exportHeaderFooterPdf(original, config, "report.pdf");
  assert.deepEqual(skippedPages, []);
  assert.equal(countDrawnTextOps(bytes), 4);
});

test("exportHeaderFooterPdf draws nothing when both zones are disabled", async () => {
  const original = await makeBlankPdf(2);
  const config = { ...createDefaultHeaderFooterConfig(), footer: { ...createDefaultHeaderFooterConfig().footer, enabled: false } };
  const { bytes, skippedPages } = await exportHeaderFooterPdf(original, config, "test.pdf");
  assert.deepEqual(skippedPages, []);
  assert.equal(countDrawnTextOps(bytes), 0);
  const reloaded = await PDFDocument.load(bytes);
  assert.equal(reloaded.getPageCount(), 2);
});

test("exportHeaderFooterPdf respects odd/even/custom page ranges", async () => {
  const original = await makeBlankPdf(6);
  const base = createDefaultHeaderFooterConfig();

  const odd = await exportHeaderFooterPdf(original, { ...base, pageRange: { mode: "odd" } }, "x.pdf");
  assert.equal(countDrawnTextOps(odd.bytes), 3);

  const even = await exportHeaderFooterPdf(original, { ...base, pageRange: { mode: "even" } }, "x.pdf");
  assert.equal(countDrawnTextOps(even.bytes), 3);

  const custom = await exportHeaderFooterPdf(original, { ...base, pageRange: { mode: "custom", pages: [0, 3] } }, "x.pdf");
  assert.equal(countDrawnTextOps(custom.bytes), 2);
});

test("exportHeaderFooterPdf firstPageDifferent draws the override zone only on the first selected page", async () => {
  const original = await makeBlankPdf(3);
  const config = {
    ...createDefaultHeaderFooterConfig(),
    firstPageDifferent: true,
    firstPageFooter: { enabled: true, template: "COVER", prefix: "", suffix: "", alignment: "center" as const },
  };
  const { bytes, skippedPages } = await exportHeaderFooterPdf(original, config, "x.pdf");
  assert.deepEqual(skippedPages, []);
  // 1 Tj on page 1 (firstPageFooter "COVER") + 1 Tj each on pages 2-3 (default footer "{page}") = 3 total.
  assert.equal(countDrawnTextOps(bytes), 3);
});

test("exportHeaderFooterPdf firstPageDifferent with an empty override draws nothing on page 1 but still numbers later pages", async () => {
  const original = await makeBlankPdf(3);
  const config = {
    ...createDefaultHeaderFooterConfig(),
    firstPageDifferent: true,
    // firstPageFooter stays default-disabled -> nothing drawn on page 1
  };
  const { bytes } = await exportHeaderFooterPdf(original, config, "x.pdf");
  assert.equal(countDrawnTextOps(bytes), 2); // pages 2 and 3 only
});

test("exportHeaderFooterPdf handles a document with mixed page sizes without error", async () => {
  const original = await makeMixedSizePdf();
  const config = createDefaultHeaderFooterConfig();
  const { bytes, skippedPages } = await exportHeaderFooterPdf(original, config, "x.pdf");
  assert.deepEqual(skippedPages, []);
  assert.equal(countDrawnTextOps(bytes), 3);
});

test("exportHeaderFooterPdf handles rotated pages (90/180/270deg) without error", async () => {
  for (const rotationDeg of [90, 180, 270]) {
    const original = await makeBlankPdf(2, rotationDeg);
    const config = createDefaultHeaderFooterConfig();
    const { bytes, skippedPages } = await exportHeaderFooterPdf(original, config, "x.pdf");
    assert.deepEqual(skippedPages, [], `rotation ${rotationDeg}`);
    assert.equal(countDrawnTextOps(bytes), 2, `rotation ${rotationDeg}`);
    const reloaded = await PDFDocument.load(bytes);
    assert.equal(reloaded.getPages()[0].getRotation().angle, rotationDeg);
  }
});

test("exportHeaderFooterPdf all three alignments export without error, for both header and footer", async () => {
  const original = await makeBlankPdf(1);
  for (const alignment of ["left", "center", "right"] as const) {
    const config = {
      ...createDefaultHeaderFooterConfig(),
      header: { enabled: true, template: "H", prefix: "", suffix: "", alignment },
      footer: { enabled: true, template: "F", prefix: "", suffix: "", alignment },
    };
    const { skippedPages } = await exportHeaderFooterPdf(original, config, "x.pdf");
    assert.deepEqual(skippedPages, [], alignment);
  }
});

test("exportHeaderFooterPdf {filename} placeholder uses the provided filename argument", async () => {
  const original = await makeBlankPdf(1);
  const config = { ...createDefaultHeaderFooterConfig(), footer: { enabled: true, template: "{filename}", prefix: "", suffix: "", alignment: "center" as const } };
  const { bytes, skippedPages } = await exportHeaderFooterPdf(original, config, "annual-report.pdf");
  assert.deepEqual(skippedPages, []);
  assert.equal(countDrawnTextOps(bytes), 1);
});

test("exportHeaderFooterPdf preserves the original document's page count and metadata title", async () => {
  const doc = await PDFDocument.create();
  doc.setTitle("My Document");
  doc.addPage([612, 792]);
  const bytes0 = await doc.save();
  const original = bytes0.buffer.slice(bytes0.byteOffset, bytes0.byteOffset + bytes0.byteLength) as ArrayBuffer;

  const config = createDefaultHeaderFooterConfig();
  const { bytes } = await exportHeaderFooterPdf(original, config, "x.pdf");
  const reloaded = await PDFDocument.load(bytes);
  assert.equal(reloaded.getPageCount(), 1);
  assert.equal(reloaded.getTitle(), "My Document");
});

test("exportHeaderFooterPdf on an empty page-range selection draws nothing and preserves page count", async () => {
  const original = await makeBlankPdf(2);
  const config = { ...createDefaultHeaderFooterConfig(), pageRange: { mode: "custom" as const, pages: [] } };
  const { bytes, skippedPages } = await exportHeaderFooterPdf(original, config, "x.pdf");
  assert.deepEqual(skippedPages, []);
  assert.equal(countDrawnTextOps(bytes), 0);
  const reloaded = await PDFDocument.load(bytes);
  assert.equal(reloaded.getPageCount(), 2);
});
