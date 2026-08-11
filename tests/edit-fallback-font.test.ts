import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument, PDFDict, PDFName, StandardFonts } from "pdf-lib";
import {
  encodeWithFallbackFont,
  fallbackFontMetrics,
  firstUnencodableChar,
  pickFallbackFont,
  readFallbackStyleHints,
  ensureFallbackFontResource,
  resolveFallbackFontsDict,
  type FallbackStyleHints,
} from "../lib/pdf/edit/fallbackFont.ts";

function hints(partial: Partial<FallbackStyleHints> & { baseFont: string }): FallbackStyleHints {
  return { flags: null, italicAngle: null, fontWeight: null, ...partial };
}

// --- Encoding ---------------------------------------------------------
//
// The load-bearing assertion of this whole module: the codes computed
// purely, during the dry-run plan, must be byte-identical to what pdf-lib's
// own standard-font embedder would produce -- because the font object
// written into the document IS that embedder's output. If these ever
// diverge, every fallback edit renders mojibake.

test("encodeWithFallbackFont produces byte-identical output to pdf-lib's own standard font embedder", async () => {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  for (const sample of ["Hello", "Café €5", "“Quoted” — dash…", "Total: 1,350.00", "ÿÀÖ×÷", "Zcaron: Ž ž"]) {
    const mine = encodeWithFallbackFont(sample);
    assert.ok(mine, `expected ${JSON.stringify(sample)} to be encodable`);
    // PDFHexString.toString() renders as "<hex>" -- strip the angle
    // brackets and compare against the same bytes rendered as hex.
    const theirs = font.encodeText(sample).toString().slice(1, -1).toLowerCase();
    const asHex = mine.map((code) => code.toString(16).padStart(2, "0")).join("");
    assert.equal(asHex, theirs, `mismatch for ${JSON.stringify(sample)}`);
  }
});

test("encodeWithFallbackFont covers the Windows-1252 extras a plain Latin-1 table would miss", () => {
  // 0x80 euro, 0x93/0x94 curly double quotes, 0x97 em dash, 0x85 ellipsis:
  // all above 0x7F and all absent from ISO-8859-1, so getting these right
  // proves the real WinAnsi table is in play, not an ASCII/Latin-1 stand-in.
  assert.deepEqual(encodeWithFallbackFont("€"), [0x80]);
  assert.deepEqual(encodeWithFallbackFont("“”"), [0x93, 0x94]);
  assert.deepEqual(encodeWithFallbackFont("—"), [0x97]);
  assert.deepEqual(encodeWithFallbackFont("…"), [0x85]);
});

test("encodeWithFallbackFont is all-or-nothing: one unshowable character rejects the whole string", () => {
  // Partially encoding would silently drop characters out of the user's
  // replacement text -- the exact quiet corruption this engine refuses.
  assert.equal(encodeWithFallbackFont("中"), null);
  assert.equal(encodeWithFallbackFont("Price 中 500"), null);
  assert.equal(firstUnencodableChar("Price 中 500"), "中");
  assert.equal(firstUnencodableChar("Price 500"), null);
});

test("encodeWithFallbackFont rejects an astral character as one unit rather than splitting its surrogates", () => {
  // Iterating a JS string by index would see two lone surrogates here, and
  // a naive per-code-unit lookup could "succeed" on garbage. Iterating by
  // code point sees one character, which WinAnsi genuinely cannot show.
  assert.equal("😀".length, 2);
  assert.equal(encodeWithFallbackFont("😀"), null);
  assert.equal(firstUnencodableChar("a😀b"), "😀");
});

// --- Metrics ----------------------------------------------------------

test("fallbackFontMetrics returns real AFM widths keyed by WinAnsi code", () => {
  const helvetica = fallbackFontMetrics("Helvetica");
  assert.equal(helvetica.bytesPerCode, 1);
  assert.equal(helvetica.source, "StandardFontAFM");
  // Well-known Helvetica AFM values, cross-checkable against the published
  // Adobe metrics: space 278, 'A' 667, 'i' 222.
  assert.equal(helvetica.glyphWidths.get(0x20), 278);
  assert.equal(helvetica.glyphWidths.get(0x41), 667);
  assert.equal(helvetica.glyphWidths.get(0x69), 222);
  // The euro sign at 0x80 proves the WinAnsi keying, not an ASCII subset.
  assert.ok((helvetica.glyphWidths.get(0x80) ?? 0) > 0);
});

