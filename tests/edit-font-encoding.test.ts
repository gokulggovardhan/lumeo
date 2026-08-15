import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument, PDFDict, PDFName, StandardFonts } from "pdf-lib";
import { resolveFont, classifyReplacementChar } from "../lib/pdf/edit/fontEncoding.ts";

test("resolveFont on a real pdf-lib-embedded standard font (WinAnsiEncoding) covers full Latin-1 range", async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText("Hi", { x: 50, y: 700, size: 18, font });

  const bytes = await doc.save();
  const loaded = await PDFDocument.load(bytes);
  const loadedPage = loaded.getPages()[0];
  const resources = loadedPage.node.Resources()!;
  const fontResources = resources.lookup(PDFName.of("Font"), PDFDict);
  const resourceKey = fontResources.keys()[0];
  const fontDict = loaded.context.lookup(fontResources.get(resourceKey), PDFDict);

  const resolved = resolveFont(fontDict, loaded.context);
  assert.equal(resolved.kind, "Type1");
  assert.equal(resolved.baseFont, "Helvetica");
  assert.equal(resolved.isEmbedded, false);
  assert.equal(resolved.isSubset, false);
  assert.equal(resolved.encodingSource, "WinAnsi");
  assert.equal(resolved.glyphCodeToUnicode.get(0x41), "A");
  assert.equal(resolved.glyphCodeToUnicode.get(0x61), "a");
  // Euro sign lives at 0x80 in WinAnsiEncoding (cp1252), not present in
  // plain Latin-1/ASCII -- proves the real windows-1252 table is in use,
  // not a naive ASCII-only stand-in.
  assert.equal(resolved.glyphCodeToUnicode.get(0x80), "€");

  assert.equal(classifyReplacementChar(resolved, "A"), "editable");
  assert.equal(classifyReplacementChar(resolved, "€"), "editable");
  // A character genuinely outside WinAnsiEncoding's coverage (e.g. a CJK
  // ideograph) has no code at all in this single-byte encoding.
  assert.equal(classifyReplacementChar(resolved, "中"), "requires-fallback");
});

test("resolveFont resolves a hand-built /MacRomanEncoding font dict via the real macintosh charset table", async () => {
  const doc = await PDFDocument.create();
  const context = doc.context;
  const fontDict = context.obj({
    Type: "Font",
    Subtype: "Type1",
    BaseFont: "Helvetica",
    Encoding: "MacRomanEncoding",
  });

  const resolved = resolveFont(fontDict, context);
  assert.equal(resolved.encodingSource, "MacRoman");
  assert.equal(resolved.glyphCodeToUnicode.get(0x41), "A");
  // 0x80 in MacRomanEncoding is Adieresis (Ä), a well-known, easily
  // cross-checkable divergence from WinAnsiEncoding's 0x80 (Euro sign) --
  // proves the MacRoman table, not WinAnsi, is actually in effect.
  assert.equal(resolved.glyphCodeToUnicode.get(0x80), "Ä");
  assert.equal(classifyReplacementChar(resolved, "Ä"), "editable");
});

test("resolveFont applies /Differences overrides (uniXXXX and standard glyph names) on top of a base encoding", async () => {
  const doc = await PDFDocument.create();
  const context = doc.context;
  const fontDict = context.obj({
    Type: "Font",
    Subtype: "Type1",
    BaseFont: "Helvetica",
    Encoding: {
      BaseEncoding: "WinAnsiEncoding",
      Differences: [200, "bullet", "uni20AC", 210, "endash"],
    },
  });

  const resolved = resolveFont(fontDict, context);
  assert.equal(resolved.encodingSource, "WinAnsi+Differences");
  // Code 200 overridden to bullet (standard Adobe glyph name, resolved via
  // @pdf-lib/standard-fonts's WinAnsi name table).
  assert.equal(resolved.glyphCodeToUnicode.get(200), "•");
  // Code 201 (sequential after 200) overridden to the Euro sign via the
  // uniXXXX convention.
  assert.equal(resolved.glyphCodeToUnicode.get(201), "€");
  // Code 210 overridden to endash.
  assert.equal(resolved.glyphCodeToUnicode.get(210), "–");
  // Untouched codes still come from the WinAnsi base table.
  assert.equal(resolved.glyphCodeToUnicode.get(0x41), "A");
});

