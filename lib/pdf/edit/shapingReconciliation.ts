import type { ResolvedFont } from "./fontEncoding.ts";
import type { FontMetrics } from "./fontMetrics.ts";
import type { PdfFontProgramIntelligence } from "./fontProgramIntelligence.ts";
import type { ShapedRun } from "./harfbuzzShaping.ts";

export const SHAPING_POSITION_TOLERANCE_FONT_UNITS = 1;
export const SHAPING_PDF_ADVANCE_TOLERANCE_EM = 0.002;

export type ShapingReconciliationKind =
  | "compatible-character-codes"
  | "requires-shaped-glyph-write"
  | "unresolved";

export type ShapingAdvanceAgreement =
  | "matched"
  | "diverged"
  | "unavailable";

export type ShapingReconciliation = Readonly<{
  kind: ShapingReconciliationKind;
  advisoryOnly: true;
  reason: string;
  advanceAgreement: ShapingAdvanceAgreement;
  harfBuzzAdvanceEm: number | null;
  pdfAdvanceEm: number | null;
  advanceDeltaEm: number | null;
  requiresPerGlyphPositioning: boolean;
  requiresGlyphSubstitution: boolean;
}>;

function singleCodePoint(text: string): number | null {
  const codePoint = text.codePointAt(0);
  return codePoint !== undefined && String.fromCodePoint(codePoint) === text
    ? codePoint
    : null;
}

function unresolved(reason: string): ShapingReconciliation {
  return {
    kind: "unresolved",
    advisoryOnly: true,
    reason,
    advanceAgreement: "unavailable",
    harfBuzzAdvanceEm: null,
    pdfAdvanceEm: null,
    advanceDeltaEm: null,
    requiresPerGlyphPositioning: false,
    requiresGlyphSubstitution: false,
  };
}

function shapedWriteRequired({
  reason,
  requiresPerGlyphPositioning = false,
  requiresGlyphSubstitution = false,
}: {
  reason: string;
  requiresPerGlyphPositioning?: boolean;
  requiresGlyphSubstitution?: boolean;
}): ShapingReconciliation {
  return {
    kind: "requires-shaped-glyph-write",
    advisoryOnly: true,
    reason,
    advanceAgreement: "unavailable",
    harfBuzzAdvanceEm: null,
    pdfAdvanceEm: null,
    advanceDeltaEm: null,
    requiresPerGlyphPositioning,
    requiresGlyphSubstitution,
  };
}

/**
 * Reconciles HarfBuzz shaping evidence with the PDF font's existing
 * character-code model.
 *
 * This helper is intentionally advisory only. It can prove that a run needs
 * a future shaped-glyph writer (ligatures, substitutions, per-glyph GPOS,
 * RTL/vertical ordering), or that the current text remains a simple
 * one-codepoint/one-glyph sequence. It can NEVER authorize a PDF rewrite;
 * PdfFontRegistry, PDF encoding/ToUnicode, glyph authority, EditPlan and the
 * native writer remain authoritative.
 */
