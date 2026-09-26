import assert from "node:assert/strict";
import test from "node:test";
import {
  getHarfBuzzRuntimeInfo,
  MAX_SHAPING_FONT_BYTES,
  MAX_SHAPING_TEXT_UTF16_UNITS,
  shapeEmbeddedFontText,
  TextShapingError,
} from "../lib/pdf/edit/harfbuzzShaping.ts";

function align4(value: number): number {
  return (value + 3) & ~3;
}

function writeTag(view: DataView, offset: number, value: string) {
  for (let index = 0; index < 4; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function checksum(bytes: Uint8Array): number {
  const padded = align4(bytes.length);
  let sum = 0;
  for (let offset = 0; offset < padded; offset += 4) {
    const word =
      ((bytes[offset] ?? 0) << 24) |
      ((bytes[offset + 1] ?? 0) << 16) |
      ((bytes[offset + 2] ?? 0) << 8) |
      (bytes[offset + 3] ?? 0);
    sum = (sum + (word >>> 0)) >>> 0;
  }
  return sum;
}

function cmapTable(): Uint8Array {
  const format4 = new Uint8Array(32);
  const f = new DataView(format4.buffer);
  f.setUint16(0, 4, false);
  f.setUint16(2, 32, false);
  f.setUint16(4, 0, false);
  f.setUint16(6, 4, false); // two segments: A-B and sentinel
  f.setUint16(8, 4, false);
  f.setUint16(10, 1, false);
  f.setUint16(12, 0, false);
  f.setUint16(14, 0x0042, false);
  f.setUint16(16, 0xffff, false);
  f.setUint16(18, 0, false);
  f.setUint16(20, 0x0041, false);
  f.setUint16(22, 0xffff, false);
  f.setInt16(24, 1 - 0x0041, false); // A -> gid 1, B -> gid 2
  f.setInt16(26, 1, false);
  f.setUint16(28, 0, false);
  f.setUint16(30, 0, false);

  const cmap = new Uint8Array(12 + format4.length);
  const view = new DataView(cmap.buffer);
  view.setUint16(0, 0, false);
  view.setUint16(2, 1, false);
  view.setUint16(4, 3, false);
  view.setUint16(6, 1, false);
  view.setUint32(8, 12, false);
  cmap.set(format4, 12);
  return cmap;
}

function syntheticShapingFont(): Uint8Array {
  const head = new Uint8Array(54);
  const headView = new DataView(head.buffer);
  headView.setUint32(0, 0x00010000, false);
  headView.setUint32(12, 0x5f0f3cf5, false);
  headView.setUint16(18, 1000, false);
  headView.setInt16(36, 0, false);
  headView.setInt16(38, -200, false);
  headView.setInt16(40, 1000, false);
  headView.setInt16(42, 800, false);
  headView.setUint16(46, 8, false);
  headView.setInt16(48, 2, false);
  headView.setInt16(50, 0, false);
  headView.setInt16(52, 0, false);

  const hhea = new Uint8Array(36);
  const hheaView = new DataView(hhea.buffer);
  hheaView.setUint32(0, 0x00010000, false);
  hheaView.setInt16(4, 800, false);
  hheaView.setInt16(6, -200, false);
  hheaView.setUint16(10, 620, false);
  hheaView.setUint16(34, 3, false);

  const hmtx = new Uint8Array(12);
  const hmtxView = new DataView(hmtx.buffer);
  for (const [index, advance] of [500, 600, 620].entries()) {
    hmtxView.setUint16(index * 4, advance, false);
    hmtxView.setInt16(index * 4 + 2, 0, false);
  }

  const maxp = new Uint8Array(32);
  const maxpView = new DataView(maxp.buffer);
  maxpView.setUint32(0, 0x00010000, false);
  maxpView.setUint16(4, 3, false);

  const tables = [
    { tag: "cmap", bytes: cmapTable() },
    { tag: "head", bytes: head },
    { tag: "hhea", bytes: hhea },
    { tag: "hmtx", bytes: hmtx },
    { tag: "maxp", bytes: maxp },
  ];

  const numTables = tables.length;
  const directoryLength = 12 + numTables * 16;
  let cursor = directoryLength;
  const offsets = tables.map((table) => {
    cursor = align4(cursor);
    const offset = cursor;
    cursor += table.bytes.length;
    return offset;
  });
  const output = new Uint8Array(align4(cursor));
  const view = new DataView(output.buffer);

  view.setUint32(0, 0x00010000, false);
  view.setUint16(4, numTables, false);
  const maxPower = 2 ** Math.floor(Math.log2(numTables));
  view.setUint16(6, maxPower * 16, false);
  view.setUint16(8, Math.log2(maxPower), false);
  view.setUint16(10, numTables * 16 - maxPower * 16, false);

  tables.forEach((table, index) => {
    const directory = 12 + index * 16;
    writeTag(view, directory, table.tag);
    view.setUint32(directory + 4, checksum(table.bytes), false);
    view.setUint32(directory + 8, offsets[index], false);
    view.setUint32(directory + 12, table.bytes.length, false);
    output.set(table.bytes, offsets[index]);
  });

  return output;
}

test("HarfBuzz runtime is pinned to the expected package and current core", async () => {
  const runtime = await getHarfBuzzRuntimeInfo();
  assert.equal(runtime.packageVersion, "1.6.2");
  assert.match(runtime.engineVersion, /^14\.5\.0(?:$|[-+])/);
});

test("HarfBuzz shapes a synthetic SFNT into deterministic glyph IDs and advances", async () => {
  const shaped = await shapeEmbeddedFontText(
    syntheticShapingFont(),
    "AB",
    { direction: "ltr", script: "Latn", language: "en" },
  );

  assert.equal(shaped.engine, "harfbuzz");
  assert.equal(shaped.unitsPerEm, 1000);
  assert.deepEqual(shaped.glyphs.map((glyph) => glyph.glyphId), [1, 2]);
  assert.deepEqual(shaped.glyphs.map((glyph) => glyph.xAdvance), [600, 620]);
  assert.deepEqual(shaped.glyphs.map((glyph) => glyph.clusterUtf16), [0, 1]);
  assert.equal(shaped.totalXAdvance, 1220);
  assert.equal(shaped.totalAdvance, 1220);
  assert.equal(shaped.totalAdvanceEm, 1.22);
  assert.equal(shaped.requestedDirection, "ltr");
  assert.deepEqual(
    shaped.clusterMap.map((cluster) => [cluster.startUtf16, cluster.endUtf16, cluster.text]),
    [
      [0, 1, "A"],
      [1, 2, "B"],
    ],
  );
});

test("HarfBuzz clusters stay in JavaScript UTF-16 offsets for non-BMP text", async () => {
  const text = "A😀B";
  const shaped = await shapeEmbeddedFontText(
    syntheticShapingFont(),
    text,
    { direction: "ltr", script: "Latn", language: "en" },
  );

  // harfbuzzjs Buffer.addText() is UTF-16 based. Even though the synthetic
  // font has no emoji glyph, source clusters must still map to JS string
  // offsets: A=0, emoji surrogate pair starts at 1, B starts at 3.
  assert.deepEqual(
    Array.from(new Set(shaped.glyphs.map((glyph) => glyph.clusterUtf16))).sort(
      (a, b) => a - b,
    ),
    [0, 1, 3],
  );
  assert.deepEqual(
    shaped.clusterMap.map((cluster) => [
      cluster.startUtf16,
      cluster.endUtf16,
      cluster.text,
    ]),
    [
      [0, 1, "A"],
      [1, 3, "😀"],
      [3, 4, "B"],
    ],
  );
});

test("HarfBuzz shaping fails closed on empty, oversized and malformed font input", async () => {
  await assert.rejects(
    () => shapeEmbeddedFontText(new Uint8Array(), "A"),
    (error: unknown) => error instanceof TextShapingError && error.code === "EMPTY_FONT",
  );
  await assert.rejects(
    () => shapeEmbeddedFontText(new Uint8Array(MAX_SHAPING_FONT_BYTES + 1), "A"),
    (error: unknown) => error instanceof TextShapingError && error.code === "FONT_TOO_LARGE",
  );
  await assert.rejects(
    () => shapeEmbeddedFontText(new Uint8Array([1, 2, 3, 4]), "A"),
    (error: unknown) => error instanceof TextShapingError && error.code === "INVALID_FONT",
  );
});

test("HarfBuzz shaping bounds replacement text before invoking the WASM engine", async () => {
  const tooLong = "A".repeat(MAX_SHAPING_TEXT_UTF16_UNITS + 1);
  await assert.rejects(
    () => shapeEmbeddedFontText(syntheticShapingFont(), tooLong),
    (error: unknown) => error instanceof TextShapingError && error.code === "TEXT_TOO_LARGE",
  );
});