test("resolveFont parses a Type0/CIDFontType2 font's ToUnicode CMap (bfchar and bfrange)", async () => {
  const doc = await PDFDocument.create();
  const context = doc.context;

  const cidFontDict = context.obj({
    Type: "Font",
    Subtype: "CIDFontType2",
    BaseFont: "MyCIDFont",
    CIDSystemInfo: { Registry: "Adobe", Ordering: "Identity", Supplement: 0 },
    CIDToGIDMap: "Identity",
  });
  const cidFontRef = context.register(cidFontDict);

  const cmapText = [
    "/CIDInit /ProcSet findresource begin",
    "12 dict begin",
    "begincmap",
    "1 begincodespacerange",
    "<0000> <FFFF>",
    "endcodespacerange",
    "2 beginbfchar",
    "<0003> <0048>",
    "<0004> <0065>",
    "endbfchar",
    "1 beginbfrange",
    "<0005> <0007> <006C>",
    "endbfrange",
    "endcmap",
    "end",
    "end",
  ].join("\n");
  const toUnicodeStreamRef = context.register(context.stream(cmapText));

  const type0Dict = context.obj({
    Type: "Font",
    Subtype: "Type0",
    BaseFont: "MyCIDFont",
    Encoding: "Identity-H",
    DescendantFonts: [cidFontRef],
    ToUnicode: toUnicodeStreamRef,
  });

  const resolved = resolveFont(type0Dict, context);
  assert.equal(resolved.kind, "Type0");
  assert.equal(resolved.bytesPerCode, 2);
  assert.equal(resolved.encodingSource, "ToUnicode");
  assert.equal(resolved.isEmbedded, false);

  // bfchar entries.
  assert.equal(resolved.glyphCodeToUnicode.get(0x0003), "H");
  assert.equal(resolved.glyphCodeToUnicode.get(0x0004), "e");
  // bfrange <0005> <0007> <006C> -> codes 5,6,7 map to 'l','m','n'
  // (0x6C, 0x6D, 0x6E) -- proves the linear-range offset math.
  assert.equal(resolved.glyphCodeToUnicode.get(0x0005), "l");
  assert.equal(resolved.glyphCodeToUnicode.get(0x0006), "m");
  assert.equal(resolved.glyphCodeToUnicode.get(0x0007), "n");

  // Because this font's ToUnicode already proves code 0x0003 renders "H",
  // that exact character is safely re-encodable.
  assert.equal(classifyReplacementChar(resolved, "H"), "editable");
  // A character never seen in this font's ToUnicode map at all -- this
  // module has no proof a glyph for it exists.
  assert.equal(classifyReplacementChar(resolved, "Z"), "requires-fallback");
});

test("resolveFont detects a subset-embedded font and downgrades classification to requires-fallback even for nominally-covered characters", async () => {
  const doc = await PDFDocument.create();
  const context = doc.context;

  // A minimal (fake, non-functional) FontFile2 stream -- resolveFont only
  // checks for the entry's presence, it never parses the glyph program.
  const fontFileRef = context.register(context.stream(new Uint8Array([0, 1, 2, 3])));
  const descriptorDict = context.obj({
    Type: "FontDescriptor",
    FontName: "ABCDEF+Helvetica",
    Flags: 32,
    FontFile2: fontFileRef,
  });
  const descriptorRef = context.register(descriptorDict);

  const fontDict = context.obj({
    Type: "Font",
    Subtype: "TrueType",
    BaseFont: "ABCDEF+Helvetica",
    Encoding: "WinAnsiEncoding",
    FontDescriptor: descriptorRef,
  });

  const resolved = resolveFont(fontDict, context);
  assert.equal(resolved.isEmbedded, true);
  assert.equal(resolved.isSubset, true);
  assert.equal(resolved.encodingSource, "WinAnsi");
  // The nominal WinAnsi table says code 0x41 is "A" -- but for a subset
  // embedded font, this module cannot verify the glyph is actually present
  // in the subsetted program, so it must not claim "editable".
  assert.equal(resolved.glyphCodeToUnicode.get(0x41), "A");
  assert.equal(classifyReplacementChar(resolved, "A"), "requires-fallback");
});

