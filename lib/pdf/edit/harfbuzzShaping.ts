export const MAX_SHAPING_FONT_BYTES = 32 * 1024 * 1024;
export const MAX_SHAPING_TEXT_UTF16_UNITS = 8192;
export const MAX_SHAPED_GLYPHS = 16384;

export type TextShapingDirection = "auto" | "ltr" | "rtl" | "ttb" | "btt";

export type ShapeEmbeddedFontOptions = {
  direction?: TextShapingDirection;
  script?: string | null;
  language?: string | null;
};

export type ShapedGlyph = {
  glyphId: number;
  clusterUtf16: number;
  flags: number;
  xAdvance: number;
  yAdvance: number;
  xOffset: number;
  yOffset: number;
  xAdvanceEm: number;
  yAdvanceEm: number;
  xOffsetEm: number;
  yOffsetEm: number;
};

export type ShapedCluster = {
  startUtf16: number;
  endUtf16: number;
  text: string;
  glyphIndices: readonly number[];
};

export type ShapedRun = {
  text: string;
  glyphs: readonly ShapedGlyph[];
  clusterMap: readonly ShapedCluster[];
  unitsPerEm: number;
  totalAdvance: number;
  totalAdvanceEm: number;
  totalXAdvance: number;
  totalYAdvance: number;
  direction: TextShapingDirection;
  engine: "harfbuzz";
  engineVersion: string;
};

export type HarfBuzzRuntimeInfo = {
  packageVersion: "1.6.2";
  engineVersion: string;
};

export type TextShapingErrorCode =
  | "EMPTY_FONT"
  | "FONT_TOO_LARGE"
  | "TEXT_TOO_LARGE"
  | "INVALID_FONT"
  | "INVALID_SCRIPT"
  | "INVALID_LANGUAGE"
  | "INVALID_CLUSTER"
  | "GLYPH_LIMIT";

export class TextShapingError extends Error {
  readonly code: TextShapingErrorCode;

  constructor(code: TextShapingErrorCode, message: string) {
    super(message);
    this.name = "TextShapingError";
    this.code = code;
  }
}

type HarfBuzzModule = typeof import("harfbuzzjs");

let harfBuzzModulePromise: Promise<HarfBuzzModule> | null = null;

async function loadHarfBuzz(): Promise<HarfBuzzModule> {
  if (!harfBuzzModulePromise) {
    harfBuzzModulePromise = import("harfbuzzjs");
  }
  return harfBuzzModulePromise;
}

function assertAsciiLabel(
  value: string | null | undefined,
  label: "script" | "language",
): string | null {
  if (!value) return null;
  if (!/^[\x20-\x7E]{1,64}$/.test(value)) {
    throw new TextShapingError(
      label === "script" ? "INVALID_SCRIPT" : "INVALID_LANGUAGE",
      `HarfBuzz ${label} must be a short ASCII label.`,
    );
  }
  return value;
}

function isSupportedSfnt(fontBytes: Uint8Array): boolean {
  if (fontBytes.byteLength < 12) return false;
  const view = new DataView(
    fontBytes.buffer,
    fontBytes.byteOffset,
    fontBytes.byteLength,
  );
  const signature = view.getUint32(0, false);
  const isSfnt =
    signature === 0x00010000 || // TrueType outlines
    signature === 0x4f54544f || // OTTO / CFF OpenType
    signature === 0x74727565 || // legacy Apple true
    signature === 0x74797031;   // legacy Apple typ1
  if (!isSfnt) return false;

  const numTables = view.getUint16(4, false);
  if (numTables < 1 || numTables > 256) return false;
  const directoryEnd = 12 + numTables * 16;
  if (directoryEnd > fontBytes.byteLength) return false;

  for (let index = 0; index < numTables; index += 1) {
    const entry = 12 + index * 16;
    const offset = view.getUint32(entry + 8, false);
    const length = view.getUint32(entry + 12, false);
    if (offset > fontBytes.byteLength) return false;
    if (length > fontBytes.byteLength - offset) return false;
  }
  return true;
}

function segmentGraphemes(text: string): { start: number; end: number; text: string }[] {
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  const entries = Array.from(segmenter.segment(text));
  return entries.map((entry, index) => ({
    start: entry.index,
    end: entries[index + 1]?.index ?? text.length,
    text: entry.segment,
  }));
}

function primaryAdvance(
  direction: TextShapingDirection,
  x: number,
  y: number,
): number {
  if (direction === "ttb" || direction === "btt") return Math.abs(y);
  return Math.abs(x);
}

function directionValue(
  hb: HarfBuzzModule,
  direction: Exclude<TextShapingDirection, "auto">,
): number {
  switch (direction) {
    case "ltr":
      return hb.Direction.LTR;
    case "rtl":
      return hb.Direction.RTL;
    case "ttb":
      return hb.Direction.TTB;
    case "btt":
      return hb.Direction.BTT;
  }
}

