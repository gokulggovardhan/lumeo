// lib/pdf/edit/fontEncoding.ts
//
// Phase 2 of true PDF text editing, slice 2: resolve a page's font
// resource (the dictionary a matched content-stream operator's Tf points
// at, see lib/pdf/edit/contentStream.ts) into glyph-code<->Unicode maps,
// so a later slice can (a) decode an existing run's raw glyph-code bytes
// into readable text, and (b) determine whether a desired replacement
// character can be safely encoded back into the SAME font.
//
// Never modifies anything -- read-only resolution. Deliberately narrow
// where real uncertainty exists (embedded subset fonts, non-Identity
// composite-font encodings, StandardEncoding) rather than guessing: every
// classification below is backed by a specific, checkable reason, not an
// assumption about font internals this module doesn't parse (glyph
// outlines, TrueType cmap tables, CFF CharStrings).
//
// Two verified real data sources back the base encodings instead of a
// hand-transcribed spec table (both cross-checked against PDF 32000-1
// Appendix D's known values before use):
// - WinAnsiEncoding is byte-for-byte the "windows-1252" charset Node's
//   built-in TextDecoder already implements (WHATWG Encoding spec).
// - MacRomanEncoding is byte-for-byte the "macintosh" charset, likewise
//   built into TextDecoder.
// - @pdf-lib/standard-fonts (already an indirect pdf-lib dependency, now
//   also a direct one -- see package.json) supplies the ~218 standard
//   Adobe glyph *names* WinAnsiEncoding covers, needed to resolve a
//   /Differences array's named overrides back to Unicode.

import { PDFArray, PDFDict, PDFName, PDFRawStream, PDFRef, PDFStream, decodePDFRawStream, type PDFContext } from "pdf-lib";
import { Encodings } from "@pdf-lib/standard-fonts";
import { tokenizeContentStream, type ContentStreamToken } from "./contentStream.ts";

export type FontKind = "Type1" | "TrueType" | "MMType1" | "Type3" | "Type0" | "Unknown";

export type EncodingSource =
  | "WinAnsi"
  | "MacRoman"
  | "WinAnsi+Differences"
  | "MacRoman+Differences"
  | "Differences-only"
  | "ToUnicode"
  | "Unknown";

export type ResolvedFont = {
  kind: FontKind;
  baseFont: string;
  isEmbedded: boolean;
  isSubset: boolean;
  bytesPerCode: 1 | 2;
  encodingSource: EncodingSource;
  glyphCodeToUnicode: Map<number, string>;
  /**
   * Only populated with codes this module can vouch for -- see
   * classifyReplacementChar's doc comment for exactly what "vouch for"
   * means per font kind. A character's absence here does NOT necessarily
   * mean the font can't render it, only that this module can't prove it
   * safely; see classifyReplacementChar.
   */
  unicodeToGlyphCode: Map<string, number>;
};

const SUBSET_PREFIX = /^[A-Z]{6}\+/;

