// lib/pdf/edit/fontMetrics.ts
//
// Phase 2 of true PDF text editing, slice 3: resolve a font resource's
// real glyph advance widths, so a later slice can compare an existing
// run's on-page width against a replacement string's natural width and
// compute the TJ spacing adjustment needed to keep surrounding text from
// shifting. Never touches a content stream -- purely read-only resolution
// and arithmetic, same discipline as fontEncoding.ts (slice 2).
//
// All widths are in the PDF spec's standard "1000 units per em" glyph
// space (the same convention /Widths, /W, and AFM metrics all already
// use) unless a function name says otherwise (e.g. the *Pt suffix means
// already-scaled real PDF points).

import { PDFArray, PDFDict, PDFName, PDFNumber, PDFRef, type PDFContext } from "pdf-lib";
import { Font, FontNames } from "@pdf-lib/standard-fonts";
import { Encodings } from "@pdf-lib/standard-fonts";
import type { ResolvedFont } from "./fontEncoding.ts";

export type FontMetricsSource = "Widths" | "W" | "StandardFontAFM" | "Unknown";

export type FontMetrics = {
  bytesPerCode: 1 | 2;
  /** Fallback width (1000-unit glyph space) for a code with no specific entry. */
  defaultWidth: number;
  /** glyphCode -> width, in 1000-unit glyph space. */
  glyphWidths: Map<number, number>;
  source: FontMetricsSource;
};

function asNumber(obj: unknown): number | null {
  return obj instanceof PDFNumber ? obj.asNumber() : null;
}

// Per spec 9.6.3, Table 111 (Type 1/TrueType) and Table 112 (Type 3): a
// simple font's per-code widths live directly in /Widths, indexed from
// /FirstChar; a code outside [FirstChar, LastChar] falls back to the
// FontDescriptor's /MissingWidth (default 0 if absent entirely).
function resolveSimpleFontWidthsArray(fontDict: PDFDict, context: PDFContext): FontMetrics | null {
  const firstChar = asNumber(fontDict.get(PDFName.of("FirstChar")));
  const widthsEntry = fontDict.get(PDFName.of("Widths"));
  const widthsArray = widthsEntry instanceof PDFRef ? context.lookupMaybe(widthsEntry, PDFArray) : widthsEntry;
  if (firstChar === null || !(widthsArray instanceof PDFArray)) return null;

  const glyphWidths = new Map<number, number>();
  for (let i = 0; i < widthsArray.size(); i += 1) {
    const width = asNumber(widthsArray.get(i));
    if (width !== null) glyphWidths.set(firstChar + i, width);
  }

  const descriptorRef = fontDict.get(PDFName.of("FontDescriptor"));
  const descriptor = descriptorRef instanceof PDFRef ? context.lookupMaybe(descriptorRef, PDFDict) : undefined;
  const missingWidth = descriptor ? (asNumber(descriptor.get(PDFName.of("MissingWidth"))) ?? 0) : 0;

  return { bytesPerCode: 1, defaultWidth: missingWidth, glyphWidths, source: "Widths" };
}

// Maps a BaseFont name (subset prefix already stripped by the caller) to
// one of the 14 standard AFM-metric font names @pdf-lib/standard-fonts
// ships, if it's an exact match. No fuzzy matching -- a name that isn't
// exactly one of these 14 is a font this fallback genuinely can't help
// with, not a guess to paper over.
const STANDARD_FONT_NAMES = new Set<string>(Object.values(FontNames));

