// lib/pdf/edit/fallbackFont.ts
//
// The fallback-font path lib/pdf/edit/editPlan.ts's module doc comment
// deliberately left out ("real, separate, later work") -- this is that
// work. It exists for exactly one situation: the replacement text needs a
// character the run's OWN font can't be proven to render, so
// lib/pdf/edit/fontEncoding.ts's classifyReplacementChar returns
// "requires-fallback"/"impossible" and the edit is rejected. Rather than
// stopping there, the edit can be shown in a SUBSTITUTE font, switched on
// for just that one operator and switched straight back afterward.
//
// The substitute is always one of the 14 standard PDF fonts, never a real
// font program embedded from disk. That is the central design decision
// here, and it is what makes this shippable rather than theoretical:
//
// - No new dependency. Embedding an arbitrary .ttf through pdf-lib needs
//   @pdf-lib/fontkit; a standard font needs nothing. (An earlier
//   investigation added and then removed that dependency after proving
//   fontkit cannot parse an already-embedded PDF subset at all -- the
//   embedded /FontFile2 of a Type0 subset has no cmap table.)
// - No megabyte of font binary shipped to the browser, and no font
//   program written into the output: a standard font is four dictionary
//   entries (verified: `<< /Type /Font /Subtype /Type1 /BaseFont
//   /Helvetica /Encoding /WinAnsiEncoding >>`).
// - Single-byte WinAnsi encoding, which this project already has verified
//   tables for (fontEncoding.ts) -- so the replacement glyph codes can be
//   computed PURELY, during the dry-run plan, with no document access.
//
// The cost is coverage: the substitute can only show characters
// WinAnsiEncoding covers (Latin-1 plus the Windows-1252 extras -- curly
// quotes, dashes, the euro sign, and so on). A character outside that,
// such as CJK or Devanagari, is still honestly rejected. That is not a
// gap this module could paper over anyway: there is no standard PDF font
// with those glyphs, so the only alternative would be shipping a CJK font
// binary to every user of a client-side tool.
//
// Self-contained apart from pdf-lib and @pdf-lib/standard-fonts (both
// already direct dependencies, both already imported by fontEncoding.ts
// and fontMetrics.ts) so this module runs under
// `node --experimental-strip-types` like the rest of lib/pdf/edit.

import { PDFArray, PDFDict, PDFName, PDFNumber, PDFRef, type PDFContext, type PDFDocument } from "pdf-lib";
import { Encodings, Font, FontNames } from "@pdf-lib/standard-fonts";
import type { FontMetrics } from "./fontMetrics.ts";

// The 12 text-showing standard fonts. Symbol and ZapfDingbats are
// deliberately excluded: they carry their own built-in encodings rather
// than WinAnsiEncoding, so none of the code-computation below would be
// valid for them, and neither is a sensible substitute for body text.
export type FallbackFontFamily =
  | "Helvetica"
  | "Helvetica-Bold"
  | "Helvetica-Oblique"
  | "Helvetica-BoldOblique"
  | "Times-Roman"
  | "Times-Bold"
  | "Times-Italic"
  | "Times-BoldItalic"
  | "Courier"
  | "Courier-Bold"
  | "Courier-Oblique"
  | "Courier-BoldOblique";

type StyleGroup = {
  regular: FallbackFontFamily;
  bold: FallbackFontFamily;
  italic: FallbackFontFamily;
  boldItalic: FallbackFontFamily;
};

const SANS: StyleGroup = {
  regular: "Helvetica",
  bold: "Helvetica-Bold",
  italic: "Helvetica-Oblique",
  boldItalic: "Helvetica-BoldOblique",
};
const SERIF: StyleGroup = {
  regular: "Times-Roman",
  bold: "Times-Bold",
  italic: "Times-Italic",
  boldItalic: "Times-BoldItalic",
};
const MONO: StyleGroup = {
  regular: "Courier",
  bold: "Courier-Bold",
  italic: "Courier-Oblique",
  boldItalic: "Courier-BoldOblique",
};

