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
// Deliberately does not implement a fallback-font path: if the current
// font can't safely render the replacement text, the plan says so and
// stops there (editable: false), rather than guessing at a substitute
// font. That's real, separate, later work.

import type { TextShowOperator, TextShowOperatorKind } from "./contentStream.ts";
import type { ResolvedFont } from "./fontEncoding.ts";
import { classifyReplacementChar } from "./fontEncoding.ts";
import type { FontMetrics } from "./fontMetrics.ts";
import { compareAdvance, type TextShowState } from "./fontMetrics.ts";

// Only these two operator kinds are in scope for in-place editing in this
// slice. ' and " each also perform a text-line move as a side effect of
// showing text (per spec 9.4.3) -- rewriting just their string operand is
// not the same narrow, well-understood change Tj/TJ's is, so they're
// explicitly excluded rather than assumed safe.
const SUPPORTED_OPERATOR_KINDS: ReadonlySet<TextShowOperatorKind> = new Set(["Tj", "TJ"]);

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

export type EditPlan = {
  pageIndex: number;
  contentStreamIndex: number;
  operatorIndex: number;
  operatorType: TextShowOperatorKind;
  fontResourceName: string | null;
  fontSizePt: number;
  originalText: string;
  replacementText: string;
  originalGlyphCodes: number[];
  replacementGlyphCodes: number[];
  originalWidthPt: number;
  replacementWidthPt: number;
  tjSpacingDelta: number;
  byteOffset: number;
  byteLength: number;
  editable: boolean;
  reason: string | null;
};

// Builds a dry-run EditPlan for replacing one matched text-show operator's
// string content with `replacementText`. Never touches PDF bytes -- every
// field here is either copied straight from an already-resolved input or
// computed with lib/pdf/edit/fontMetrics.ts's already-tested arithmetic.
export function buildEditPlan({
  pageIndex,
  contentStreamIndex,
  operatorIndex,
  operator,
  replacementText,
  resolvedFont,
  fontMetrics,
}: {
  pageIndex: number;
  contentStreamIndex: number;
  operatorIndex: number;
  operator: TextShowOperator;
  replacementText: string;
  resolvedFont: ResolvedFont;
  fontMetrics: FontMetrics;
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
    operatorIndex,
    operatorType: operator.kind,
    fontResourceName: operator.fontResourceName,
    fontSizePt: operator.fontSizePt,
    originalText,
    replacementText,
    originalGlyphCodes: originalCodes,
    originalWidthPt: 0, // filled in below, after we know originalCodes is safe to measure
    byteOffset: operator.start,
    byteLength: operator.end - operator.start,
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
      reason: `Operator "${operator.kind}" is not supported for in-place editing yet (only Tj and TJ are).`,
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
  for (const char of replacementText) {
    const classification = classifyReplacementChar(resolvedFont, char);
    if (classification !== "editable") {
      return {
        ...base,
        originalWidthPt: 0,
        replacementGlyphCodes: [],
        replacementWidthPt: 0,
        tjSpacingDelta: 0,
        editable: false,
        reason:
          classification === "requires-fallback"
            ? `Character "${char}" is not a verified glyph in this font (would need a fallback font, which this planner does not implement).`
            : `Character "${char}" cannot be encoded in this font at all.`,
      };
    }
    const code = resolvedFont.unicodeToGlyphCode.get(char);
    // classifyReplacementChar already proved this exists for "editable".
    replacementGlyphCodes.push(code as number);
  }

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