// A simple font with no /Widths at all is only spec-legal for the 14
// standard fonts (viewers are expected to already know their metrics) --
// falls back to real AFM data via @pdf-lib/standard-fonts, resolving each
// code's glyph name the same way fontEncoding.ts's WinAnsi table does
// (Encodings.WinAnsi.encodeUnicodeCodePoint), so this stays consistent
// with how that module already decoded the same codes.
function resolveStandardFontAfmWidths(baseFont: string, resolvedFont: ResolvedFont): FontMetrics | null {
  if (resolvedFont.isSubset || !STANDARD_FONT_NAMES.has(baseFont)) return null;

  const afm = Font.load(baseFont as (typeof FontNames)[keyof typeof FontNames]);
  const glyphWidths = new Map<number, number>();

  for (const [code, unicode] of resolvedFont.glyphCodeToUnicode) {
    const codePoint = unicode.codePointAt(0);
    if (codePoint === undefined || !Encodings.WinAnsi.canEncodeUnicodeCodePoint(codePoint)) continue;
    const { name } = Encodings.WinAnsi.encodeUnicodeCodePoint(codePoint);
    const width = afm.getWidthOfGlyph(name);
    if (typeof width === "number") glyphWidths.set(code, width);
  }

  if (glyphWidths.size === 0) return null;
  return { bytesPerCode: 1, defaultWidth: 0, glyphWidths, source: "StandardFontAFM" };
}

// Per spec 9.7.4.3, Table 117: /W is a sequence of either
// `c [w1 w2 ... wn]` (individual consecutive widths starting at CID c) or
// `cFirst cLast w` (every CID in the inclusive range shares width w).
function parseCidWidthsArray(wArray: PDFArray, context: PDFContext): Map<number, number> {
  const glyphWidths = new Map<number, number>();
  let i = 0;
  while (i < wArray.size()) {
    const first = asNumber(wArray.get(i));
    if (first === null) {
      i += 1;
      continue;
    }
    const next = wArray.get(i + 1);
    const nextResolved = next instanceof PDFRef ? context.lookupMaybe(next, PDFArray) : next;

    if (nextResolved instanceof PDFArray) {
      for (let j = 0; j < nextResolved.size(); j += 1) {
        const width = asNumber(nextResolved.get(j));
        if (width !== null) glyphWidths.set(first + j, width);
      }
      i += 2;
      continue;
    }

    const last = asNumber(next);
    const width = asNumber(wArray.get(i + 2));
    if (last !== null && width !== null) {
      for (let cid = first; cid <= last; cid += 1) glyphWidths.set(cid, width);
      i += 3;
      continue;
    }

    // Malformed/unrecognized triplet -- skip just this one number rather
    // than aborting the whole array, so the rest can still be parsed.
    i += 1;
  }
  return glyphWidths;
}

function resolveCidFontWidths(fontDict: PDFDict, context: PDFContext): FontMetrics {
  const descendantFonts = fontDict.get(PDFName.of("DescendantFonts"));
  const descendantDict =
    descendantFonts instanceof PDFArray && descendantFonts.size() > 0
      ? context.lookupMaybe(descendantFonts.get(0), PDFDict)
      : undefined;

  // Per spec 9.7.4.3: /DW's default is 1000 if the entry is absent.
  const defaultWidth = descendantDict ? (asNumber(descendantDict.get(PDFName.of("DW"))) ?? 1000) : 1000;

  const wEntry = descendantDict?.get(PDFName.of("W"));
  const wArray = wEntry instanceof PDFRef ? context.lookupMaybe(wEntry, PDFArray) : wEntry;

  if (wArray instanceof PDFArray) {
    return { bytesPerCode: 2, defaultWidth, glyphWidths: parseCidWidthsArray(wArray, context), source: "W" };
  }
  // No /W: every CID uses /DW -- a real, spec-legal (if unusual) outcome,
  // not a failure to resolve. glyphWidths stays empty; defaultWidth alone
  // already answers every glyphAdvance() call correctly in this case.
  return { bytesPerCode: 2, defaultWidth, glyphWidths: new Map(), source: "W" };
}

