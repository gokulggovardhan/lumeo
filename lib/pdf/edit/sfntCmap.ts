// Browser-local, read-only SFNT cmap inspection for embedded PDF fonts.
//
// Scope is deliberately narrow: TrueType/OpenType SFNT containers with
// Unicode cmap format 4 and/or 12 subtables. Unsupported containers or
// malformed tables return null instead of guessing. The parser never mutates
// font bytes and never becomes a writer; it only answers whether an embedded
// program provably contains a Unicode glyph.

export type SupportedSfntCmapFormat = 4 | 12;

export type SfntGlyphCoverage = {
  formats: readonly SupportedSfntCmapFormat[];
  glyphCount: number | null;
  unicodeSubtableCount: number;
  glyphIdForCodePoint: (codePoint: number) => number | null;
  hasCodePoint: (codePoint: number) => boolean;
};

type Format4Table = {
  format: 4;
  offset: number;
  length: number;
  segCount: number;
  endCodeOffset: number;
  startCodeOffset: number;
  idDeltaOffset: number;
  idRangeOffsetOffset: number;
};

type Format12Group = {
  start: number;
  end: number;
  startGlyphId: number;
};

type Format12Table = {
  format: 12;
  groups: readonly Format12Group[];
};

type SupportedTable = Format4Table | Format12Table;

const MAX_TABLES = 512;
const MAX_CMAP_SUBTABLES = 512;
const MAX_FORMAT4_SEGMENTS = 32768;
const MAX_FORMAT12_GROUPS = 100000;

function within(bytes: Uint8Array, offset: number, length: number): boolean {
  return (
    Number.isInteger(offset) &&
    Number.isInteger(length) &&
    offset >= 0 &&
    length >= 0 &&
    offset + length <= bytes.byteLength
  );
}

