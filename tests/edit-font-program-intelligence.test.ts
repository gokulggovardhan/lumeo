import assert from "node:assert/strict";
import test from "node:test";
import type { Font, FontCollection } from "@cantoo/fontkit";
import {
  FONT_INTELLIGENCE_ENGINE,
  MAX_INSPECTABLE_FONT_PROGRAM_BYTES,
  inspectPdfFontProgram,
} from "../lib/pdf/edit/fontProgramIntelligence.ts";

function fakeFont(overrides: Partial<Font> = {}): Font {
  const glyphs = new Map([
    [65, { id: 7, advanceWidth: 610 }],
    [66, { id: 8, advanceWidth: 590 }],
  ]);
  return {
    type: "TTF",
    postscriptName: "DemoSans-Regular",
    fullName: "Demo Sans Regular",
    familyName: "Demo Sans",
    subfamilyName: "Regular",
    copyright: null,
    version: "Version 1.0",
    unitsPerEm: 1000,
    ascent: 800,
    descent: -200,
    lineGap: 200,
    underlinePosition: -100,
    underlineThickness: 50,
    italicAngle: 0,
    capHeight: 700,
    xHeight: 500,
    bbox: {
      minX: -50,
      minY: -220,
      maxX: 1050,
      maxY: 920,
      width: 1100,
      height: 1140,
      addPoint() {},
      copy() {
        return this;
      },
    },
    numGlyphs: 20,
    characterSet: [65, 66],
    availableFeatures: ["kern", "liga", "liga"],
    variationAxes: {},
    namedVariations: {},
    setDefaultLanguage() {},
    getName() {
      return null;
    },
    hasGlyphForCodePoint(codePoint) {
      return glyphs.has(codePoint);
    },
    glyphForCodePoint(codePoint) {
      const glyph = glyphs.get(codePoint);
      return glyph
        ? ({
            id: glyph.id,
            advanceWidth: glyph.advanceWidth,
          } as Font["glyphForCodePoint"] extends (...args: never[]) => infer R ? NonNullable<R> : never)
        : null;
    },
    glyphsForString() {
      return [];
    },
    layout() {
      throw new Error("layout must not be used by font intelligence");
    },
    stringsForGlyph() {
      return [];
    },
    getAvailableFeatures() {
      return [];
    },
    getGlyph(glyphId) {
      const found = [...glyphs.values()].find((glyph) => glyph.id === glyphId);
      return found
        ? ({
            id: found.id,
            advanceWidth: found.advanceWidth,
          } as Font["getGlyph"] extends (...args: never[]) => infer R ? NonNullable<R> : never)
        : null;
    },
    createSubset() {
      throw new Error("subsetting is not part of this foundation slice");
    },
    getVariation() {
      return this;
    },
    ...overrides,
  } as Font;
}

function fakeModule(fontOrCollection: Font | FontCollection) {
  return {
    default: {
      create() {
        return fontOrCollection;
      },
    },
  } as unknown as typeof import("@cantoo/fontkit");
}

test("professional font inspection is lazy, bounded, and returns exact program metadata", async () => {
  let loaderCalls = 0;
  const inspection = await inspectPdfFontProgram(new Uint8Array([1, 2, 3]), {
    moduleLoader: async () => {
      loaderCalls += 1;
      return fakeModule(fakeFont());
    },
  });

  assert.equal(loaderCalls, 1);
  assert.equal(inspection.kind, "ok");
  if (inspection.kind !== "ok") return;

  const { intelligence } = inspection;
  assert.equal(intelligence.metadata.engine, FONT_INTELLIGENCE_ENGINE);
  assert.equal(intelligence.metadata.postScriptName, "DemoSans-Regular");
  assert.equal(intelligence.metadata.fullName, "Demo Sans Regular");
  assert.equal(intelligence.metadata.familyName, "Demo Sans");
  assert.equal(intelligence.metadata.subfamilyName, "Regular");
  assert.equal(intelligence.metadata.unitsPerEm, 1000);
  assert.equal(intelligence.metadata.ascent, 800);
  assert.equal(intelligence.metadata.descent, -200);
  assert.equal(intelligence.metadata.capHeight, 700);
  assert.equal(intelligence.metadata.xHeight, 500);
  assert.deepEqual(intelligence.metadata.availableFeatures, ["kern", "liga"]);
  assert.equal(intelligence.hasGlyphForCodePoint(65), true);
  assert.equal(intelligence.glyphIdForCodePoint(65), 7);
  assert.equal(intelligence.advanceWidthForGlyphId(7), 610);
  assert.equal(intelligence.glyphIdForCodePoint(0x110000), null);
});

test("oversized font programs are blocked before the lazy module is loaded", async () => {
  let loaderCalls = 0;
  const inspection = await inspectPdfFontProgram(new Uint8Array(5), {
    maxBytes: 4,
    moduleLoader: async () => {
      loaderCalls += 1;
      return fakeModule(fakeFont());
    },
  });

  assert.equal(inspection.kind, "blocked");
  assert.equal(loaderCalls, 0);
  assert.equal(MAX_INSPECTABLE_FONT_PROGRAM_BYTES, 32 * 1024 * 1024);
});

test("font collections require deterministic face selection", async () => {
  const regular = fakeFont({ postscriptName: "ABCDEF+DemoSans-Regular" });
  const bold = fakeFont({
    postscriptName: "DemoSans-Bold",
    fullName: "Demo Sans Bold",
    subfamilyName: "Bold",
  });
  const collection = {
    type: "TTC",
    fonts: [regular, bold],
    getFont(postscriptName: string | Uint8Array) {
      return typeof postscriptName === "string"
        ? this.fonts.find((font) => font.postscriptName === postscriptName) ?? null
        : null;
    },
  } as FontCollection;

  const selected = await inspectPdfFontProgram(new Uint8Array([1]), {
    preferredPostScriptNames: ["DemoSans-Bold"],
    moduleLoader: async () => fakeModule(collection),
  });
  assert.equal(selected.kind, "ok");
  if (selected.kind === "ok") {
    assert.equal(selected.intelligence.metadata.postScriptName, "DemoSans-Bold");
  }

  const ambiguous = await inspectPdfFontProgram(new Uint8Array([1]), {
    moduleLoader: async () => fakeModule(collection),
  });
  assert.equal(ambiguous.kind, "unavailable");
});

test("malformed font parser failures remain fail-closed", async () => {
  const inspection = await inspectPdfFontProgram(new Uint8Array([1, 2, 3]), {
    moduleLoader: async () =>
      ({
        default: {
          create() {
            throw new Error("malformed font");
          },
        },
      }) as unknown as typeof import("@cantoo/fontkit"),
  });

  assert.equal(inspection.kind, "parse-error");
});