function nameString(obj: unknown): string | null {
  return obj instanceof PDFName ? obj.asString().replace(/^\//, "") : null;
}

// pdf-lib's context.lookupMaybe(ref, Type) throws UnexpectedObjectTypeError
// (same as the strict lookup(ref, Type)) when the ref resolves to an object
// of the WRONG type -- it only returns undefined for a missing/null object.
// Every call site below uses the type-less lookup(ref) instead and
// instanceof-checks the result itself, so a malformed PDF (an indirect
// reference pointing at an unexpected type) degrades gracefully instead of
// throwing. See lib/pdf/edit/formXObjects.ts's resolveMaybe for the same fix.
function lookupDict(ref: PDFRef, context: PDFContext): PDFDict | undefined {
  const resolved = context.lookup(ref);
  return resolved instanceof PDFDict ? resolved : undefined;
}

function resolveDictMaybe(entry: unknown, context: PDFContext): PDFDict | undefined {
  const resolved = entry instanceof PDFRef ? context.lookup(entry) : entry;
  return resolved instanceof PDFDict ? resolved : undefined;
}

function lookupStream(ref: PDFRef, context: PDFContext): PDFStream | undefined {
  const resolved = context.lookup(ref);
  return resolved instanceof PDFStream ? resolved : undefined;
}

function buildWinAnsiTable(): { codeToUnicode: Map<number, string>; nameToUnicode: Map<string, string> } {
  const codeToUnicode = new Map<number, string>();
  for (let code = 0; code < 256; code += 1) {
    const char = new TextDecoder("windows-1252").decode(Uint8Array.of(code));
    // windows-1252 leaves a handful of codes (0x81, 0x8D, 0x8F, 0x90, 0x9D)
    // as unmapped control-range placeholders (decodes to the byte's own
    // C1 control codepoint) -- those aren't real WinAnsiEncoding glyphs.
    if (char.codePointAt(0) !== code || code < 0x80) codeToUnicode.set(code, char);
  }
  const nameToUnicode = new Map<string, string>();
  for (const codePoint of Encodings.WinAnsi.supportedCodePoints) {
    const { name } = Encodings.WinAnsi.encodeUnicodeCodePoint(codePoint);
    nameToUnicode.set(name, String.fromCodePoint(codePoint));
  }
  return { codeToUnicode, nameToUnicode };
}

function buildMacRomanTable(): Map<number, string> {
  const codeToUnicode = new Map<number, string>();
  for (let code = 0; code < 256; code += 1) {
    const char = new TextDecoder("macintosh").decode(Uint8Array.of(code));
    if (char.codePointAt(0) !== code || code < 0x80) codeToUnicode.set(code, char);
  }
  return codeToUnicode;
}

// Built once per module load -- pure lookup tables, no per-call cost worth
// avoiding by lazy-computing them.
const WIN_ANSI = buildWinAnsiTable();
const MAC_ROMAN_CODE_TO_UNICODE = buildMacRomanTable();

// Resolves one /Differences array entry name to a Unicode character.
// Supports the "uniXXXX" convention (unambiguous, no table needed) and the
// ~218 standard Adobe glyph names WinAnsiEncoding covers (shared across
// WinAnsi/MacRoman/StandardEncoding's common vocabulary). A name outside
// both is left unresolved rather than guessed.
function resolveGlyphName(name: string): string | null {
  const uniMatch = /^uni([0-9A-Fa-f]{4})$/.exec(name);
  if (uniMatch) return String.fromCodePoint(Number.parseInt(uniMatch[1], 16));
  return WIN_ANSI.nameToUnicode.get(name) ?? null;
}

function applyDifferences(
  differences: PDFArray,
  codeToUnicode: Map<number, string>,
): void {
  let currentCode = 0;
  for (let i = 0; i < differences.size(); i += 1) {
    const entry = differences.get(i);
    if (entry instanceof PDFName) {
      const resolved = resolveGlyphName(entry.asString().replace(/^\//, ""));
      if (resolved) codeToUnicode.set(currentCode, resolved);
      else codeToUnicode.delete(currentCode);
      currentCode += 1;
    } else {
      // A bare number resets the "current code" for subsequent names, per
      // spec (7.5.5 Table 114 -- Entries in an Encoding dictionary).
      const asNumber = (entry as { asNumber?: () => number }).asNumber?.();
      if (typeof asNumber === "number") currentCode = asNumber;
    }
  }
}

function resolveSimpleFontEncoding(fontDict: PDFDict, context: PDFContext): {
  codeToUnicode: Map<number, string>;
  source: EncodingSource;
} {
  const encodingEntry = fontDict.get(PDFName.of("Encoding"));

  if (encodingEntry instanceof PDFName) {
    const name = encodingEntry.asString();
    if (name === "/WinAnsiEncoding") return { codeToUnicode: new Map(WIN_ANSI.codeToUnicode), source: "WinAnsi" };
    if (name === "/MacRomanEncoding") return { codeToUnicode: new Map(MAC_ROMAN_CODE_TO_UNICODE), source: "MacRoman" };
    // StandardEncoding and any other named encoding aren't backed by a
    // verified table in this slice -- see module doc comment.
    return { codeToUnicode: new Map(), source: "Unknown" };
  }

  if (encodingEntry instanceof PDFRef) {
    const resolved = lookupDict(encodingEntry, context);
    if (resolved) return resolveSimpleFontEncodingDict(resolved);
  }
  if (encodingEntry instanceof PDFDict) {
    return resolveSimpleFontEncodingDict(encodingEntry);
  }

  return { codeToUnicode: new Map(), source: "Unknown" };
}

function resolveSimpleFontEncodingDict(dict: PDFDict): { codeToUnicode: Map<number, string>; source: EncodingSource } {
  const baseEncoding = nameString(dict.get(PDFName.of("BaseEncoding")));
  let codeToUnicode: Map<number, string>;
  let baseSource: "WinAnsi" | "MacRoman" | null;

  if (baseEncoding === "WinAnsiEncoding") {
    codeToUnicode = new Map(WIN_ANSI.codeToUnicode);
    baseSource = "WinAnsi";
  } else if (baseEncoding === "MacRomanEncoding") {
    codeToUnicode = new Map(MAC_ROMAN_CODE_TO_UNICODE);
    baseSource = "MacRoman";
  } else {
    // No BaseEncoding (or an unrecognized one): per spec this falls back to
    // the font's own built-in encoding, which this module doesn't parse.
    // Differences entries can still be resolved on their own below.
    codeToUnicode = new Map();
    baseSource = null;
  }

  const differences = dict.get(PDFName.of("Differences"));
  if (differences instanceof PDFArray) {
    applyDifferences(differences, codeToUnicode);
    return {
      codeToUnicode,
      source: baseSource ? (`${baseSource}+Differences` as EncodingSource) : "Differences-only",
    };
  }

  return { codeToUnicode, source: baseSource ?? "Unknown" };
}

// --- ToUnicode CMap parsing (Type0/composite fonts) -------------------------
//
// A ToUnicode CMap is its own tiny PostScript-like content stream (hex
// strings, numbers, names, and a handful of begin/end operators) -- reuses
// this project's own content-stream tokenizer (lib/pdf/edit/contentStream.ts)
// since the lexical grammar (hex strings, numbers, operators) is the same,
// rather than writing a second, near-duplicate tokenizer.

function hexStringToCodePoint(bytes: Uint8Array): string {
  // ToUnicode destination strings are UTF-16BE; may be more than 2 bytes
  // for a codepoint needing a surrogate pair, or even a short ligature.
  const codeUnits: number[] = [];
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    codeUnits.push((bytes[i] << 8) | bytes[i + 1]);
  }
  return String.fromCharCode(...codeUnits);
}

function hexStringToCode(bytes: Uint8Array): number {
  let value = 0;
  for (const byte of bytes) value = (value << 8) | byte;
  return value;
}

function isOperator(token: ContentStreamToken | undefined, value: string): boolean {
  return token !== undefined && token.type === "operator" && token.value === value;
}

function parseToUnicodeCMap(bytes: Uint8Array): Map<number, string> {
  const tokens = tokenizeContentStream(bytes);
  const map = new Map<number, string>();

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token.type !== "operator") continue;

    if (token.value === "beginbfchar") {
      i += 1;
      while (i < tokens.length && !isOperator(tokens[i], "endbfchar")) {
        const src = tokens[i];
        const dst = tokens[i + 1];
        if (src?.type === "hexString" && dst?.type === "hexString") {
          map.set(hexStringToCode(src.value), hexStringToCodePoint(dst.value));
        }
        i += 2;
      }
      continue;
    }

    if (token.value === "beginbfrange") {
      i += 1;
      while (i < tokens.length && !isOperator(tokens[i], "endbfrange")) {
        const lo = tokens[i];
        const hi = tokens[i + 1];
        const dst = tokens[i + 2];
        if (lo?.type === "hexString" && hi?.type === "hexString" && dst?.type === "hexString") {
          // <lo> <hi> <dst>: a linear run, each src code offset from lo
          // maps to dst's codepoint plus that same offset.
          const loCode = hexStringToCode(lo.value);
          const hiCode = hexStringToCode(hi.value);
          const dstBase = hexStringToCode(dst.value);
          for (let code = loCode; code <= hiCode; code += 1) {
            map.set(code, String.fromCodePoint(dstBase + (code - loCode)));
          }
          i += 3;
          continue;
        }
        if (lo?.type === "hexString" && hi?.type === "hexString" && dst?.type === "arrayStart") {
          // <lo> <hi> [<d0> <d1> ...]: each src code maps to its own
          // explicit destination string, in array order.
          const loCode = hexStringToCode(lo.value);
          let cursor = i + 3;
          let code = loCode;
          while (cursor < tokens.length && tokens[cursor].type !== "arrayEnd") {
            const entry = tokens[cursor];
            if (entry.type === "hexString") {
              map.set(code, hexStringToCodePoint(entry.value));
              code += 1;
            }
            cursor += 1;
          }
          i = cursor + 1;
          continue;
        }
        i += 1;
      }
      continue;
    }
  }

  return map;
}

