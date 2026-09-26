import assert from "node:assert/strict";
import test from "node:test";
import type { ResolvedFont } from "../lib/pdf/edit/fontEncoding.ts";
import { resolveGlyphAuthority } from "../lib/pdf/edit/glyphAuthority.ts";

function embeddedSubsetFont(): ResolvedFont {
  return {
    kind: "TrueType",
    baseFont: "ABCDEF+DemoSans",
    isEmbedded: true,
    isSubset: true,
    bytesPerCode: 1,
    encodingSource: "WinAnsi",
    glyphCodeToUnicode: new Map([
      [65, "A"],
      [66, "B"],
    ]),
    unicodeToGlyphCode: new Map([
      ["A", 65],
      ["B", 66],
    ]),
  };
}

test("glyph authority never lets professional font intelligence override missing SFNT write proof", () => {
  const decision = resolveGlyphAuthority({
    font: embeddedSubsetFont(),
    char: "B",
    embeddedGlyphEvidence: {
      safeForSimplePdfEncoding: true,
      hasUnicodeCodePoint: () => false,
    },
    professionalGlyphEvidence: {
      hasGlyphForCodePoint: () => true,
    },
  });

  assert.equal(decision.professionalProgramReportsGlyph, true);
  assert.equal(decision.classification, "requires-fallback");
  assert.equal(decision.authoritativeSource, "blocked");
  assert.match(decision.reason, /professional font engine reports a glyph/i);
});

test("glyph authority authorizes an embedded subset only when PDF encoding and exact SFNT evidence agree", () => {
  const decision = resolveGlyphAuthority({
    font: embeddedSubsetFont(),
    char: "B",
    embeddedGlyphEvidence: {
      safeForSimplePdfEncoding: true,
      hasUnicodeCodePoint: (codePoint) => codePoint === 0x42,
    },
    professionalGlyphEvidence: {
      hasGlyphForCodePoint: () => false,
    },
  });

  assert.equal(decision.professionalProgramReportsGlyph, false);
  assert.equal(decision.classification, "editable");
  assert.equal(decision.authoritativeSource, "pdf-encoding-and-embedded-sfnt");
});

test("glyph authority keeps normal non-subset PDF encoding independent of fontkit", () => {
  const font: ResolvedFont = {
    ...embeddedSubsetFont(),
    baseFont: "Helvetica",
    isEmbedded: false,
    isSubset: false,
  };

  const decision = resolveGlyphAuthority({
    font,
    char: "A",
    professionalGlyphEvidence: {
      hasGlyphForCodePoint: () => false,
    },
  });

  assert.equal(decision.classification, "editable");
  assert.equal(decision.authoritativeSource, "pdf-encoding");
});