// --- WinAnsi encoding (pure) -------------------------------------------
//
// Built from the same @pdf-lib/standard-fonts Encodings table
// fontEncoding.ts already uses for the DECODE direction, so encode and
// decode can never drift apart. Verified against pdf-lib's own standard
// font embedder: PDFFont.encodeText("Café €5") produces exactly
// the bytes this table produces for the same string, which is the real
// guarantee that matters -- the substitute font written into the document
// is the same embedder's output.

const WIN_ANSI_UNICODE_TO_CODE = (() => {
  const map = new Map<string, number>();
  for (const codePoint of Encodings.WinAnsi.supportedCodePoints) {
    const { code } = Encodings.WinAnsi.encodeUnicodeCodePoint(codePoint);
    map.set(String.fromCodePoint(codePoint), code);
  }
  return map;
})();

/**
 * The single-byte WinAnsi glyph codes for `text`, or null if ANY character
 * in it falls outside WinAnsiEncoding's coverage. All-or-nothing on
 * purpose: a partial encoding would silently drop characters from the
 * user's replacement text, which is exactly the kind of quiet corruption
 * this whole engine rejects elsewhere.
 */
export function encodeWithFallbackFont(text: string): number[] | null {
  const codes: number[] = [];
  // Iterating a string yields whole code points (surrogate pairs stay
  // intact), so an astral character is looked up -- and correctly
  // rejected -- as one unit rather than as two lone surrogates.
  for (const char of text) {
    const code = WIN_ANSI_UNICODE_TO_CODE.get(char);
    if (code === undefined) return null;
    codes.push(code);
  }
  return codes;
}

/** The first character of `text` a fallback font still could not show, or null. */
export function firstUnencodableChar(text: string): string | null {
  for (const char of text) {
    if (!WIN_ANSI_UNICODE_TO_CODE.has(char)) return char;
  }
  return null;
}

// --- Substitute font metrics (pure) ------------------------------------

const metricsCache = new Map<FallbackFontFamily, FontMetrics>();

/**
 * Real AFM advance widths for a substitute font, keyed by WinAnsi glyph
 * code so the result plugs straight into fontMetrics.ts's stringAdvancePt
 * alongside codes from encodeWithFallbackFont. Built the same way
 * fontMetrics.ts's own resolveStandardFontAfmWidths builds them (per-glyph
 * `getWidthOfGlyph`, no kerning) -- deliberately NOT pdf-lib's
 * PDFFont.widthOfTextAtSize, which subtracts AFM kerning pairs. Kerning is
 * a layout-time nicety a PDF producer expresses as explicit TJ numbers; a
 * viewer showing a plain string applies only /Widths, so the un-kerned sum
 * is what actually lands on the page (measured: the two differ by 120
 * glyph-space units on "Total Amount 1350.00" in Helvetica).
 */
export function fallbackFontMetrics(family: FallbackFontFamily): FontMetrics {
  const cached = metricsCache.get(family);
  if (cached) return cached;

  const afm = Font.load(family as (typeof FontNames)[keyof typeof FontNames]);
  const glyphWidths = new Map<number, number>();
  for (const codePoint of Encodings.WinAnsi.supportedCodePoints) {
    const { code, name } = Encodings.WinAnsi.encodeUnicodeCodePoint(codePoint);
    if (glyphWidths.has(code)) continue;
    const width = afm.getWidthOfGlyph(name);
    if (typeof width === "number") glyphWidths.set(code, width);
  }

  const metrics: FontMetrics = { bytesPerCode: 1, defaultWidth: 0, glyphWidths, source: "StandardFontAFM" };
  metricsCache.set(family, metrics);
  return metrics;
}

// --- Picking a visually-matched substitute (pure) ----------------------
//
// Which of the 12 is chosen matters more than it might look. Measured on
// "Total Amount 1350.00" at 11pt, against Helvetica: Helvetica-Bold runs
// +5.1% wider, Times-Roman -7.1% narrower, Courier +22.0% wider. Picking
// the wrong CLASS is therefore a visible layout change, while picking the
// right one is usually near-exact (Arial and Helvetica are metric-
// compatible by design, as are the common Times clones). Whatever
// divergence remains is compensated by the TJ adjustment editPlan.ts
// computes -- see compareAdvanceAcrossFonts in fontMetrics.ts.