test("resolveFont degrades gracefully instead of throwing when /Encoding is an indirect ref to the wrong type", async () => {
  const doc = await PDFDocument.create();
  const context = doc.context;
  // A malformed PDF: /Encoding is an indirect reference, but it resolves to
  // a PDFNumber, not a PDFDict/PDFName -- pdf-lib's context.lookupMaybe(ref,
  // PDFDict) would throw UnexpectedObjectTypeError here instead of
  // returning undefined as its name implies.
  const wrongTypeRef = context.register(context.obj(42));
  const fontDict = context.obj({
    Type: "Font",
    Subtype: "Type1",
    BaseFont: "Helvetica",
    Encoding: wrongTypeRef,
  });

  const resolved = resolveFont(fontDict, context);
  assert.equal(resolved.encodingSource, "Unknown");
  assert.equal(classifyReplacementChar(resolved, "A"), "impossible");
});

test("resolveFont degrades gracefully instead of throwing when /ToUnicode is an indirect ref to the wrong type", async () => {
  const doc = await PDFDocument.create();
  const context = doc.context;
  // /ToUnicode is supposed to be a stream, but here it resolves to a dict.
  const wrongTypeRef = context.register(context.obj({ Not: "AStream" }));

  const cidFontDict = context.obj({
    Type: "Font",
    Subtype: "CIDFontType2",
    BaseFont: "MyCIDFont",
    CIDSystemInfo: { Registry: "Adobe", Ordering: "Identity", Supplement: 0 },
    CIDToGIDMap: "Identity",
  });
  const cidFontRef = context.register(cidFontDict);

  const type0Dict = context.obj({
    Type: "Font",
    Subtype: "Type0",
    BaseFont: "MyCIDFont",
    Encoding: "Identity-H",
    DescendantFonts: [cidFontRef],
    ToUnicode: wrongTypeRef,
  });

  const resolved = resolveFont(type0Dict, context);
  assert.equal(resolved.kind, "Type0");
  assert.equal(resolved.encodingSource, "Unknown");
  assert.equal(resolved.glyphCodeToUnicode.size, 0);
});

test("resolveFont degrades gracefully instead of throwing when /FontDescriptor is an indirect ref to the wrong type", async () => {
  const doc = await PDFDocument.create();
  const context = doc.context;
  const wrongTypeRef = context.register(context.obj(42));
  const fontDict = context.obj({
    Type: "Font",
    Subtype: "Type1",
    BaseFont: "Helvetica",
    Encoding: "WinAnsiEncoding",
    FontDescriptor: wrongTypeRef,
  });

  const resolved = resolveFont(fontDict, context);
  assert.equal(resolved.isEmbedded, false);
  assert.equal(resolved.encodingSource, "WinAnsi");
});

test("resolveFont degrades gracefully instead of throwing when DescendantFonts[0] is an indirect ref to the wrong type", async () => {
  const doc = await PDFDocument.create();
  const context = doc.context;
  const wrongTypeRef = context.register(context.obj(42));

  const type0Dict = context.obj({
    Type: "Font",
    Subtype: "Type0",
    BaseFont: "MyCIDFont",
    Encoding: "Identity-H",
    DescendantFonts: [wrongTypeRef],
  });

  const resolved = resolveFont(type0Dict, context);
  assert.equal(resolved.kind, "Type0");
  assert.equal(resolved.isEmbedded, false);
});

test("resolveFont on a font with no recognized encoding at all is classified impossible", async () => {
  const doc = await PDFDocument.create();
  const context = doc.context;
  // No /Encoding entry -- per spec this falls back to the font's own
  // built-in encoding, which this module doesn't parse.
  const fontDict = context.obj({
    Type: "Font",
    Subtype: "Type1",
    BaseFont: "SomeCustomFont",
  });

  const resolved = resolveFont(fontDict, context);
  assert.equal(resolved.encodingSource, "Unknown");
  assert.equal(classifyReplacementChar(resolved, "A"), "impossible");
});
