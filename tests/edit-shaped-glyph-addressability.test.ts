import assert from "node:assert/strict";
import test from "node:test";
import {
  PDFDocument,
} from "pdf-lib";
import {
  PdfFontRegistry,
} from "../lib/pdf/edit/fontRegistry.ts";
import type { ShapedRun } from "../lib/pdf/edit/harfbuzzShaping.ts";

function shapedRun(
  glyphs: readonly { glyphId: number; clusterText: string }[],
): ShapedRun {
  let utf16 = 0;
  const clusterMap = glyphs.map((glyph, index) => {
    const startUtf16 = utf16;
    utf16 += glyph.clusterText.length;
    return {
      startUtf16,
      endUtf16: utf16,
      text: glyph.clusterText,
      glyphIndices: [index],
    };
  });
  const text = glyphs.map((glyph) => glyph.clusterText).join("");
  return {
    text,
    glyphs: glyphs.map((glyph, index) => ({
      glyphId: glyph.glyphId,
      clusterUtf16: clusterMap[index].startUtf16,
      flags: 0,
      xAdvance: 600,
      yAdvance: 0,
      xOffset: 0,
      yOffset: 0,
      xAdvanceEm: 0.6,
      yAdvanceEm: 0,
      xOffsetEm: 0,
      yOffsetEm: 0,
    })),
    clusterMap,
    unitsPerEm: 1000,
    totalAdvance: glyphs.length * 600,
    totalAdvanceEm: glyphs.length * 0.6,
    totalXAdvance: glyphs.length * 600,
    totalYAdvance: 0,
    requestedDirection: "ltr",
    directionWasExplicit: true,
    engine: "harfbuzz",
    engineVersion: "14.5.0",
  };
}

function cidFontFixture({
  encoding = "Identity-H",
  cidToGidMap = "Identity" as "Identity" | Uint8Array,
  toUnicode = new Map<number, string>([[3, "H"]]),
  widths = new Map<number, number>([[3, 600]]),
}: {
  encoding?: "Identity-H" | "Identity-V";
  cidToGidMap?: "Identity" | Uint8Array;
  toUnicode?: Map<number, string>;
  widths?: Map<number, number>;
} = {}) {
  return async () => {
    const doc = await PDFDocument.create();
    const context = doc.context;
    const fakeTtf = Uint8Array.from([
      0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0,
    ]);
    const fontFileRef = context.register(context.flateStream(fakeTtf));
    const descriptorRef = context.register(
      context.obj({
        Type: "FontDescriptor",
        FontName: "ABCDEF+ShapedProof",
        Flags: 32,
        ItalicAngle: 0,
        Ascent: 800,
        Descent: -200,
        CapHeight: 700,
        FontBBox: [0, -200, 1000, 900],
        StemV: 80,
        FontFile2: fontFileRef,
      }),
    );

    const widthEntries: (number | number[])[] = [];
    for (const [cid, width] of [...widths.entries()].sort((a, b) => a[0] - b[0])) {
      widthEntries.push(cid, [width]);
    }

    const cidToGidEntry =
      cidToGidMap === "Identity"
        ? "Identity"
        : context.register(context.stream(cidToGidMap));

    const descendantRef = context.register(
      context.obj({
        Type: "Font",
        Subtype: "CIDFontType2",
        BaseFont: "ABCDEF+ShapedProof",
        CIDSystemInfo: {
          Registry: "Adobe",
          Ordering: "Identity",
          Supplement: 0,
        },
        FontDescriptor: descriptorRef,
        DW: 1000,
        W: widthEntries,
        CIDToGIDMap: cidToGidEntry,
      }),
    );

    const cmapLines = [
      "/CIDInit /ProcSet findresource begin",
      "12 dict begin",
      "begincmap",
      "1 begincodespacerange",
      "<0000> <FFFF>",
      "endcodespacerange",
      `${toUnicode.size} beginbfchar`,
      ...[...toUnicode.entries()].map(([cid, text]) => {
        const source = cid.toString(16).padStart(4, "0").toUpperCase();
        const destination = [...text]
          .map((char) => {
            const codePoint = char.codePointAt(0)!;
            if (codePoint <= 0xffff) return codePoint.toString(16).padStart(4, "0");
            const value = codePoint - 0x10000;
            const high = 0xd800 + (value >> 10);
            const low = 0xdc00 + (value & 0x3ff);
            return high.toString(16).padStart(4, "0") + low.toString(16).padStart(4, "0");
          })
          .join("")
          .toUpperCase();
        return `<${source}> <${destination}>`;
      }),
      "endbfchar",
      "endcmap",
      "end",
      "end",
    ];
    const toUnicodeRef = context.register(context.stream(cmapLines.join("\n")));
    const type0Ref = context.register(
      context.obj({
        Type: "Font",
        Subtype: "Type0",
        BaseFont: "ABCDEF+ShapedProof",
        Encoding: encoding,
        DescendantFonts: [descendantRef],
        ToUnicode: toUnicodeRef,
      }),
    );
    const resources = context.obj({
      Font: context.obj({ FShape: type0Ref }),
    });

    return {
      doc,
      resources,
      type0Ref,
      descendantRef,
      fontFileRef,
      cidToGidEntry,
    };
  };
}