// Resolves the given font resource's glyph advance widths. `resolvedFont`
// must be the same font's lib/pdf/edit/fontEncoding.ts resolution (needed
// for the standard-14-AFM fallback path, which reuses its glyph-code ->
// Unicode decoding rather than re-deriving it).
export function resolveFontMetrics(fontDict: PDFDict, context: PDFContext, resolvedFont: ResolvedFont): FontMetrics {
  if (resolvedFont.kind === "Type0") {
    return resolveCidFontWidths(fontDict, context);
  }

  const fromWidthsArray = resolveSimpleFontWidthsArray(fontDict, context);
  if (fromWidthsArray) return fromWidthsArray;

  const fromAfm = resolveStandardFontAfmWidths(resolvedFont.baseFont, resolvedFont);
  if (fromAfm) return fromAfm;

  // Neither an explicit /Widths array nor a recognized standard-font
  // fallback -- honestly unresolvable, not defaulted to a guessed number.
  return { bytesPerCode: resolvedFont.bytesPerCode, defaultWidth: 0, glyphWidths: new Map(), source: "Unknown" };
}

// The advance of one glyph, in real PDF points at the given font size --
// per spec 9.2.4's horizontal displacement formula, the "w0" term (glyph
// width from the font program/metrics) scaled by Tfs, before Tc/Tw/Th are
// added by stringAdvance below.
export function glyphAdvancePt(code: number, metrics: FontMetrics, fontSizePt: number): number {
  const widthUnits = metrics.glyphWidths.get(code) ?? metrics.defaultWidth;
  return (widthUnits / 1000) * fontSizePt;
}

export type TextShowState = {
  fontSizePt: number;
  charSpacing: number;
  wordSpacing: number;
  horizontalScalingPct: number;
};

// Total horizontal displacement (real PDF points) of showing `codes` in
// sequence, per spec 9.4.3's tx formula:
//   tx = ((w0 - Tj/1000) * Tfs + Tc + Tw) * Th
// with no TJ adjustment (Tj term is 0) and Tw only applying to a
// single-byte code 32 (the space character, and ONLY for simple fonts --
// per spec, word spacing never applies to a 2-byte code in a composite
// font, even if that code's value happens to be 32).
export function stringAdvancePt(codes: number[], metrics: FontMetrics, state: TextShowState): number {
  const scale = state.horizontalScalingPct / 100;
  let total = 0;
  for (const code of codes) {
    const glyphWidthPt = glyphAdvancePt(code, metrics, state.fontSizePt);
    const wordSpacing = metrics.bytesPerCode === 1 && code === 32 ? state.wordSpacing : 0;
    total += (glyphWidthPt + state.charSpacing + wordSpacing) * scale;
  }
  return total;
}

export type SpacingComparison = {
  originalAdvancePt: number;
  replacementAdvancePt: number;
  deltaPt: number;
  /**
   * The number to insert as a TJ array adjustment operand so the
   * replacement ends at the same horizontal position the original did --
   * the exact inverse of spec 9.4.3's Tj/1000 term. Positive shifts left
   * (moves text backward, per TJ's convention), matching how a positive
   * TJ number is subtracted from horizontal position.
   */
  tjAdjustment: number;
};

// Compares an original run's real on-page advance against what a
// replacement code sequence would naturally take, and computes the single
// TJ adjustment number that would make up the difference. Both sequences
// must already be in the SAME font's glyph codes (i.e. the replacement's
// codes came from that font's own unicodeToGlyphCode map) -- comparing
// across two different fonts' codes would not be meaningful.
export function compareAdvance(
  originalCodes: number[],
  replacementCodes: number[],
  metrics: FontMetrics,
  state: TextShowState,
): SpacingComparison {
  const originalAdvancePt = stringAdvancePt(originalCodes, metrics, state);
  const replacementAdvancePt = stringAdvancePt(replacementCodes, metrics, state);
  const deltaPt = replacementAdvancePt - originalAdvancePt;
  const scale = state.horizontalScalingPct / 100;
  const tjAdjustment = scale === 0 ? 0 : (deltaPt / (state.fontSizePt * scale)) * 1000;
  return { originalAdvancePt, replacementAdvancePt, deltaPt, tjAdjustment };
}