test("fallbackFontMetrics gives Courier a uniform 600 for every glyph, unlike proportional Helvetica", () => {
  const courier = fallbackFontMetrics("Courier");
  for (const code of [0x20, 0x41, 0x69, 0x57]) {
    assert.equal(courier.glyphWidths.get(code), 600, `code ${code} should be fixed-pitch`);
  }
  const helvetica = fallbackFontMetrics("Helvetica");
  assert.notEqual(helvetica.glyphWidths.get(0x69), helvetica.glyphWidths.get(0x57));
});

test("fallbackFontMetrics returns the same cached object for repeated calls", () => {
  assert.equal(fallbackFontMetrics("Times-Bold"), fallbackFontMetrics("Times-Bold"));
});

// --- Picking a substitute ---------------------------------------------

test("pickFallbackFont maps real-world subset BaseFont names to a matching standard face", () => {
  const cases: Array<[string, string]> = [
    ["ABCDEF+Arial-BoldMT", "Helvetica-Bold"],
    ["BCDEFG+ArialMT", "Helvetica"],
    ["ABCDEF+Arial-ItalicMT", "Helvetica-Oblique"],
    ["ABCDEF+Arial-BoldItalicMT", "Helvetica-BoldOblique"],
    ["ABCDEF+TimesNewRomanPSMT", "Times-Roman"],
    ["ABCDEF+TimesNewRomanPS-BoldMT", "Times-Bold"],
    ["ABCDEF+TimesNewRomanPS-ItalicMT", "Times-Italic"],
    ["ABCDEF+TimesNewRomanPS-BoldItalicMT", "Times-BoldItalic"],
    ["ABCDEF+CourierNewPSMT", "Courier"],
    ["ABCDEF+CourierNewPS-BoldMT", "Courier-Bold"],
    ["ABCDEF+Calibri", "Helvetica"],
    ["ABCDEF+Georgia-Italic", "Times-Italic"],
  ];
  for (const [baseFont, expected] of cases) {
    assert.equal(pickFallbackFont(hints({ baseFont })), expected, baseFont);
  }
});

test("pickFallbackFont does not read the 'serif' inside 'sans-serif' as a serif face", () => {
  assert.equal(pickFallbackFont(hints({ baseFont: "OpenSans-Regular" })), "Helvetica");
  assert.equal(pickFallbackFont(hints({ baseFont: "PT_Sans-Serif" })), "Helvetica");
  // ...nor the "Roman" weight suffix some sans families use.
  assert.equal(pickFallbackFont(hints({ baseFont: "HelveticaNeue-Roman" })), "Helvetica");
});

test("pickFallbackFont does not treat 'Monotype Corsiva' as monospaced", () => {
  // "mono" only counts at a token boundary -- a script face whose foundry
  // name merely starts with it must not land on Courier.
  assert.equal(pickFallbackFont(hints({ baseFont: "MonotypeCorsiva" })), "Helvetica");
  assert.equal(pickFallbackFont(hints({ baseFont: "Roboto Mono" })), "Courier");
});

test("pickFallbackFont falls back to descriptor flags when the BaseFont name says nothing", () => {
  // A name with no style vocabulary at all: flags are the only evidence.
  assert.equal(pickFallbackFont(hints({ baseFont: "ABCDEF+XQ1234", flags: 2 })), "Times-Roman");
  assert.equal(pickFallbackFont(hints({ baseFont: "ABCDEF+XQ1234", flags: 1 })), "Courier");
  assert.equal(pickFallbackFont(hints({ baseFont: "ABCDEF+XQ1234", flags: 64 })), "Helvetica-Oblique");
  assert.equal(pickFallbackFont(hints({ baseFont: "ABCDEF+XQ1234", flags: 2 | 64 })), "Times-Italic");
  assert.equal(pickFallbackFont(hints({ baseFont: "ABCDEF+XQ1234", flags: 1 << 18 })), "Helvetica-Bold");
  assert.equal(pickFallbackFont(hints({ baseFont: "ABCDEF+XQ1234" })), "Helvetica");
});

