import {
  classifyReplacementChar,
  type EmbeddedGlyphEvidence,
  type ReplacementClassification,
  type ResolvedFont,
} from "./fontEncoding.ts";
import type { PdfFontProgramIntelligence } from "./fontProgramIntelligence.ts";

export type ProfessionalGlyphEvidence = Pick<
  PdfFontProgramIntelligence,
  "hasGlyphForCodePoint"
>;

export type GlyphAuthoritySource =
  | "pdf-encoding"
  | "pdf-encoding-and-embedded-sfnt"
  | "blocked";

export type GlyphAuthorityDecision = {
  classification: ReplacementClassification;
  authoritativeSource: GlyphAuthoritySource;
  professionalProgramReportsGlyph: boolean | null;
  reason: string;
};

/**
 * Central authority for deciding whether one Unicode character may be
 * encoded into an existing PDF font resource.
 *
 * The PDF encoding/ToUnicode map plus PdfFontRegistry's exact embedded SFNT
 * evidence remain authoritative. Professional font-program intelligence
 * (fontkit) is advisory only: it can explain a disagreement, but can never
 * upgrade a blocked PDF edit by itself.
 */
export function resolveGlyphAuthority({
  font,
  char,
  embeddedGlyphEvidence = null,
  professionalGlyphEvidence = null,
}: {
  font: ResolvedFont;
  char: string;
  embeddedGlyphEvidence?: EmbeddedGlyphEvidence | null;
  professionalGlyphEvidence?: ProfessionalGlyphEvidence | null;
}): GlyphAuthorityDecision {
  const classification = classifyReplacementChar(
    font,
    char,
    embeddedGlyphEvidence,
  );

  const codePoint = char.codePointAt(0);
  const isSingleCodePoint =
    codePoint !== undefined && String.fromCodePoint(codePoint) === char;
  let professionalProgramReportsGlyph: boolean | null = null;
  if (professionalGlyphEvidence && isSingleCodePoint) {
    try {
      professionalProgramReportsGlyph =
        professionalGlyphEvidence.hasGlyphForCodePoint(codePoint);
    } catch {
      professionalProgramReportsGlyph = null;
    }
  }

  if (classification === "editable") {
    const subsetSfntProof =
      font.kind === "TrueType" &&
      font.isEmbedded &&
      font.isSubset &&
      embeddedGlyphEvidence?.safeForSimplePdfEncoding === true;

    return {
      classification,
      authoritativeSource: subsetSfntProof
        ? "pdf-encoding-and-embedded-sfnt"
        : "pdf-encoding",
      professionalProgramReportsGlyph,
      reason: subsetSfntProof
        ? "PDF encoding and exact embedded SFNT glyph evidence both authorize this character."
        : "The PDF font encoding authorizes this character without requiring professional font-program evidence.",
    };
  }

  return {
    classification,
    authoritativeSource: "blocked",
    professionalProgramReportsGlyph,
    reason:
      professionalProgramReportsGlyph === true
        ? "The professional font engine reports a glyph, but PDF encoding/SFNT write-back proof is absent or insufficient; the edit remains blocked."
        : "PDF encoding/SFNT write-back proof is absent or insufficient; the edit remains blocked.",
  };
}