test("shaped glyph addressability binds Identity-H CID == GID to exact ToUnicode and width evidence", async () => {
  const fixture = await cidFontFixture()();
  const result = new PdfFontRegistry(fixture.doc).inspectShapedGlyphAddressability(
    fixture.resources,
    "FShape",
    shapedRun([{ glyphId: 3, clusterText: "H" }]),
  );

  assert.equal(result.kind, "addressable");
  if (result.kind !== "addressable") return;
  assert.equal(result.advisoryOnly, true);
  assert.match(result.embeddedProgramSha256, /^[0-9a-f]{64}$/);
  assert.equal(result.binding.resourceName, "FShape");
  assert.equal(result.binding.fontObjectRef, fixture.type0Ref.toString());
  assert.equal(result.binding.descendantObjectRef, fixture.descendantRef.toString());
  assert.equal(result.binding.fontProgramObjectRef, fixture.fontFileRef.toString());
  assert.deepEqual(result.addresses, [
    {
      glyphIndex: 0,
      glyphId: 3,
      clusterText: "H",
      cid: 3,
      pdfCode: 3,
      width1000: 600,
    },
  ]);
});

test("shaped glyph addressability decodes an explicit CIDToGIDMap stream and keeps PDF code identity", async () => {
  const map = Uint8Array.from([
    0, 0,
    0, 0,
    0, 0,
    0, 7,
  ]);
  const fixture = await cidFontFixture({ cidToGidMap: map })();
  const result = new PdfFontRegistry(fixture.doc).inspectShapedGlyphAddressability(
    fixture.resources,
    "FShape",
    shapedRun([{ glyphId: 7, clusterText: "H" }]),
  );

  assert.equal(result.kind, "addressable");
  if (result.kind !== "addressable") return;
  assert.equal(result.addresses[0]?.glyphId, 7);
  assert.equal(result.addresses[0]?.cid, 3);
  assert.equal(result.addresses[0]?.pdfCode, 3);
  assert.equal(
    result.binding.cidToGidMapObjectRef,
    fixture.cidToGidEntry.toString(),
  );
});

test("shaped glyph addressability fails closed when one GID is ambiguous across same-text CIDs", async () => {
  const map = Uint8Array.from([
    0, 0,
    0, 0,
    0, 0,
    0, 7,
    0, 7,
  ]);
  const fixture = await cidFontFixture({
    cidToGidMap: map,
    toUnicode: new Map([
      [3, "H"],
      [4, "H"],
    ]),
    widths: new Map([
      [3, 600],
      [4, 600],
    ]),
  })();
  const result = new PdfFontRegistry(fixture.doc).inspectShapedGlyphAddressability(
    fixture.resources,
    "FShape",
    shapedRun([{ glyphId: 7, clusterText: "H" }]),
  );

  assert.equal(result.kind, "blocked");
  if (result.kind === "blocked") assert.match(result.reason, /ambiguous/i);
});