test("pickFallbackFont lets an honest BaseFont name beat a copy-pasted /Flags value", () => {
  // 32 (Nonsymbolic) with no Serif or Italic bit is the single most common
  // flags value in the wild, routinely stamped onto fonts that are plainly
  // both -- so the name has to win.
  assert.equal(pickFallbackFont(hints({ baseFont: "ABCDEF+TimesNewRomanPS-ItalicMT", flags: 32 })), "Times-Italic");
  // ...and the reverse: a Serif flag on an obviously sans face.
  assert.equal(pickFallbackFont(hints({ baseFont: "ABCDEF+ArialMT", flags: 2 })), "Helvetica");
});

test("pickFallbackFont reads slant from /ItalicAngle and weight from /FontWeight", () => {
  assert.equal(pickFallbackFont(hints({ baseFont: "ABCDEF+XQ1234", italicAngle: -12 })), "Helvetica-Oblique");
  assert.equal(pickFallbackFont(hints({ baseFont: "ABCDEF+XQ1234", italicAngle: 0 })), "Helvetica");
  assert.equal(pickFallbackFont(hints({ baseFont: "ABCDEF+XQ1234", fontWeight: 700 })), "Helvetica-Bold");
  assert.equal(pickFallbackFont(hints({ baseFont: "ABCDEF+XQ1234", fontWeight: 400 })), "Helvetica");
  assert.equal(
    pickFallbackFont(hints({ baseFont: "ABCDEF+XQ1234", fontWeight: 700, italicAngle: -15 })),
    "Helvetica-BoldOblique",
  );
});

// --- Reading hints off a real font dictionary -------------------------

test("readFallbackStyleHints reads /BaseFont and the descriptor's style entries", async () => {
  const doc = await PDFDocument.create();
  const context = doc.context;
  const descriptor = context.obj({ Type: "FontDescriptor", Flags: 34, ItalicAngle: -12, FontWeight: 700 });
  const fontDict = context.obj({
    Type: "Font",
    Subtype: "TrueType",
    BaseFont: "ABCDEF+Whatever",
    FontDescriptor: context.register(descriptor),
  });

  assert.deepEqual(readFallbackStyleHints(fontDict, context), {
    baseFont: "ABCDEF+Whatever",
    flags: 34,
    italicAngle: -12,
    fontWeight: 700,
  });
});

test("readFallbackStyleHints follows a Type0 font's descendant to find its descriptor", async () => {
  const doc = await PDFDocument.create();
  const context = doc.context;
  const descriptor = context.obj({ Type: "FontDescriptor", Flags: 4, ItalicAngle: 0 });
  const descendant = context.obj({
    Type: "Font",
    Subtype: "CIDFontType2",
    BaseFont: "ABCDEF+NotoSans",
    FontDescriptor: context.register(descriptor),
  });
  const fontDict = context.obj({
    Type: "Font",
    Subtype: "Type0",
    BaseFont: "ABCDEF+NotoSans",
    Encoding: "Identity-H",
    DescendantFonts: context.obj([context.register(descendant)]),
  });

  const result = readFallbackStyleHints(fontDict, context);
  assert.equal(result.baseFont, "ABCDEF+NotoSans");
  assert.equal(result.flags, 4, "the descriptor on the DESCENDANT font must be the one that's read");
});

test("readFallbackStyleHints degrades to name-only hints for a font with no descriptor", async () => {
  const doc = await PDFDocument.create();
  const context = doc.context;
  const fontDict = context.obj({ Type: "Font", Subtype: "Type1", BaseFont: "Helvetica-Bold" });
  assert.deepEqual(readFallbackStyleHints(fontDict, context), {
    baseFont: "Helvetica-Bold",
    flags: null,
    italicAngle: null,
    fontWeight: null,
  });
});

// --- Registering the substitute ---------------------------------------