/**
 * Everything about a font that this module uses to guess how its
 * substitute should look. Read off the font's own dictionary by
 * readFallbackStyleHints below; kept as a plain struct so the choosing
 * logic itself stays pure and directly testable.
 */
export type FallbackStyleHints = {
  /** /BaseFont, subset prefix included or not -- stripped here either way. */
  baseFont: string;
  /** /FontDescriptor /Flags (PDF 32000-1 Table 123). */
  flags: number | null;
  /** /FontDescriptor /ItalicAngle -- nonzero means a slanted face. */
  italicAngle: number | null;
  /** /FontDescriptor /FontWeight -- CSS-style 100..900. */
  fontWeight: number | null;
};

const SUBSET_PREFIX = /^[A-Z]{6}\+/;

// PDF 32000-1 Table 123 (Font descriptor flags), 1-based bit positions.
const FLAG_FIXED_PITCH = 1 << 0;
const FLAG_SERIF = 1 << 1;
const FLAG_ITALIC = 1 << 6;
const FLAG_FORCE_BOLD = 1 << 18;

// "Mono" alone is too greedy -- "Monotype Corsiva" is a script face, not a
// fixed-pitch one -- so the bare word is only matched at a token boundary,
// alongside the handful of families that are unambiguously monospaced.
const MONO_NAME = /courier|consol|monaco|menlo|inconsolata|(^|[^a-z])mono([^a-z]|$)/i;
const SERIF_NAME = /times|georgia|garamond|cambria|palatino|book\s*antiqua|minion|constantia|century|roman|serif/i;
const SANS_NAME = /sans|arial|helvetica|verdana|tahoma|calibri|segoe|roboto|futura|gothic|grotesk/i;
const BOLD_NAME = /bold|black|heavy|semib|demib?|ultra/i;
const ITALIC_NAME = /italic|oblique/i;

const BOLD_FONT_WEIGHT = 600;

/**
 * Picks the standard font that best matches how the original font looks.
 *
 * BaseFont-name evidence is checked BEFORE descriptor flags, and wins
 * where the two disagree. That ordering is deliberate: a /BaseFont name is
 * authored per-font and is nearly always honest ("ABCDEF+Arial-BoldMT"),
 * whereas /Flags is routinely a copy-pasted constant -- 32 (Nonsymbolic)
 * with no Serif or Italic bit set, on a font that is plainly both.
 * Falls back to the flags only when the name says nothing.
 */
export function pickFallbackFont(hints: FallbackStyleHints): FallbackFontFamily {
  const name = hints.baseFont.replace(SUBSET_PREFIX, "");
  const flags = hints.flags ?? 0;

  // SANS_NAME is checked first for the serif decision so that the "serif"
  // inside "sans-serif" -- and the "roman" inside "Times New Roman" vs a
  // sans face's own "Roman" weight suffix (e.g. "HelveticaNeue-Roman") --
  // can't push an obviously-sans font onto Times.
  const looksSans = SANS_NAME.test(name);
  let group: StyleGroup;
  if (MONO_NAME.test(name) || (!looksSans && !SERIF_NAME.test(name) && (flags & FLAG_FIXED_PITCH) !== 0)) {
    group = MONO;
  } else if (!looksSans && (SERIF_NAME.test(name) || (flags & FLAG_SERIF) !== 0)) {
    group = SERIF;
  } else {
    group = SANS;
  }

  const bold =
    BOLD_NAME.test(name) ||
    (hints.fontWeight !== null && hints.fontWeight >= BOLD_FONT_WEIGHT) ||
    (flags & FLAG_FORCE_BOLD) !== 0;
  const italic =
    ITALIC_NAME.test(name) ||
    (hints.italicAngle !== null && hints.italicAngle !== 0) ||
    (flags & FLAG_ITALIC) !== 0;

  if (bold && italic) return group.boldItalic;
  if (bold) return group.bold;
  if (italic) return group.italic;
  return group.regular;
}