export function reconcileShapingWithPdfCharacterCodes({
  text,
  shaped,
  resolvedFont,
  fontMetrics,
  intelligence,
}: {
  text: string;
  shaped: ShapedRun;
  resolvedFont: Pick<ResolvedFont, "unicodeToGlyphCode">;
  fontMetrics: FontMetrics;
  intelligence: Pick<
    PdfFontProgramIntelligence,
    "metadata" | "glyphIdForCodePoint" | "advanceWidthForGlyphId"
  >;
}): ShapingReconciliation {
  if (shaped.text !== text) {
    return unresolved("HarfBuzz source text does not match the PDF replacement text.");
  }

  if (!shaped.directionWasExplicit || shaped.requestedDirection === "auto") {
    return unresolved(
      "HarfBuzz direction was automatic, so the current writer cannot prove glyph order.",
    );
  }

  if (shaped.requestedDirection !== "ltr") {
    return shapedWriteRequired({
      reason:
        "This run needs explicit RTL or vertical shaped-glyph ordering that the current character-code writer does not emit.",
      requiresPerGlyphPositioning: true,
    });
  }

  if (
    intelligence.metadata.unitsPerEm !== null &&
    intelligence.metadata.unitsPerEm !== shaped.unitsPerEm
  ) {
    return unresolved(
      "Fontkit and HarfBuzz disagree on units-per-em for the embedded font program.",
    );
  }

  const pdfCodes: number[] = [];
  let requiresPerGlyphPositioning = false;
  let requiresGlyphSubstitution = false;

  for (const cluster of shaped.clusterMap) {
    if (cluster.startUtf16 < 0 || cluster.endUtf16 > text.length) {
      return unresolved("HarfBuzz returned a shaping cluster outside the source text.");
    }

    const codePoint = singleCodePoint(cluster.text);
    if (codePoint === null || cluster.glyphIndices.length !== 1) {
      return shapedWriteRequired({
        reason:
          "HarfBuzz combined or expanded source characters into a shaped cluster, so writing the original character codes would not preserve the shaped glyph sequence.",
        requiresGlyphSubstitution: true,
      });
    }

    const glyphIndex = cluster.glyphIndices[0];
    const shapedGlyph = shaped.glyphs[glyphIndex];
    if (!shapedGlyph) {
      return unresolved("HarfBuzz cluster references a missing shaped glyph.");
    }

    const expectedGlyphId = intelligence.glyphIdForCodePoint(codePoint);
    if (expectedGlyphId === null) {
      return unresolved(
        "The embedded font program could not map a source code point to a glyph ID.",
      );
    }
    if (expectedGlyphId !== shapedGlyph.glyphId) {
      requiresGlyphSubstitution = true;
    }

    const rawAdvance = intelligence.advanceWidthForGlyphId(shapedGlyph.glyphId);
    if (rawAdvance === null) {
      return unresolved(
        "The embedded font program could not provide an advance width for a shaped glyph.",
      );
    }

    if (
      Math.abs(shapedGlyph.xAdvance - rawAdvance) >
        SHAPING_POSITION_TOLERANCE_FONT_UNITS ||
      Math.abs(shapedGlyph.yAdvance) > SHAPING_POSITION_TOLERANCE_FONT_UNITS ||
      Math.abs(shapedGlyph.xOffset) > SHAPING_POSITION_TOLERANCE_FONT_UNITS ||
      Math.abs(shapedGlyph.yOffset) > SHAPING_POSITION_TOLERANCE_FONT_UNITS
    ) {
      requiresPerGlyphPositioning = true;
    }

    const sourceChar = String.fromCodePoint(codePoint);
    const pdfCode = resolvedFont.unicodeToGlyphCode.get(sourceChar);
    if (pdfCode === undefined) {
      return unresolved(
        "The PDF encoding does not authorize one of the source characters for the current font resource.",
      );
    }
    pdfCodes.push(pdfCode);
  }

  if (requiresGlyphSubstitution || requiresPerGlyphPositioning) {
    return shapedWriteRequired({
      reason: requiresGlyphSubstitution
        ? "HarfBuzz selected glyph substitutions that cannot be represented by the current character-code writer."
        : "HarfBuzz requires per-glyph positioning that cannot be represented by the current single-endpoint compensation writer.",
      requiresGlyphSubstitution,
      requiresPerGlyphPositioning,
    });
  }

  const harfBuzzAdvanceEm =
    shaped.unitsPerEm > 0
      ? Math.abs(shaped.totalXAdvance) / shaped.unitsPerEm
      : null;

  let pdfAdvanceUnits1000 = 0;
  for (const code of pdfCodes) {
    const width = fontMetrics.glyphWidths.get(code) ?? fontMetrics.defaultWidth;
    if (!Number.isFinite(width) || width <= 0) {
      return {
        kind: "compatible-character-codes",
        advisoryOnly: true,
        reason:
          "HarfBuzz remains one-codepoint/one-glyph, but PDF advance comparison is unavailable for one or more glyph codes.",
        advanceAgreement: "unavailable",
        harfBuzzAdvanceEm,
        pdfAdvanceEm: null,
        advanceDeltaEm: null,
        requiresPerGlyphPositioning: false,
        requiresGlyphSubstitution: false,
      };
    }
    pdfAdvanceUnits1000 += width;
  }

  const pdfAdvanceEm = pdfAdvanceUnits1000 / 1000;
  const advanceDeltaEm =
    harfBuzzAdvanceEm === null ? null : harfBuzzAdvanceEm - pdfAdvanceEm;
  const advanceAgreement =
    advanceDeltaEm === null
      ? "unavailable"
      : Math.abs(advanceDeltaEm) <= SHAPING_PDF_ADVANCE_TOLERANCE_EM
        ? "matched"
        : "diverged";

  return {
    kind: "compatible-character-codes",
    advisoryOnly: true,
    reason:
      advanceAgreement === "diverged"
        ? "HarfBuzz keeps a one-codepoint/one-glyph sequence, but its embedded-font advance differs from the PDF width table; existing PDF advance compensation remains authoritative."
        : "HarfBuzz keeps a one-codepoint/one-glyph sequence with no required per-glyph shaping offsets.",
    advanceAgreement,
    harfBuzzAdvanceEm,
    pdfAdvanceEm,
    advanceDeltaEm,
    requiresPerGlyphPositioning: false,
    requiresGlyphSubstitution: false,
  };
}