function findToUnicodeMap(fontDict: PDFDict, context: PDFContext): Map<number, string> | null {
  const toUnicodeEntry = fontDict.get(PDFName.of("ToUnicode"));
  const streamCandidate = toUnicodeEntry instanceof PDFRef ? lookupStream(toUnicodeEntry, context) : undefined;
  if (!streamCandidate || !(streamCandidate instanceof PDFRawStream)) return null;
  const stream = streamCandidate;
  try {
    const decoded = decodePDFRawStream(stream).decode();
    return parseToUnicodeCMap(decoded);
  } catch {
    return null;
  }
}

function isEmbedded(descriptor: PDFDict | undefined): boolean {
  if (!descriptor) return false;
  return (
    descriptor.has(PDFName.of("FontFile")) ||
    descriptor.has(PDFName.of("FontFile2")) ||
    descriptor.has(PDFName.of("FontFile3"))
  );
}

function fontDescriptorOf(fontDict: PDFDict, context: PDFContext): PDFDict | undefined {
  const ref = fontDict.get(PDFName.of("FontDescriptor"));
  return ref instanceof PDFRef ? lookupDict(ref, context) : undefined;
}

// Resolves a font resource dictionary (the object a matched
// TextShowOperator's fontResourceName looks up in the page's
// /Resources /Font dict) into glyph-code<->Unicode maps.
export function resolveFont(fontDict: PDFDict, context: PDFContext): ResolvedFont {
  const subtype = nameString(fontDict.get(PDFName.of("Subtype"))) as FontKind | null;
  const kind: FontKind = subtype ?? "Unknown";
  const baseFont = nameString(fontDict.get(PDFName.of("BaseFont"))) ?? "";
  const isSubset = SUBSET_PREFIX.test(baseFont);

  if (kind === "Type0") {
    const descendantFonts = fontDict.get(PDFName.of("DescendantFonts"));
    const descendantDict =
      descendantFonts instanceof PDFArray && descendantFonts.size() > 0
        ? resolveDictMaybe(descendantFonts.get(0), context)
        : undefined;
    const descriptor = descendantDict ? fontDescriptorOf(descendantDict, context) : undefined;
    const embedded = isEmbedded(descriptor);

    const toUnicode = findToUnicodeMap(fontDict, context);
    if (!toUnicode || toUnicode.size === 0) {
      return {
        kind,
        baseFont,
        isEmbedded: embedded,
        isSubset,
        bytesPerCode: 2,
        encodingSource: "Unknown",
        glyphCodeToUnicode: new Map(),
        unicodeToGlyphCode: new Map(),
      };
    }

    const unicodeToGlyphCode = new Map<string, number>();
    for (const [code, unicode] of toUnicode) {
      // Keep the first (lowest) code for a given character if the CMap
      // maps more than one code to the same Unicode value -- an arbitrary
      // but stable and deterministic tie-break, not a guess about which
      // code is "more correct."
      if (!unicodeToGlyphCode.has(unicode)) unicodeToGlyphCode.set(unicode, code);
    }

    return {
      kind,
      baseFont,
      isEmbedded: embedded,
      isSubset,
      bytesPerCode: 2,
      encodingSource: "ToUnicode",
      glyphCodeToUnicode: toUnicode,
      unicodeToGlyphCode,
    };
  }

  // Simple (single-byte) font: Type1, TrueType, MMType1, Type3, or an
  // unrecognized Subtype (treated the same as "Unknown" -- resolution
  // still attempted from Encoding/Differences, since those are equally
  // meaningful regardless of Subtype).
  const descriptor = fontDescriptorOf(fontDict, context);
  const embedded = isEmbedded(descriptor);
  const { codeToUnicode, source } = resolveSimpleFontEncoding(fontDict, context);

  const unicodeToGlyphCode = new Map<string, number>();
  for (const [code, unicode] of codeToUnicode) {
    if (!unicodeToGlyphCode.has(unicode)) unicodeToGlyphCode.set(unicode, code);
  }

  return {
    kind,
    baseFont,
    isEmbedded: embedded,
    isSubset,
    bytesPerCode: 1,
    encodingSource: source,
    glyphCodeToUnicode: codeToUnicode,
    unicodeToGlyphCode,
  };
}

