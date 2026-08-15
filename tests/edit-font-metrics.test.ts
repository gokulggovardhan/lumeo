import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument, PDFDict, PDFName, StandardFonts } from "pdf-lib";
import { resolveFont } from "../lib/pdf/edit/fontEncoding.ts";
import { resolveFontMetrics, glyphAdvancePt, stringAdvancePt, compareAdvance } from "../lib/pdf/edit/fontMetrics.ts";

test("resolveFontMetrics reads a simple font's real /Widths array indexed from /FirstChar", async () => {
  const doc = await PDFDocument.create();
  const context = doc.context;
  const fontDict = context.obj({
    Type: "Font",
    Subtype: "Type1",
    BaseFont: "CustomFont",
    Encoding: "WinAnsiEncoding",
    FirstChar: 65,
    LastChar: 67,
    Widths: [700, 720, 600], // A, B, C
  });

  const resolvedFont = resolveFont(fontDict, context);
  const metrics = resolveFontMetrics(fontDict, context, resolvedFont);

  assert.equal(metrics.source, "Widths");
  assert.equal(metrics.glyphWidths.get(65), 700); // A
  assert.equal(metrics.glyphWidths.get(66), 720); // B
  assert.equal(metrics.glyphWidths.get(67), 600); // C
  assert.equal(glyphAdvancePt(65, metrics, 10), 7); // 700/1000 * 10pt
  // A code outside FirstChar..LastChar with no FontDescriptor falls back
  // to MissingWidth's own default of 0.
  assert.equal(glyphAdvancePt(90, metrics, 10), 0);
});

test("resolveFontMetrics falls back to real AFM data for a non-subset standard-14 font with no /Widths", async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText("A", { x: 50, y: 700, size: 18, font });

  const bytes = await doc.save();
  const loaded = await PDFDocument.load(bytes);
  const loadedPage = loaded.getPages()[0];
  const resources = loadedPage.node.Resources()!;
  const fontResources = resources.lookup(PDFName.of("Font"), PDFDict);
  const fontDict = loaded.context.lookup(fontResources.get(fontResources.keys()[0]), PDFDict);

  const resolvedFont = resolveFont(fontDict, loaded.context);
  const metrics = resolveFontMetrics(fontDict, loaded.context, resolvedFont);

  assert.equal(metrics.source, "StandardFontAFM");
  // Helvetica's real AFM width for capital A is 667/1000 em -- a
  // well-known, independently checkable value.
  assert.equal(metrics.glyphWidths.get(0x41), 667);
  assert.equal(glyphAdvancePt(0x41, metrics, 12), 667 / 1000 * 12);
});

test("resolveFontMetrics parses a CID font's /W array (both the range form and the individual-list form) with /DW as the fallback", async () => {
  const doc = await PDFDocument.create();
  const context = doc.context;

  const cidFontDict = context.obj({
    Type: "Font",
    Subtype: "CIDFontType2",
    BaseFont: "MyCIDFont",
    CIDSystemInfo: { Registry: "Adobe", Ordering: "Identity", Supplement: 0 },
    CIDToGIDMap: "Identity",
    DW: 1000,
    // CID 3: individual widths 500, 600, 700 for CIDs 3, 4, 5.
    // CIDs 10-15: all share width 800.
    W: [3, [500, 600, 700], 10, 15, 800],
  });
  const cidFontRef = context.register(cidFontDict);

  const type0Dict = context.obj({
    Type: "Font",
    Subtype: "Type0",
    BaseFont: "MyCIDFont",
    Encoding: "Identity-H",
    DescendantFonts: [cidFontRef],
  });

  const resolvedFont = resolveFont(type0Dict, context);
  const metrics = resolveFontMetrics(type0Dict, context, resolvedFont);

  assert.equal(metrics.source, "W");
  assert.equal(metrics.bytesPerCode, 2);
  assert.equal(metrics.glyphWidths.get(3), 500);
  assert.equal(metrics.glyphWidths.get(4), 600);
  assert.equal(metrics.glyphWidths.get(5), 700);
  assert.equal(metrics.glyphWidths.get(10), 800);
  assert.equal(metrics.glyphWidths.get(15), 800);
  assert.equal(metrics.glyphWidths.get(12), 800);
  // A CID with no /W entry at all falls back to /DW.
  assert.equal(glyphAdvancePt(999, metrics, 10), 10); // 1000/1000 * 10pt
});

