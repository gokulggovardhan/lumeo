// lib/pdf/edit/editPlan.ts
//
// Phase 2 of true PDF text editing, slice 4: combines every prior slice
// (content-stream parsing, run<->operator matching, font encoding, font
// metrics) into a single dry-run EditPlan describing exactly what a
// replacement would need to change -- byte range, glyph codes, width
// delta, spacing adjustment -- WITHOUT writing anything. No PDF bytes are
// read, modified, or produced by this module; it only reasons about
// values already resolved by the earlier slices.
//
// The fallback-font path this module originally left out ("real, separate,
// later work") now exists in lib/pdf/edit/fallbackFont.ts and is wired in
// below -- but strictly OPT-IN, via the fallbackStyleHints parameter. A
// caller that doesn't pass it gets byte-for-byte the previous behaviour:
// if the run's own font can't safely render the replacement text, the plan
// says so and stops there (editable: false), rather than quietly changing
// the typeface of the user's document without being asked to.

import type { TextShowOperator, TextShowOperatorKind } from "./contentStream.ts";
import type { FallbackFontFamily, FallbackStyleHints } from "./fallbackFont.ts";
import { encodeWithFallbackFont, fallbackFontMetrics, firstUnencodableChar, pickFallbackFont } from "./fallbackFont.ts";
import type { ResolvedFont } from "./fontEncoding.ts";
import { classifyReplacementChar } from "./fontEncoding.ts";
import type { FontMetrics } from "./fontMetrics.ts";
import { compareAdvance, compareAdvanceAcrossFonts, type TextShowState } from "./fontMetrics.ts";

// All four PDF text-showing operators are in scope for in-place editing:
// Tj, TJ (#197, #198), and ' and " (this slice). ' and " each also
// perform a text-line move as a side effect of showing text (per spec
// 9.4.3, equivalent to T* immediately before the show) -- that move only
// depends on the current leading (TL), which lives in the graphics state
// outside the operator's own byte range and is therefore preserved
// automatically, the same way Tj/TJ already preserve everything outside
// their own range.
const SUPPORTED_OPERATOR_KINDS: ReadonlySet<TextShowOperatorKind> = new Set(["Tj", "TJ", "'", '"']);

function bytesToCodes(bytes: Uint8Array, bytesPerCode: 1 | 2): number[] {
  const codes: number[] = [];
  if (bytesPerCode === 1) {
    for (const byte of bytes) codes.push(byte);
    return codes;
  }
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    codes.push((bytes[i] << 8) | bytes[i + 1]);
  }
  return codes;
}

function decodeCodes(codes: number[], font: ResolvedFont): { text: string; allDecoded: boolean } {
  let text = "";
  let allDecoded = true;
  for (const code of codes) {
    const char = font.glyphCodeToUnicode.get(code);
    if (char === undefined) {
      allDecoded = false;
      continue;
    }
    text += char;
  }
  return { text, allDecoded };
}

/**
 * Set on a plan whose replacement text is shown in a SUBSTITUTE standard
 * font rather than the run's own (lib/pdf/edit/fallbackFont.ts). Null on
 * every same-font plan, which is still the normal case.
 *
 * When this is set, replacementGlyphCodes are single-byte WinAnsi codes
 * for `family`, NOT codes in the run's own font -- so the rewrite must
 * encode them one byte per code regardless of what the original font
 * used, and must switch the font on and back off around the operator (see
 * lib/pdf/edit/applyEditPlan.ts's buildReplacementOperatorText).
 */
export type FallbackFontUse = {
  family: FallbackFontFamily;
  /**
   * The resource name the run's own Tf had selected, restored by a second
   * Tf immediately after the rewritten operator so nothing downstream in
   * the content stream sees the substitute font.
   */
  originalFontResourceName: string;
  /** Always 1: a standard font with /WinAnsiEncoding is single-byte. */
  bytesPerCode: 1;
};

export type EditPlan = {
  pageIndex: number;
  contentStreamIndex: number;
  /**
   * Non-null when this operator lives inside a Form XObject rather than
   * directly in one of the page's own content streams -- a chain of
   * resource names from the page's own /Resources /XObject down to the
   * target Form (see lib/pdf/edit/formXObjects.ts's StreamLocator). When
   * set, contentStreamIndex is unused; applyEditPlan.ts resolves the
   * target stream via this path instead.
   */
  formPath: string[] | null;
  operatorIndex: number;
  operatorType: TextShowOperatorKind;
  fontResourceName: string | null;
  fontSizePt: number;
  /**
   * The word/char spacing this operator's show applied. For a " operator
   * these ARE its own aw/ac operands (non-text, must be preserved
   * verbatim on rewrite -- see lib/pdf/edit/applyEditPlan.ts). For every
   * other operator kind these just reflect the graphics state already in
   * effect, informational only (already folded into originalWidthPt/
   * replacementWidthPt via fontMetrics.ts's stringAdvancePt).
   */
  wordSpacing: number;
  charSpacing: number;
  originalText: string;
  replacementText: string;
  originalGlyphCodes: number[];
  replacementGlyphCodes: number[];
  originalWidthPt: number;
  replacementWidthPt: number;
  tjSpacingDelta: number;
  byteOffset: number;
  byteLength: number;
  /** See FallbackFontUse -- null on every same-font plan. */
  fallbackFont: FallbackFontUse | null;
  editable: boolean;
  reason: string | null;
};