export type ReplacementClassification = "editable" | "requires-fallback" | "impossible";

// Classifies whether a single Unicode character can be safely written back
// into `font` in place, based only on what resolveFont could actually
// verify:
//
// - "impossible": this module can't even reliably decode this font's own
//   EXISTING text (no recognized Encoding/Differences/ToUnicode source) --
//   editing anything in this font is off the table regardless of which
//   character is wanted.
// - "editable": the character has a proven-safe glyph code. For a Type0
//   font this means the character already appears somewhere in this exact
//   font's own ToUnicode map -- i.e. it's DEFINITELY already used
//   somewhere in the document with this font, so the glyph provably
//   exists. For a non-embedded or non-subset simple font, the character
//   is within that encoding's full standard coverage, which such a font
//   is guaranteed to have (it isn't missing glyphs the way a subset can).
// - "requires-fallback": the character isn't in the resolved map at all,
//   OR the font is an embedded SUBSET simple font -- for those, the
//   nominal encoding table says a code exists, but a subsetted font's
//   embedded glyph program may genuinely not contain that glyph, and this
//   module doesn't parse font binaries to check. Both cases mean: this
//   exact font probably can't be trusted for that character without a
//   fallback font, but the situation isn't as hopeless as "impossible."
export function classifyReplacementChar(font: ResolvedFont, char: string): ReplacementClassification {
  if (font.encodingSource === "Unknown") return "impossible";

  const hasVerifiedCode = font.unicodeToGlyphCode.has(char);
  if (!hasVerifiedCode) return "requires-fallback";

  if (font.kind !== "Type0" && font.isEmbedded && font.isSubset) {
    return "requires-fallback";
  }

  return "editable";
}