test("resolveFontMetrics still resolves a subset-embedded simple font's real widths from its own /Widths array", async () => {
  const doc = await PDFDocument.create();
  const context = doc.context;
  const fontFileRef = context.register(context.stream(new Uint8Array([0, 1, 2, 3])));
  const descriptorRef = context.register(
    context.obj({ Type: "FontDescriptor", FontName: "ABCDEF+CustomFont", Flags: 32, FontFile2: fontFileRef }),
  );
  const fontDict = context.obj({
    Type: "Font",
    Subtype: "TrueType",
    BaseFont: "ABCDEF+CustomFont",
    Encoding: "WinAnsiEncoding",
    FirstChar: 65,
    LastChar: 65,
    Widths: [650],
    FontDescriptor: descriptorRef,
  });

  const resolvedFont = resolveFont(fontDict, context);
  assert.equal(resolvedFont.isSubset, true);
  const metrics = resolveFontMetrics(fontDict, context, resolvedFont);

  // Subsetting doesn't invalidate an explicit /Widths array -- it still
  // correctly describes the glyphs this exact subset actually has.
  assert.equal(metrics.source, "Widths");
  assert.equal(metrics.glyphWidths.get(65), 650);
});

test("resolveFontMetrics honestly reports Unknown for a subset font with neither /Widths nor a standard-font fallback", async () => {
  const doc = await PDFDocument.create();
  const context = doc.context;
  const fontFileRef = context.register(context.stream(new Uint8Array([0, 1, 2, 3])));
  const descriptorRef = context.register(
    context.obj({ Type: "FontDescriptor", FontName: "ABCDEF+MysteryFont", Flags: 32, FontFile2: fontFileRef }),
  );
  const fontDict = context.obj({
    Type: "Font",
    Subtype: "TrueType",
    BaseFont: "ABCDEF+MysteryFont",
    Encoding: "WinAnsiEncoding",
    FontDescriptor: descriptorRef,
    // No /Widths at all, and "MysteryFont" isn't one of the 14 standard names.
  });

  const resolvedFont = resolveFont(fontDict, context);
  const metrics = resolveFontMetrics(fontDict, context, resolvedFont);
  assert.equal(metrics.source, "Unknown");
});

test("resolveFontMetrics degrades gracefully instead of throwing when /Widths is an indirect ref to the wrong type", async () => {
  const doc = await PDFDocument.create();
  const context = doc.context;
  // Malformed: /Widths is an indirect ref, but resolves to a PDFNumber, not
  // a PDFArray -- pdf-lib's lookupMaybe(ref, PDFArray) would throw
  // UnexpectedObjectTypeError here instead of returning undefined.
  const wrongTypeRef = context.register(context.obj(42));
  const fontDict = context.obj({
    Type: "Font",
    Subtype: "Type1",
    BaseFont: "SomeCustomFont",
    Encoding: "WinAnsiEncoding",
    FirstChar: 65,
    Widths: wrongTypeRef,
  });

  const resolvedFont = resolveFont(fontDict, context);
  const metrics = resolveFontMetrics(fontDict, context, resolvedFont);
  assert.equal(metrics.source, "Unknown");
});

test("resolveFontMetrics degrades gracefully instead of throwing when /FontDescriptor is an indirect ref to the wrong type", async () => {
  const doc = await PDFDocument.create();
  const context = doc.context;
  const wrongTypeRef = context.register(context.obj(42));
  const fontDict = context.obj({
    Type: "Font",
    Subtype: "Type1",
    BaseFont: "CustomFont",
    Encoding: "WinAnsiEncoding",
    FirstChar: 65,
    LastChar: 65,
    Widths: [700],
    FontDescriptor: wrongTypeRef,
  });

  const resolvedFont = resolveFont(fontDict, context);
  const metrics = resolveFontMetrics(fontDict, context, resolvedFont);
  // MissingWidth falls back to its spec default (0) rather than throwing.
  assert.equal(metrics.source, "Widths");
  assert.equal(metrics.defaultWidth, 0);
});

test("resolveFontMetrics degrades gracefully instead of throwing when /W is an indirect ref to the wrong type", async () => {
  const doc = await PDFDocument.create();
  const context = doc.context;
  const wrongTypeRef = context.register(context.obj(42));

  const cidFontDict = context.obj({
    Type: "Font",
    Subtype: "CIDFontType2",
    BaseFont: "MyCIDFont",
    CIDSystemInfo: { Registry: "Adobe", Ordering: "Identity", Supplement: 0 },
    CIDToGIDMap: "Identity",
    DW: 1000,
    W: wrongTypeRef,
  });
  const cidFontRef = context.register(cidFontDict);

  const type0Dict = context.obj({
    Type: "Font",
    Subtype: "Type0",
    BaseFont: "MyCIDFont",
    Encoding: "Identity-H",
    DescendantFonts: [cidFontRef],
  });

  const resolvedFont = resolveFont(type0Dict, context);
  const metrics = resolveFontMetrics(type0Dict, context, resolvedFont);
  // No usable /W: falls back to /DW for every CID, same as if /W were absent.
  assert.equal(metrics.source, "W");
  assert.equal(metrics.defaultWidth, 1000);
  assert.equal(metrics.glyphWidths.size, 0);
});