// The message a rejected character produces when no fallback was offered
// (or when the fallback couldn't help either) -- kept in one place so the
// same wording is reused by every branch that needs it.
function rejectionReasonFor(char: string, classification: "requires-fallback" | "impossible"): string {
  return classification === "requires-fallback"
    ? `Character "${char}" is not a verified glyph in this font (would need a fallback font, which this planner does not implement).`
    : `Character "${char}" cannot be encoded in this font at all.`;
}

// Builds a dry-run EditPlan for replacing one matched text-show operator's
// string content with `replacementText`. Never touches PDF bytes -- every
// field here is either copied straight from an already-resolved input or
// computed with lib/pdf/edit/fontMetrics.ts's already-tested arithmetic.
export function buildEditPlan({
  pageIndex,
  contentStreamIndex,
  formPath = null,
  operatorIndex,
  operator,
  replacementText,
  resolvedFont,
  fontMetrics,
  fallbackStyleHints = null,
}: {
  pageIndex: number;
  contentStreamIndex: number;
  formPath?: string[] | null;
  operatorIndex: number;
  operator: TextShowOperator;
  replacementText: string;
  resolvedFont: ResolvedFont;
  fontMetrics: FontMetrics;
  /**
   * Opt in to lib/pdf/edit/fallbackFont.ts's substitute-font path for
   * characters the run's own font can't be proven to render: pass the
   * font's own style hints (readFallbackStyleHints) so a visually-matched
   * standard font can be chosen. Omit (the default) to keep the strict
   * same-font-only behaviour, where such a character is rejected outright.
   */
  fallbackStyleHints?: FallbackStyleHints | null;
}): EditPlan {
  const originalCodes = operator.strings.flatMap((bytes) => bytesToCodes(bytes, resolvedFont.bytesPerCode));
  const { text: originalText, allDecoded: originalFullyDecoded } = decodeCodes(originalCodes, resolvedFont);

  const state: TextShowState = {
    fontSizePt: operator.fontSizePt,
    charSpacing: operator.charSpacing,
    wordSpacing: operator.wordSpacing,
    horizontalScalingPct: operator.horizontalScalingPct,
  };

  const base: Omit<EditPlan, "replacementGlyphCodes" | "replacementWidthPt" | "tjSpacingDelta" | "editable" | "reason"> = {
    pageIndex,
    contentStreamIndex,
    formPath,
    operatorIndex,
    operatorType: operator.kind,
    fontResourceName: operator.fontResourceName,
    fontSizePt: operator.fontSizePt,
    wordSpacing: operator.wordSpacing,
    charSpacing: operator.charSpacing,
    originalText,
    replacementText,
    originalGlyphCodes: originalCodes,
    originalWidthPt: 0, // filled in below, after we know originalCodes is safe to measure
    byteOffset: operator.start,
    byteLength: operator.end - operator.start,
    // Overridden only by the substitute-font branch at the very bottom;
    // every rejection path below therefore reports "no fallback used"
    // without having to say so individually.
    fallbackFont: null,
  };

  // --- Safety invariant checks, in a fixed, deterministic order --------
  // Each one that fails immediately produces a non-editable plan with a
  // specific reason; none of them are skipped or guessed past.

  if (!SUPPORTED_OPERATOR_KINDS.has(operator.kind)) {
    return {
      ...base,
      originalWidthPt: 0,
      replacementGlyphCodes: [],
      replacementWidthPt: 0,
      tjSpacingDelta: 0,
      editable: false,
      reason: `Operator "${operator.kind}" is not supported for in-place editing.`,
    };
  }

  // Per spec 9.3.3 Table 106: text-rendering modes 4-7 (Fill+Clip,
  // Stroke+Clip, Fill+Stroke+Clip, Clip-only) add the glyph outlines
  // themselves to the current clipping path, applied once ET is reached.
  // Replacing this text's content would change the SHAPE of that clip
  // path -- silently altering what every later painting operation (until
  // the next Q) is visible through, not just this text's own glyphs. That
  // is a fundamentally different, much higher-blast-radius edit than a
  // normal fill/stroke text replacement, so it's honestly rejected rather
  // than attempted.
  if (operator.renderMode >= 4) {
    return {
      ...base,
      originalWidthPt: 0,
      replacementGlyphCodes: [],
      replacementWidthPt: 0,
      tjSpacingDelta: 0,
      editable: false,
      reason: `Text-rendering mode ${operator.renderMode} adds this text's outline to the clipping path -- editing it would change what later content is clipped to, not just its own glyphs. Not supported.`,
    };
  }

  if (resolvedFont.encodingSource === "Unknown") {
    return {
      ...base,
      originalWidthPt: 0,
      replacementGlyphCodes: [],
      replacementWidthPt: 0,
      tjSpacingDelta: 0,
      editable: false,
      reason: "This font's encoding could not be resolved, so its existing text can't be reliably decoded.",
    };
  }

  if (!originalFullyDecoded) {
    return {
      ...base,
      originalWidthPt: 0,
      replacementGlyphCodes: [],
      replacementWidthPt: 0,
      tjSpacingDelta: 0,
      editable: false,
      reason: "One or more glyph codes in the existing run have no known Unicode mapping in this font.",
    };
  }

  if (fontMetrics.source === "Unknown") {
    return {
      ...base,
      originalWidthPt: 0,
      replacementGlyphCodes: [],
      replacementWidthPt: 0,
      tjSpacingDelta: 0,
      editable: false,
      reason: "This font's glyph widths could not be resolved, so replacement spacing can't be computed.",
    };
  }

  const replacementGlyphCodes: number[] = [];
  let blocked: { char: string; classification: "requires-fallback" | "impossible" } | null = null;
  for (const char of replacementText) {
    const classification = classifyReplacementChar(resolvedFont, char);
    if (classification !== "editable") {
      blocked = { char, classification };
      break;
    }
    const code = resolvedFont.unicodeToGlyphCode.get(char);
    // classifyReplacementChar already proved this exists for "editable".
    replacementGlyphCodes.push(code as number);
  }

  if (!blocked) {
    const comparison = compareAdvance(originalCodes, replacementGlyphCodes, fontMetrics, state);
    return {
      ...base,
      originalWidthPt: comparison.originalAdvancePt,
      replacementGlyphCodes,
      replacementWidthPt: comparison.replacementAdvancePt,
      tjSpacingDelta: comparison.tjAdjustment,
      editable: true,
      reason: null,
    };
  }

  // --- Substitute-font path (lib/pdf/edit/fallbackFont.ts) -------------
  // Reached only when the run's own font can't be trusted with at least
  // one character AND the caller opted in by supplying style hints. Note
  // that this replaces the WHOLE run's text with the substitute, not just
  // the offending character: Tf selects a font for an entire text-showing
  // operator, so there is no way to mix two fonts inside one Tj/TJ without
  // splitting it into several operators -- and a run rendered half in the
  // original face and half in a substitute would look worse than one
  // rendered consistently in a well-matched substitute.

  const rejection = { ...base, originalWidthPt: 0, replacementGlyphCodes: [], replacementWidthPt: 0, tjSpacingDelta: 0, editable: false };

  if (!fallbackStyleHints) {
    return { ...rejection, reason: rejectionReasonFor(blocked.char, blocked.classification) };
  }

  // Without a resource name for the run's own font there is nothing to
  // restore it to after the substitute's Tf, so everything downstream in
  // the content stream would keep rendering in the substitute.
  if (!operator.fontResourceName) {
    return {
      ...rejection,
      reason: `Character "${blocked.char}" needs a substitute font, but this text's own font resource couldn't be identified, so the substitute couldn't be switched back off afterwards.`,
    };
  }

  const fallbackCodes = encodeWithFallbackFont(replacementText);
  if (!fallbackCodes) {
    const unencodable = firstUnencodableChar(replacementText) ?? blocked.char;
    return {
      ...rejection,
      reason: `Character "${unencodable}" isn't available in this font, and none of the standard substitute fonts can show it either.`,
    };
  }

  const family = pickFallbackFont(fallbackStyleHints);
  const comparison = compareAdvanceAcrossFonts(
    originalCodes,
    fontMetrics,
    fallbackCodes,
    fallbackFontMetrics(family),
    state,
  );

  return {
    ...base,
    originalWidthPt: comparison.originalAdvancePt,
    replacementGlyphCodes: fallbackCodes,
    replacementWidthPt: comparison.replacementAdvancePt,
    tjSpacingDelta: comparison.tjAdjustment,
    fallbackFont: { family, originalFontResourceName: operator.fontResourceName, bytesPerCode: 1 },
    editable: true,
    reason: null,
  };
}
