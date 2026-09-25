import type { Font, FontCollection } from "@cantoo/fontkit";

export const FONT_INTELLIGENCE_ENGINE = "@cantoo/fontkit@2.0.12" as const;
export const MAX_INSPECTABLE_FONT_PROGRAM_BYTES = 32 * 1024 * 1024;

export type PdfFontProgramMetadata = {
  engine: typeof FONT_INTELLIGENCE_ENGINE;
  fontType: string;
  postScriptName: string | null;
  fullName: string | null;
  familyName: string | null;
  subfamilyName: string | null;
  version: string | null;
  unitsPerEm: number | null;
  ascent: number | null;
  descent: number | null;
  lineGap: number | null;
  capHeight: number | null;
  xHeight: number | null;
  italicAngle: number | null;
  bbox:
    | {
        minX: number;
        minY: number;
        maxX: number;
        maxY: number;
      }
    | null;
  numGlyphs: number | null;
  characterSetCount: number | null;
  availableFeatures: readonly string[];
};

export type PdfFontProgramIntelligence = {
  metadata: PdfFontProgramMetadata;
  hasGlyphForCodePoint(codePoint: number): boolean;
  glyphIdForCodePoint(codePoint: number): number | null;
  advanceWidthForGlyphId(glyphId: number): number | null;
};

export type PdfFontProgramInspection =
  | {
      kind: "ok";
      intelligence: PdfFontProgramIntelligence;
    }
  | {
      kind: "unavailable" | "blocked" | "parse-error";
      reason: string;
    };

type FontkitModule = typeof import("@cantoo/fontkit");

type InspectOptions = {
  preferredPostScriptNames?: readonly string[];
  moduleLoader?: () => Promise<FontkitModule>;
  maxBytes?: number;
};

function cleanName(value: string | null | undefined): string | null {
  const cleaned = typeof value === "string" ? value.trim() : "";
  return cleaned || null;
}

function finiteMetric(value: unknown, magnitudeLimit = 10_000_000): number | null {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    Math.abs(value) <= magnitudeLimit
    ? value
    : null;
}

function finitePositiveInt(value: unknown, max: number): number | null {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value > 0 &&
    value <= max
    ? value
    : null;
}

function isCollection(value: Font | FontCollection): value is FontCollection {
  return Array.isArray((value as FontCollection).fonts);
}

function normalizePostScriptCandidate(value: string): string {
  return value.replace(/^[A-Z]{6}\+/, "").trim().toLowerCase();
}

function pickFont(
  opened: Font | FontCollection,
  preferredPostScriptNames: readonly string[],
): Font | null {
  if (!isCollection(opened)) return opened;

  const candidates = preferredPostScriptNames
    .map((value) => cleanName(value))
    .filter((value): value is string => Boolean(value));
  for (const candidate of candidates) {
    const exact = opened.getFont(candidate);
    if (exact) return exact;

    const normalized = normalizePostScriptCandidate(candidate);
    const fallback = opened.fonts.find((font) => {
      const postScriptName = cleanName(font.postscriptName);
      return postScriptName
        ? normalizePostScriptCandidate(postScriptName) === normalized
        : false;
    });
    if (fallback) return fallback;
  }

  return opened.fonts.length === 1 ? opened.fonts[0] : null;
}

function safeBBox(font: Font): PdfFontProgramMetadata["bbox"] {
  const box = font.bbox;
  if (!box) return null;
  const minX = finiteMetric(box.minX);
  const minY = finiteMetric(box.minY);
  const maxX = finiteMetric(box.maxX);
  const maxY = finiteMetric(box.maxY);
  if (minX === null || minY === null || maxX === null || maxY === null) {
    return null;
  }
  if (maxX < minX || maxY < minY) return null;
  return { minX, minY, maxX, maxY };
}

function safeFeatures(font: Font): string[] {
  if (!Array.isArray(font.availableFeatures)) return [];
  return Array.from(
    new Set(
      font.availableFeatures
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter((value) => /^[ -~]{1,16}$/.test(value)),
    ),
  )
    .sort()
    .slice(0, 256);
}