function clusterMapFor(
  text: string,
  glyphs: readonly ShapedGlyph[],
): ShapedCluster[] {
  const graphemes = segmentGraphemes(text);
  const starts = new Set(graphemes.map((item) => item.start));

  for (const glyph of glyphs) {
    if (glyph.clusterUtf16 < 0 || glyph.clusterUtf16 > text.length) {
      throw new TextShapingError(
        "INVALID_CLUSTER",
        "HarfBuzz returned a cluster outside the source text.",
      );
    }
    if (glyph.clusterUtf16 !== text.length && !starts.has(glyph.clusterUtf16)) {
      throw new TextShapingError(
        "INVALID_CLUSTER",
        "HarfBuzz returned a cluster that splits a Unicode grapheme.",
      );
    }
  }

  const byCluster = new Map<number, number[]>();
  glyphs.forEach((glyph, index) => {
    const items = byCluster.get(glyph.clusterUtf16) ?? [];
    items.push(index);
    byCluster.set(glyph.clusterUtf16, items);
  });

  const uniqueStarts = [...byCluster.keys()].sort((a, b) => a - b);
  return uniqueStarts.map((start, index) => {
    const nextCluster = uniqueStarts[index + 1] ?? text.length;
    const containingGrapheme = graphemes.find(
      (item) => item.start === start,
    );
    const end = Math.max(
      nextCluster,
      containingGrapheme?.end ?? nextCluster,
    );
    return {
      startUtf16: start,
      endUtf16: Math.min(text.length, end),
      text: text.slice(start, Math.min(text.length, end)),
      glyphIndices: byCluster.get(start) ?? [],
    };
  });
}

export async function getHarfBuzzRuntimeInfo(): Promise<HarfBuzzRuntimeInfo> {
  const hb = await loadHarfBuzz();
  return {
    packageVersion: "1.6.2",
    engineVersion: hb.versionString(),
  };
}

export async function shapeEmbeddedFontText(
  fontBytes: Uint8Array,
  text: string,
  options: ShapeEmbeddedFontOptions = {},
): Promise<ShapedRun> {
  if (fontBytes.byteLength === 0) {
    throw new TextShapingError("EMPTY_FONT", "Embedded font bytes are empty.");
  }
  if (fontBytes.byteLength > MAX_SHAPING_FONT_BYTES) {
    throw new TextShapingError(
      "FONT_TOO_LARGE",
      "Embedded font exceeds the local shaping safety limit.",
    );
  }
  if (text.length > MAX_SHAPING_TEXT_UTF16_UNITS) {
    throw new TextShapingError(
      "TEXT_TOO_LARGE",
      "Text exceeds the local shaping safety limit.",
    );
  }
  if (!isSupportedSfnt(fontBytes)) {
    throw new TextShapingError(
      "INVALID_FONT",
      "Embedded font is not a bounded, supported SFNT container.",
    );
  }

  const script = assertAsciiLabel(options.script, "script");
  const language = assertAsciiLabel(options.language, "language");
  const direction = options.direction ?? "auto";
  const hb = await loadHarfBuzz();

  try {
    const blob = new hb.Blob(fontBytes);
    const face = new hb.Face(blob);
    if (!Number.isFinite(face.upem) || face.upem <= 0 || face.upem > 0x10000) {
      throw new TextShapingError(
        "INVALID_FONT",
        "Embedded font does not expose a valid units-per-em value.",
      );
    }

    const font = new hb.Font(face);
    font.setScale(face.upem, face.upem);

    const buffer = new hb.Buffer();
    buffer.setClusterLevel(hb.ClusterLevel.MONOTONE_GRAPHEMES);
    buffer.addText(text);

    if (direction !== "auto") {
      buffer.setDirection(directionValue(hb, direction) as never);
    }
    if (script) buffer.setScript(script);
    if (language) buffer.setLanguage(language);
    buffer.guessSegmentProperties();

    hb.shape(font, buffer);
    const rawGlyphs = buffer.getGlyphInfosAndPositions();
    if (rawGlyphs.length > MAX_SHAPED_GLYPHS) {
      throw new TextShapingError(
        "GLYPH_LIMIT",
        "Shaped glyph output exceeds the local safety limit.",
      );
    }

    const glyphs: ShapedGlyph[] = rawGlyphs.map((glyph) => {
      const xAdvance = glyph.xAdvance ?? 0;
      const yAdvance = glyph.yAdvance ?? 0;
      const xOffset = glyph.xOffset ?? 0;
      const yOffset = glyph.yOffset ?? 0;
      return {
        glyphId: glyph.codepoint,
        clusterUtf16: glyph.cluster,
        flags: glyph.flags,
        xAdvance,
        yAdvance,
        xOffset,
        yOffset,
        xAdvanceEm: xAdvance / face.upem,
        yAdvanceEm: yAdvance / face.upem,
        xOffsetEm: xOffset / face.upem,
        yOffsetEm: yOffset / face.upem,
      };
    });

    const totalXAdvance = glyphs.reduce((sum, glyph) => sum + glyph.xAdvance, 0);
    const totalYAdvance = glyphs.reduce((sum, glyph) => sum + glyph.yAdvance, 0);
    const totalAdvance = primaryAdvance(direction, totalXAdvance, totalYAdvance);

    return {
      text,
      glyphs,
      clusterMap: clusterMapFor(text, glyphs),
      unitsPerEm: face.upem,
      totalAdvance,
      totalAdvanceEm: totalAdvance / face.upem,
      totalXAdvance,
      totalYAdvance,
      direction,
      engine: "harfbuzz",
      engineVersion: hb.versionString(),
    };
  } catch (error) {
    if (error instanceof TextShapingError) throw error;
    throw new TextShapingError(
      "INVALID_FONT",
      error instanceof Error
        ? `HarfBuzz could not shape the embedded font: ${error.message}`
        : "HarfBuzz could not shape the embedded font.",
    );
  }
}