test("shaped glyph addressability fails closed when ToUnicode does not bind the shaped GID to its source cluster", async () => {
  const fixture = await cidFontFixture({
    toUnicode: new Map([[3, "X"]]),
  })();
  const result = new PdfFontRegistry(fixture.doc).inspectShapedGlyphAddressability(
    fixture.resources,
    "FShape",
    shapedRun([{ glyphId: 3, clusterText: "H" }]),
  );

  assert.equal(result.kind, "blocked");
  if (result.kind === "blocked") assert.match(result.reason, /ToUnicode/i);
});

test("shaped glyph addressability keeps vertical Identity-V resources read-only", async () => {
  const fixture = await cidFontFixture({ encoding: "Identity-V" })();
  const result = new PdfFontRegistry(fixture.doc).inspectShapedGlyphAddressability(
    fixture.resources,
    "FShape",
    shapedRun([{ glyphId: 3, clusterText: "H" }]),
  );

  assert.equal(result.kind, "blocked");
  if (result.kind === "blocked") {
    assert.match(result.reason, /horizontal Identity-H/i);
  }
});

test("shaped glyph addressability rejects malformed CIDToGIDMap stream bytes", async () => {
  const fixture = await cidFontFixture({
    cidToGidMap: Uint8Array.from([0, 0, 7]),
  })();
  const result = new PdfFontRegistry(fixture.doc).inspectShapedGlyphAddressability(
    fixture.resources,
    "FShape",
    shapedRun([{ glyphId: 7, clusterText: "H" }]),
  );

  assert.equal(result.kind, "blocked");
  if (result.kind === "blocked") assert.match(result.reason, /odd byte length/i);
});


test("shaped glyph addressability does not unbounded-decode compressed CIDToGIDMap streams", async () => {
  const doc = await PDFDocument.create();
  const context = doc.context;
  const fakeTtf = Uint8Array.from([
    0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0,
  ]);
  const fontFileRef = context.register(context.flateStream(fakeTtf));
  const descriptorRef = context.register(
    context.obj({
      Type: "FontDescriptor",
      FontName: "ABCDEF+CompressedMap",
      Flags: 32,
      ItalicAngle: 0,
      FontFile2: fontFileRef,
    }),
  );
  const compressedMapRef = context.register(
    context.flateStream(Uint8Array.from([0, 0, 0, 0, 0, 0, 0, 7])),
  );
  const descendantRef = context.register(
    context.obj({
      Type: "Font",
      Subtype: "CIDFontType2",
      BaseFont: "ABCDEF+CompressedMap",
      CIDSystemInfo: {
        Registry: "Adobe",
        Ordering: "Identity",
        Supplement: 0,
      },
      FontDescriptor: descriptorRef,
      DW: 1000,
      W: [3, [600]],
      CIDToGIDMap: compressedMapRef,
    }),
  );
  const toUnicodeRef = context.register(
    context.stream([
      "1 beginbfchar",
      "<0003> <0048>",
      "endbfchar",
    ].join("\n")),
  );
  const type0Ref = context.register(
    context.obj({
      Type: "Font",
      Subtype: "Type0",
      BaseFont: "ABCDEF+CompressedMap",
      Encoding: "Identity-H",
      DescendantFonts: [descendantRef],
      ToUnicode: toUnicodeRef,
    }),
  );
  const resources = context.obj({
    Font: context.obj({ FShape: type0Ref }),
  });

  const result = new PdfFontRegistry(doc).inspectShapedGlyphAddressability(
    resources,
    "FShape",
    shapedRun([{ glyphId: 7, clusterText: "H" }]),
  );

  assert.equal(result.kind, "blocked");
  if (result.kind === "blocked") {
    assert.match(result.reason, /Compressed CIDToGIDMap/i);
  }
});