function intelligenceFor(font: Font): PdfFontProgramIntelligence {
  const unitsPerEm = finitePositiveInt(font.unitsPerEm, 16_384);
  const numGlyphs = finitePositiveInt(font.numGlyphs, 2_000_000);
  const metadata: PdfFontProgramMetadata = {
    engine: FONT_INTELLIGENCE_ENGINE,
    fontType: cleanName(font.type) ?? "unknown",
    postScriptName: cleanName(font.postscriptName),
    fullName: cleanName(font.fullName),
    familyName: cleanName(font.familyName),
    subfamilyName: cleanName(font.subfamilyName),
    version: cleanName(font.version),
    unitsPerEm,
    ascent: finiteMetric(font.ascent),
    descent: finiteMetric(font.descent),
    lineGap: finiteMetric(font.lineGap),
    capHeight: finiteMetric(font.capHeight),
    xHeight: finiteMetric(font.xHeight),
    italicAngle: finiteMetric(font.italicAngle, 360),
    bbox: safeBBox(font),
    numGlyphs,
    characterSetCount:
      Array.isArray(font.characterSet) && font.characterSet.length <= 2_000_000
        ? font.characterSet.length
        : null,
    availableFeatures: safeFeatures(font),
  };

  return {
    metadata,
    hasGlyphForCodePoint(codePoint) {
      if (
        !Number.isInteger(codePoint) ||
        codePoint < 0 ||
        codePoint > 0x10ffff
      ) {
        return false;
      }
      try {
        return Boolean(font.hasGlyphForCodePoint(codePoint));
      } catch {
        return false;
      }
    },
    glyphIdForCodePoint(codePoint) {
      if (
        !Number.isInteger(codePoint) ||
        codePoint < 0 ||
        codePoint > 0x10ffff
      ) {
        return null;
      }
      try {
        const glyph = font.glyphForCodePoint(codePoint);
        const id = glyph?.id;
        return typeof id === "number" &&
          Number.isInteger(id) &&
          id >= 0 &&
          (numGlyphs === null || id < numGlyphs)
          ? id
          : null;
      } catch {
        return null;
      }
    },
    advanceWidthForGlyphId(glyphId) {
      if (
        !Number.isInteger(glyphId) ||
        glyphId < 0 ||
        (numGlyphs !== null && glyphId >= numGlyphs)
      ) {
        return null;
      }
      try {
        const glyph = font.getGlyph(glyphId);
        return glyph ? finiteMetric(glyph.advanceWidth) : null;
      } catch {
        return null;
      }
    },
  };
}

async function defaultModuleLoader(): Promise<FontkitModule> {
  return import("@cantoo/fontkit");
}

/**
 * Parses already-extracted embedded font bytes locally and lazily.
 *
 * This layer never authorizes a PDF edit by itself. PDF encoding, widths,
 * resource scope, ToUnicode and content-stream provenance remain separate
 * required evidence in the existing Edit PDF engine.
 */
export async function inspectPdfFontProgram(
  bytes: Uint8Array,
  {
    preferredPostScriptNames = [],
    moduleLoader = defaultModuleLoader,
    maxBytes = MAX_INSPECTABLE_FONT_PROGRAM_BYTES,
  }: InspectOptions = {},
): Promise<PdfFontProgramInspection> {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
    return {
      kind: "unavailable",
      reason: "No embedded font-program bytes are available.",
    };
  }
  if (
    !Number.isFinite(maxBytes) ||
    maxBytes <= 0 ||
    bytes.byteLength > maxBytes
  ) {
    return {
      kind: "blocked",
      reason: "The embedded font program exceeds the local inspection limit.",
    };
  }

  try {
    const fontkitModule = await moduleLoader();
    const fontkit = fontkitModule.default ?? fontkitModule;
    const opened = fontkit.create(bytes);
    const font = pickFont(opened, preferredPostScriptNames);
    if (!font) {
      return {
        kind: "unavailable",
        reason:
          "The embedded font contains multiple faces and the PDF font identity did not select one deterministically.",
      };
    }
    return { kind: "ok", intelligence: intelligenceFor(font) };
  } catch {
    return {
      kind: "parse-error",
      reason:
        "The embedded font program could not be parsed safely by the local font engine.",
    };
  }
}