test("resolveFontMetrics degrades gracefully instead of throwing when a /W range's width-list entry is an indirect ref to the wrong type", async () => {
  const doc = await PDFDocument.create();
  const context = doc.context;
  const wrongTypeRef = context.register(context.obj(42));

  const cidFontDict = context.obj({
    Type: "Font",
    Subtype: "CIDFontType2",
    BaseFont: "MyCIDFont",
    CIDSystemInfo: { Registry: "Adobe", Ordering: "Identity", Supplement: 0 },
    CIDToGIDMap: "Identity",
    DW: 1000,
    // CID 3's width-list entry resolves to a PDFNumber instead of a
    // PDFArray.
    W: [3, wrongTypeRef, 10, 15, 800],
  });
  const cidFontRef = context.register(cidFontDict);

  const type0Dict = context.obj({
    Type: "Font",
    Subtype: "Type0",
    BaseFont: "MyCIDFont",
    Encoding: "Identity-H",
    DescendantFonts: [cidFontRef],
  });

  const resolvedFont = resolveFont(type0Dict, context);
  const metrics = resolveFontMetrics(type0Dict, context, resolvedFont);
  // The malformed CID 3 entry is skipped rather than aborting the whole
  // array -- the well-formed CID 10-15 range still parses correctly.
  assert.equal(metrics.glyphWidths.get(10), 800);
  assert.equal(metrics.glyphWidths.get(15), 800);
});

test("resolveFontMetrics degrades gracefully instead of throwing when DescendantFonts[0] is an indirect ref to the wrong type", async () => {
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

  const resolvedFont = resolveFont(type0Dict, context);
  const metrics = resolveFontMetrics(type0Dict, context, resolvedFont);
  // No descendantDict at all: /DW's spec default (1000) applies.
  assert.equal(metrics.source, "W");
  assert.equal(metrics.defaultWidth, 1000);
  assert.equal(metrics.glyphWidths.size, 0);
});

test("compareAdvance: equal-width, shorter, and longer replacements", () => {
  const metrics = {
    bytesPerCode: 1 as const,
    defaultWidth: 0,
    glyphWidths: new Map([
      [65, 700], // A
      [66, 720], // B
      [67, 600], // C
    ]),
    source: "Widths" as const,
  };
  const state = { fontSizePt: 10, charSpacing: 0, wordSpacing: 0, horizontalScalingPct: 100 };

  // Equal-width: same code in, same code out.
  const equal = compareAdvance([65], [65], metrics, state);
  assert.equal(equal.deltaPt, 0);
  assert.equal(equal.tjAdjustment, 0);

  // Shorter: replacing "A" (700 units, 7pt) with "C" (600 units, 6pt).
  const shorter = compareAdvance([65], [67], metrics, state);
  assert.equal(shorter.originalAdvancePt, 7);
  assert.equal(shorter.replacementAdvancePt, 6);
  assert.equal(shorter.deltaPt, -1);
  // A negative delta needs a negative TJ number (per spec, a negative TJ
  // number moves the next glyph FORWARD, closing the gap a shorter
  // replacement would otherwise leave).
  assert.ok(shorter.tjAdjustment < 0);

  // Longer: replacing "A" (7pt) with "AB" (7pt + 7.2pt = 14.2pt).
  const longer = compareAdvance([65], [65, 66], metrics, state);
  assert.equal(longer.originalAdvancePt, 7);
  assert.equal(longer.replacementAdvancePt, 14.2);
  assert.ok(longer.deltaPt > 0);
  assert.ok(longer.tjAdjustment > 0);
});

test("stringAdvancePt applies character spacing, word spacing (space only, simple fonts), and horizontal scaling correctly", () => {
  const metrics = {
    bytesPerCode: 1 as const,
    defaultWidth: 0,
    glyphWidths: new Map([
      [65, 500], // A
      [32, 250], // space
    ]),
    source: "Widths" as const,
  };

  // "A A" (A, space, A) at 10pt, Tc=1, Tw=2, Th=100%.
  const state = { fontSizePt: 10, charSpacing: 1, wordSpacing: 2, horizontalScalingPct: 100 };
  const advance = stringAdvancePt([65, 32, 65], metrics, state);
  // A: (500/1000*10 + 1) = 6; space: (250/1000*10 + 1 + 2) = 5.5; A: 6 -> 17.5
  assert.equal(advance, 17.5);

  // Horizontal scaling halves the whole thing.
  const scaledState = { ...state, horizontalScalingPct: 50 };
  const scaledAdvance = stringAdvancePt([65, 32, 65], metrics, scaledState);
  assert.equal(scaledAdvance, 8.75);
});

test("stringAdvancePt does not apply word spacing to a composite (2-byte) font's code 32, per spec", () => {
  const metrics = {
    bytesPerCode: 2 as const,
    defaultWidth: 500,
    glyphWidths: new Map<number, number>(),
    source: "W" as const,
  };
  const state = { fontSizePt: 10, charSpacing: 0, wordSpacing: 100, horizontalScalingPct: 100 };
  // If word spacing wrongly applied here, this would be 5 + 100 = 105pt
  // instead of the correct 5pt (500/1000 * 10).
  const advance = stringAdvancePt([32], metrics, state);
  assert.equal(advance, 5);
});
