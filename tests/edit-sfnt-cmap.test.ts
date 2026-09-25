import assert from "node:assert/strict";
import test from "node:test";
import { parseSfntGlyphCoverage } from "../lib/pdf/edit/sfntCmap.ts";

function align4(value: number): number {
  return (value + 3) & ~3;
}

function tag(view: DataView, offset: number, value: string) {
  for (let index = 0; index < 4; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function sfntWithCmap(
  subtable: Uint8Array,
  platformId: number,
  encodingId: number,
): Uint8Array {
  const directoryLength = 12 + 2 * 16;
  const cmapLength = 12 + subtable.byteLength;
  const cmapOffset = directoryLength;
  const maxpOffset = align4(cmapOffset + cmapLength);
  const total = maxpOffset + 6;
  const bytes = new Uint8Array(total);
  const view = new DataView(bytes.buffer);

  view.setUint32(0, 0x00010000, false);
  view.setUint16(4, 2, false);

  tag(view, 12, "cmap");
  view.setUint32(12 + 8, cmapOffset, false);
  view.setUint32(12 + 12, cmapLength, false);

  tag(view, 28, "maxp");
  view.setUint32(28 + 8, maxpOffset, false);
  view.setUint32(28 + 12, 6, false);

  view.setUint16(cmapOffset, 0, false);
  view.setUint16(cmapOffset + 2, 1, false);
  view.setUint16(cmapOffset + 4, platformId, false);
  view.setUint16(cmapOffset + 6, encodingId, false);
  view.setUint32(cmapOffset + 8, 12, false);
  bytes.set(subtable, cmapOffset + 12);

  view.setUint32(maxpOffset, 0x00010000, false);
  view.setUint16(maxpOffset + 4, 10, false);
  return bytes;
}

function format4AB(): Uint8Array {
  const bytes = new Uint8Array(32);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, 4, false);
  view.setUint16(2, 32, false);
  view.setUint16(4, 0, false);
  view.setUint16(6, 4, false); // two segments
  view.setUint16(8, 4, false);
  view.setUint16(10, 1, false);
  view.setUint16(12, 0, false);

  // endCode
  view.setUint16(14, 0x0042, false);
  view.setUint16(16, 0xffff, false);
  view.setUint16(18, 0, false); // reservedPad
  // startCode
  view.setUint16(20, 0x0041, false);
  view.setUint16(22, 0xffff, false);
  // idDelta: A(65)->gid3, B(66)->gid4.
  view.setInt16(24, 3 - 0x0041, false);
  view.setInt16(26, 1, false);
  // idRangeOffset
  view.setUint16(28, 0, false);
  view.setUint16(30, 0, false);
  return bytes;
}

function format12Emoji(): Uint8Array {
  const bytes = new Uint8Array(28);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, 12, false);
  view.setUint16(2, 0, false);
  view.setUint32(4, 28, false);
  view.setUint32(8, 0, false);
  view.setUint32(12, 1, false);
  view.setUint32(16, 0x1f600, false);
  view.setUint32(20, 0x1f600, false);
  view.setUint32(24, 5, false);
  return bytes;
}

test("parseSfntGlyphCoverage resolves Unicode format 4 glyphs without expanding the font", () => {
  const coverage = parseSfntGlyphCoverage(sfntWithCmap(format4AB(), 3, 1));
  assert.ok(coverage);
  assert.deepEqual(coverage.formats, [4]);
  assert.equal(coverage.glyphCount, 10);
  assert.equal(coverage.unicodeSubtableCount, 1);
  assert.equal(coverage.glyphIdForCodePoint(0x41), 3);
  assert.equal(coverage.glyphIdForCodePoint(0x42), 4);
  assert.equal(coverage.glyphIdForCodePoint(0x43), null);
  assert.equal(coverage.hasCodePoint(0x41), true);
  assert.equal(coverage.hasCodePoint(0x43), false);
});

test("parseSfntGlyphCoverage resolves supplementary Unicode through format 12", () => {
  const coverage = parseSfntGlyphCoverage(sfntWithCmap(format12Emoji(), 3, 10));
  assert.ok(coverage);
  assert.deepEqual(coverage.formats, [12]);
  assert.equal(coverage.glyphIdForCodePoint(0x1f600), 5);
  assert.equal(coverage.hasCodePoint(0x1f600), true);
  assert.equal(coverage.hasCodePoint(0x1f601), false);
});

test("parseSfntGlyphCoverage rejects Windows Symbol cmap as Unicode proof", () => {
  const coverage = parseSfntGlyphCoverage(sfntWithCmap(format4AB(), 3, 0));
  assert.equal(coverage, null);
});

test("parseSfntGlyphCoverage fails closed on malformed offsets", () => {
  const bytes = sfntWithCmap(format4AB(), 3, 1);
  const view = new DataView(bytes.buffer);
  const cmapOffset = view.getUint32(20, false);
  view.setUint32(cmapOffset + 8, 0xffffff00, false);
  assert.equal(parseSfntGlyphCoverage(bytes), null);
});