function u16(bytes: Uint8Array, offset: number): number | null {
  if (!within(bytes, offset, 2)) return null;
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function i16(bytes: Uint8Array, offset: number): number | null {
  const value = u16(bytes, offset);
  if (value === null) return null;
  return value >= 0x8000 ? value - 0x10000 : value;
}

function u32(bytes: Uint8Array, offset: number): number | null {
  if (!within(bytes, offset, 4)) return null;
  return (
    bytes[offset] * 0x1000000 +
    (bytes[offset + 1] << 16) +
    (bytes[offset + 2] << 8) +
    bytes[offset + 3]
  ) >>> 0;
}

function tag(bytes: Uint8Array, offset: number): string | null {
  if (!within(bytes, offset, 4)) return null;
  return String.fromCharCode(
    bytes[offset],
    bytes[offset + 1],
    bytes[offset + 2],
    bytes[offset + 3],
  );
}

function tableDirectory(
  bytes: Uint8Array,
): ReadonlyMap<string, { offset: number; length: number }> | null {
  if (!within(bytes, 0, 12)) return null;
  const numTables = u16(bytes, 4);
  if (numTables === null || numTables <= 0 || numTables > MAX_TABLES) return null;
  if (!within(bytes, 12, numTables * 16)) return null;

  const tables = new Map<string, { offset: number; length: number }>();
  for (let index = 0; index < numTables; index += 1) {
    const record = 12 + index * 16;
    const tableTag = tag(bytes, record);
    const offset = u32(bytes, record + 8);
    const length = u32(bytes, record + 12);
    if (!tableTag || offset === null || length === null || !within(bytes, offset, length)) {
      continue;
    }
    tables.set(tableTag, { offset, length });
  }
  return tables;
}

function isUnicodeCmapRecord(platformId: number, encodingId: number): boolean {
  // Platform 0 is Unicode. Windows platform 3 encoding 1 is Unicode BMP,
  // encoding 10 is full Unicode. Deliberately exclude Windows Symbol (3/0):
  // its character codes are not safe Unicode evidence for PDF simple fonts.
  return platformId === 0 || (platformId === 3 && (encodingId === 1 || encodingId === 10));
}

function parseFormat4(
  bytes: Uint8Array,
  offset: number,
  cmapEnd: number,
): Format4Table | null {
  const length = u16(bytes, offset + 2);
  const segCountX2 = u16(bytes, offset + 6);
  if (
    length === null ||
    segCountX2 === null ||
    length < 16 ||
    segCountX2 === 0 ||
    segCountX2 % 2 !== 0 ||
    !within(bytes, offset, length) ||
    offset + length > cmapEnd
  ) {
    return null;
  }

  const segCount = segCountX2 / 2;
  if (segCount > MAX_FORMAT4_SEGMENTS) return null;

  const endCodeOffset = offset + 14;
  const startCodeOffset = endCodeOffset + segCount * 2 + 2;
  const idDeltaOffset = startCodeOffset + segCount * 2;
  const idRangeOffsetOffset = idDeltaOffset + segCount * 2;
  if (!within(bytes, idRangeOffsetOffset, segCount * 2)) return null;
  if (idRangeOffsetOffset + segCount * 2 > offset + length) return null;

  return {
    format: 4,
    offset,
    length,
    segCount,
    endCodeOffset,
    startCodeOffset,
    idDeltaOffset,
    idRangeOffsetOffset,
  };
}

function parseFormat12(
  bytes: Uint8Array,
  offset: number,
  cmapEnd: number,
): Format12Table | null {
  const length = u32(bytes, offset + 4);
  const groupCount = u32(bytes, offset + 12);
  if (
    length === null ||
    groupCount === null ||
    length < 16 ||
    groupCount > MAX_FORMAT12_GROUPS ||
    !within(bytes, offset, length) ||
    offset + length > cmapEnd ||
    !within(bytes, offset + 16, groupCount * 12)
  ) {
    return null;
  }

  const groups: Format12Group[] = [];
  let previousEnd = -1;
  for (let index = 0; index < groupCount; index += 1) {
    const cursor = offset + 16 + index * 12;
    const start = u32(bytes, cursor);
    const end = u32(bytes, cursor + 4);
    const startGlyphId = u32(bytes, cursor + 8);
    if (
      start === null ||
      end === null ||
      startGlyphId === null ||
      start > end ||
      start <= previousEnd ||
      end > 0x10ffff
    ) {
      return null;
    }
    groups.push({ start, end, startGlyphId });
    previousEnd = end;
  }
  return { format: 12, groups };
}

function lookupFormat4(
  bytes: Uint8Array,
  table: Format4Table,
  codePoint: number,
  glyphCount: number | null,
): number | null {
  if (codePoint < 0 || codePoint > 0xffff) return null;

  let low = 0;
  let high = table.segCount - 1;
  while (low <= high) {
    const middle = (low + high) >>> 1;
    const end = u16(bytes, table.endCodeOffset + middle * 2);
    if (end === null) return null;
    if (codePoint > end) low = middle + 1;
    else high = middle - 1;
  }
  if (low >= table.segCount) return null;

  const start = u16(bytes, table.startCodeOffset + low * 2);
  const end = u16(bytes, table.endCodeOffset + low * 2);
  const delta = i16(bytes, table.idDeltaOffset + low * 2);
  const rangeOffset = u16(bytes, table.idRangeOffsetOffset + low * 2);
  if (
    start === null ||
    end === null ||
    delta === null ||
    rangeOffset === null ||
    codePoint < start ||
    codePoint > end
  ) {
    return null;
  }

  let glyphId: number;
  if (rangeOffset === 0) {
    glyphId = (codePoint + delta) & 0xffff;
  } else {
    const rangeWord = table.idRangeOffsetOffset + low * 2;
    const glyphOffset = rangeWord + rangeOffset + (codePoint - start) * 2;
    if (
      glyphOffset < table.offset ||
      glyphOffset + 2 > table.offset + table.length
    ) {
      return null;
    }
    const rawGlyph = u16(bytes, glyphOffset);
    if (rawGlyph === null || rawGlyph === 0) return null;
    glyphId = (rawGlyph + delta) & 0xffff;
  }

  if (glyphId === 0) return null;
  if (glyphCount !== null && glyphId >= glyphCount) return null;
  return glyphId;
}

function lookupFormat12(
  table: Format12Table,
  codePoint: number,
  glyphCount: number | null,
): number | null {
  if (codePoint < 0 || codePoint > 0x10ffff) return null;
  let low = 0;
  let high = table.groups.length - 1;
  while (low <= high) {
    const middle = (low + high) >>> 1;
    const group = table.groups[middle];
    if (codePoint < group.start) high = middle - 1;
    else if (codePoint > group.end) low = middle + 1;
    else {
      const glyphId = group.startGlyphId + (codePoint - group.start);
      if (glyphId === 0) return null;
      if (glyphCount !== null && glyphId >= glyphCount) return null;
      return glyphId;
    }
  }
  return null;
}

export function parseSfntGlyphCoverage(bytes: Uint8Array): SfntGlyphCoverage | null {
  const directory = tableDirectory(bytes);
  const cmap = directory?.get("cmap");
  if (!directory || !cmap || cmap.length < 4) return null;

  const maxp = directory.get("maxp");
  const glyphCount =
    maxp && maxp.length >= 6 ? u16(bytes, maxp.offset + 4) : null;

  const cmapVersion = u16(bytes, cmap.offset);
  const recordCount = u16(bytes, cmap.offset + 2);
  if (
    cmapVersion !== 0 ||
    recordCount === null ||
    recordCount <= 0 ||
    recordCount > MAX_CMAP_SUBTABLES ||
    !within(bytes, cmap.offset + 4, recordCount * 8)
  ) {
    return null;
  }

  const cmapEnd = cmap.offset + cmap.length;
  const tables: SupportedTable[] = [];
  const seenOffsets = new Set<number>();

  for (let index = 0; index < recordCount; index += 1) {
    const record = cmap.offset + 4 + index * 8;
    const platformId = u16(bytes, record);
    const encodingId = u16(bytes, record + 2);
    const relativeOffset = u32(bytes, record + 4);
    if (
      platformId === null ||
      encodingId === null ||
      relativeOffset === null ||
      !isUnicodeCmapRecord(platformId, encodingId)
    ) {
      continue;
    }
    const subtableOffset = cmap.offset + relativeOffset;
    if (
      seenOffsets.has(subtableOffset) ||
      subtableOffset < cmap.offset ||
      subtableOffset + 2 > cmapEnd
    ) {
      continue;
    }
    seenOffsets.add(subtableOffset);

    const format = u16(bytes, subtableOffset);
    if (format === 12) {
      const parsed = parseFormat12(bytes, subtableOffset, cmapEnd);
      if (parsed) tables.push(parsed);
    } else if (format === 4) {
      const parsed = parseFormat4(bytes, subtableOffset, cmapEnd);
      if (parsed) tables.push(parsed);
    }
  }

  if (tables.length === 0) return null;

  // Prefer format 12 because it covers supplementary planes and has simpler,
  // explicit range semantics; format 4 remains the fallback for BMP fonts.
  tables.sort((left, right) => right.format - left.format);
  const formats = [...new Set(tables.map((table) => table.format))] as SupportedSfntCmapFormat[];

  const glyphIdForCodePoint = (codePoint: number): number | null => {
    if (!Number.isInteger(codePoint)) return null;
    for (const table of tables) {
      const glyphId =
        table.format === 12
          ? lookupFormat12(table, codePoint, glyphCount)
          : lookupFormat4(bytes, table, codePoint, glyphCount);
      if (glyphId !== null) return glyphId;
    }
    return null;
  };

  return {
    formats,
    glyphCount,
    unicodeSubtableCount: tables.length,
    glyphIdForCodePoint,
    hasCodePoint: (codePoint: number) => glyphIdForCodePoint(codePoint) !== null,
  };
}