test("ensureFallbackFontResource adds one standard font and returns its resource name", async () => {
  const doc = await PDFDocument.create();
  doc.addPage([300, 200]);
  const fonts = resolveFallbackFontsDict(doc, 0, null);

  const name = await ensureFallbackFontResource(doc, fonts, "Helvetica-Bold");
  assert.equal(name, "LumeoFallback0");

  const saved = await doc.save();
  const reloaded = await PDFDocument.load(saved);
  const reloadedFonts = reloaded.getPages()[0].node.Resources()!.lookup(PDFName.of("Font"), PDFDict);
  const dict = reloaded.context.lookup(reloadedFonts.get(PDFName.of("LumeoFallback0")), PDFDict);
  assert.equal(dict.get(PDFName.of("BaseFont"))!.toString(), "/Helvetica-Bold");
  assert.equal(dict.get(PDFName.of("Encoding"))!.toString(), "/WinAnsiEncoding");
  assert.equal(dict.get(PDFName.of("Subtype"))!.toString(), "/Type1");
  // A standard font carries no font program at all -- that's what keeps
  // this path free of both a fontkit dependency and megabytes of output.
  assert.equal(dict.has(PDFName.of("FontDescriptor")), false);
});

test("ensureFallbackFontResource reuses an equivalent entry instead of adding a second identical font", async () => {
  const doc = await PDFDocument.create();
  doc.addPage([300, 200]);
  const fonts = resolveFallbackFontsDict(doc, 0, null);

  const first = await ensureFallbackFontResource(doc, fonts, "Helvetica");
  const second = await ensureFallbackFontResource(doc, fonts, "Helvetica");
  assert.equal(second, first);
  assert.equal(fonts.keys().length, 1);

  // A DIFFERENT family is genuinely a different font and must be added.
  const third = await ensureFallbackFontResource(doc, fonts, "Times-Roman");
  assert.notEqual(third, first);
  assert.equal(fonts.keys().length, 2);
});

test("ensureFallbackFontResource will not reuse a same-named font that carries a /Differences encoding", async () => {
  // A /Differences array can remap the very codes encodeWithFallbackFont
  // just computed, so an /Encoding DICTIONARY is never safe to reuse even
  // when the BaseFont matches exactly.
  const doc = await PDFDocument.create();
  doc.addPage([300, 200]);
  const context = doc.context;
  const fonts = resolveFallbackFontsDict(doc, 0, null);
  const remapped = context.obj({
    Type: "Font",
    Subtype: "Type1",
    BaseFont: "Helvetica",
    Encoding: context.obj({ BaseEncoding: "WinAnsiEncoding", Differences: context.obj([65, "bullet"]) }),
  });
  fonts.set(PDFName.of("F1"), context.register(remapped));

  const name = await ensureFallbackFontResource(doc, fonts, "Helvetica");
  assert.notEqual(name, "F1");
});

test("ensureFallbackFontResource picks a non-colliding name when LumeoFallback0 is already taken", async () => {
  const doc = await PDFDocument.create();
  doc.addPage([300, 200]);
  const context = doc.context;
  const fonts = resolveFallbackFontsDict(doc, 0, null);
  fonts.set(PDFName.of("LumeoFallback0"), context.register(context.obj({ Type: "Font", Subtype: "Type1", BaseFont: "Symbol" })));

  const name = await ensureFallbackFontResource(doc, fonts, "Helvetica");
  assert.equal(name, "LumeoFallback1");
  assert.equal(fonts.get(PDFName.of("LumeoFallback0"))!.toString().includes("R"), true, "the pre-existing entry must be left alone");
});

test("resolveFallbackFontsDict targets a Form XObject's own /Resources when it has one, and the page's when it doesn't", async () => {
  const doc = await PDFDocument.create();
  doc.addPage([300, 200]);
  const context = doc.context;

  const formOwnFonts = context.obj({});
  const formWithResources = context.obj({ Type: "XObject", Subtype: "Form", Resources: context.obj({ Font: formOwnFonts }) });
  assert.equal(resolveFallbackFontsDict(doc, 0, formWithResources), formOwnFonts);

  // A Form with no /Resources inherits the page's, so manufacturing one
  // here would shadow every name it was inheriting -- it must land on the
  // page instead.
  const formWithout = context.obj({ Type: "XObject", Subtype: "Form" });
  assert.equal(resolveFallbackFontsDict(doc, 0, formWithout), resolveFallbackFontsDict(doc, 0, null));
});