// --- Reading the hints off a real font dictionary ----------------------

function asNumber(obj: unknown): number | null {
  return obj instanceof PDFNumber ? obj.asNumber() : null;
}

function nameString(obj: unknown): string | null {
  return obj instanceof PDFName ? obj.asString().replace(/^\//, "") : null;
}

function resolveDict(value: unknown, context: PDFContext): PDFDict | undefined {
  if (value instanceof PDFDict) return value;
  // Untyped lookup + instanceof, never lookupMaybe(ref, Type): the latter
  // throws on the WRONG type and returns undefined only for a MISSING one.
  // This file postdates c202541's sweep, so it reintroduced the pattern.
  const resolved = value instanceof PDFRef ? context.lookup(value) : undefined;
  return resolved instanceof PDFDict ? resolved : undefined;
}

/**
 * Reads style hints off a font resource dictionary. For a Type0 font the
 * descriptor lives on the descendant CIDFont, not the Type0 dict itself,
 * so it's followed there -- mirroring how fontEncoding.ts's resolveFont
 * already walks /DescendantFonts.
 */
export function readFallbackStyleHints(fontDict: PDFDict, context: PDFContext): FallbackStyleHints {
  const baseFont = nameString(fontDict.get(PDFName.of("BaseFont"))) ?? "";

  let descriptorHost: PDFDict | undefined = fontDict;
  if (nameString(fontDict.get(PDFName.of("Subtype"))) === "Type0") {
    const descendants = fontDict.get(PDFName.of("DescendantFonts"));
    const descendantsResolved = descendants instanceof PDFRef ? context.lookup(descendants) : descendants;
    const resolvedDescendants = descendantsResolved instanceof PDFArray ? descendantsResolved : undefined;
    descriptorHost =
      resolvedDescendants instanceof PDFArray && resolvedDescendants.size() > 0
        ? resolveDict(resolvedDescendants.get(0), context)
        : undefined;
  }

  const descriptor = descriptorHost ? resolveDict(descriptorHost.get(PDFName.of("FontDescriptor")), context) : undefined;
  if (!descriptor) return { baseFont, flags: null, italicAngle: null, fontWeight: null };

  return {
    baseFont,
    flags: asNumber(descriptor.get(PDFName.of("Flags"))),
    italicAngle: asNumber(descriptor.get(PDFName.of("ItalicAngle"))),
    fontWeight: asNumber(descriptor.get(PDFName.of("FontWeight"))),
  };
}

// --- Registering the substitute in the right /Resources /Font ----------

const FALLBACK_RESOURCE_PREFIX = "LumeoFallback";

// A dictionary this module could have written itself, or one the document
// already happens to contain: a bare standard font with no descriptor and
// a plain /WinAnsiEncoding name (NOT an /Encoding dictionary, which could
// carry a /Differences array that would silently remap the very codes
// encodeWithFallbackFont just computed). Reusing one avoids adding a
// second, identical font object every time another character needs the
// same substitute.
function isReusableSubstitute(dict: PDFDict, family: FallbackFontFamily): boolean {
  return (
    nameString(dict.get(PDFName.of("Subtype"))) === "Type1" &&
    nameString(dict.get(PDFName.of("BaseFont"))) === family &&
    nameString(dict.get(PDFName.of("Encoding"))) === "WinAnsiEncoding" &&
    !dict.has(PDFName.of("FontDescriptor"))
  );
}

// Substitutes embedded into a document during THIS session, by family.
//
// Needed because pdf-lib's embedFont() only reserves a ref up front and
// materializes the actual font dictionary during save() -- so between
// embedding and saving, context.lookup(ref) resolves to nothing and the
// isReusableSubstitute scan below cannot see a substitute this module
// itself added moments earlier. Without this, applying several fallback
// edits before saving would embed a duplicate font object every time
// (proven by test, not theorised). Keyed weakly on the document so
// nothing is retained once the caller drops it.
const embeddedByDocument = new WeakMap<PDFDocument, Map<FallbackFontFamily, PDFRef>>();

/**
 * Ensures `fontsDict` contains a usable substitute font of `family` and
 * returns the resource name to write into a Tf operator (no leading
 * slash, matching contentStream.ts's fontResourceName convention).
 *
 * Reuses an existing equivalent entry when there is one -- whether this
 * module added it or the document already contained a plain standard font
 * of the same family -- so applying several fallback edits adds exactly
 * one font object, not one per edit.
 */
export async function ensureFallbackFontResource(
  doc: PDFDocument,
  fontsDict: PDFDict,
  family: FallbackFontFamily,
): Promise<string> {
  let embeddedForDoc = embeddedByDocument.get(doc);
  const knownRef = embeddedForDoc?.get(family);

  for (const [key, value] of fontsDict.entries()) {
    // pdf-lib interns PDFRefs through a shared pool, so two references to
    // the same object really are the same instance.
    if (knownRef !== undefined && value === knownRef) return key.asString().replace(/^\//, "");
    const dict = resolveDict(value, doc.context);
    if (dict && isReusableSubstitute(dict, family)) return key.asString().replace(/^\//, "");
  }

  const ref = knownRef ?? (await doc.embedFont(family)).ref;
  if (!embeddedForDoc) {
    embeddedForDoc = new Map();
    embeddedByDocument.set(doc, embeddedForDoc);
  }
  embeddedForDoc.set(family, ref);

  let index = 0;
  let name = `${FALLBACK_RESOURCE_PREFIX}${index}`;
  while (fontsDict.has(PDFName.of(name))) {
    index += 1;
    name = `${FALLBACK_RESOURCE_PREFIX}${index}`;
  }
  fontsDict.set(PDFName.of(name), ref);
  return name;
}

function getOrCreateFontsDict(context: PDFContext, resources: PDFDict): PDFDict {
  const existing = resolveDict(resources.get(PDFName.of("Font")), context);
  if (existing) return existing;
  const created = context.obj({});
  resources.set(PDFName.of("Font"), created);
  return created;
}

/**
 * Finds the /Resources /Font dictionary a Tf inside the target stream
 * would actually resolve names against, creating the /Font sub-dictionary
 * if it's missing.
 *
 * `formStreamDict` is the Form XObject's own stream dictionary when the
 * edit lands inside one, else null. A Form with its own /Resources owns
 * its name space, so the substitute is registered there; a Form WITHOUT
 * one inherits the page's (spec 8.10.1, and exactly what
 * formXObjects.ts's own resource walk already does), so the substitute
 * goes on the page instead of manufacturing a /Resources dictionary that
 * would shadow every name the Form was inheriting.
 *
 * Note that a page's /Resources may itself be inherited from an ancestor
 * /Pages node, in which case the dictionary returned is shared with sibling
 * pages. Adding one more entry to it is purely additive -- other pages
 * gain an unused font name and nothing else -- which is a far smaller
 * blast radius than giving this page its own /Resources and thereby
 * shadowing every inherited name it still needs.
 */
export function resolveFallbackFontsDict(
  doc: PDFDocument,
  pageIndex: number,
  formStreamDict: PDFDict | null,
): PDFDict {
  const context = doc.context;

  if (formStreamDict) {
    const formResources = resolveDict(formStreamDict.get(PDFName.of("Resources")), context);
    if (formResources) return getOrCreateFontsDict(context, formResources);
  }

  const page = doc.getPages()[pageIndex];
  if (!page) throw new Error(`Page ${pageIndex} does not exist in this document.`);

  // PDFPageLeaf.Resources() already resolves the inherited attribute, so
  // this returns an ancestor's dictionary when the page has none of its
  // own (verified against pdf-lib directly).
  const existing = page.node.Resources();
  if (existing) return getOrCreateFontsDict(context, existing);

  const created = context.obj({});
  page.node.set(PDFName.of("Resources"), created);
  return getOrCreateFontsDict(context, created);
}
