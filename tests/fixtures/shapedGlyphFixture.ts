import { readFile } from "node:fs/promises";
import { PDFDocument, PDFName } from "pdf-lib";
import { inspectPdfFontProgram } from "../../lib/pdf/edit/fontProgramIntelligence.ts";
import { shapeEmbeddedFontText } from "../../lib/pdf/edit/harfbuzzShaping.ts";

function utf16BeHex(text: string): string {
  const bytes: number[] = [];
  for (let index = 0; index < text.length; index += 1) {
    const unit = text.charCodeAt(index);
    bytes.push((unit >> 8) & 0xff, unit & 0xff);
  }
  return bytes
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

function cidHex(cid: number): string {
  if (!Number.isInteger(cid) || cid <= 0 || cid > 0xffff) {
    throw new Error(`Fixture CID ${cid} is outside the two-byte Type0 range.`);
  }
  return cid.toString(16).padStart(4, "0").toUpperCase();
}

async function ciTrueTypeFontBytes(): Promise<Uint8Array> {
  const candidates = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
  ];
  for (const candidate of candidates) {
    try {
      const bytes = await readFile(candidate);
      if (bytes.byteLength > 1_000) return new Uint8Array(bytes);
    } catch {
      // Try the next deterministic Linux CI font.
    }
  }
  throw new Error("No deterministic TrueType font was found for the shaped-text fixture.");
}

function metric1000(
  value: number | null,
  unitsPerEm: number,
  fallback: number,
): number {
  return value === null || !Number.isFinite(value)
    ? fallback
    : Math.round((value / unitsPerEm) * 1000);
}

export const SHAPED_LTR_REPLACEMENT = "e\u0301";

/**
 * Real embedded Type0/CIDFontType2 fixture for the first bounded shaped writer.
 *
 * Source text: AB
 * Replacement: decomposed e + combining acute.
 *
 * The Linux CI fonts used here canonically compose that cluster into one LTR
 * glyph with no x/y offsets. The PDF's exact ToUnicode map binds that glyph's
 * CID back to the decomposed source cluster, so browser search/extraction can
 * be proven after the native shaped write.
 */
export async function buildShapedLtrType0Pdf(): Promise<Uint8Array> {
  const fontBytes = await ciTrueTypeFontBytes();
  const inspection = await inspectPdfFontProgram(fontBytes);
  if (inspection.kind !== "ok") {
    throw new Error(`Could not inspect shaped fixture font: ${inspection.reason}`);
  }
  const intelligence = inspection.intelligence;
  const unitsPerEm = intelligence.metadata.unitsPerEm;
  if (!unitsPerEm || unitsPerEm <= 0) {
    throw new Error("Shaped fixture font has no valid units-per-em.");
  }

  const gidA = intelligence.glyphIdForCodePoint("A".codePointAt(0)!);
  const gidB = intelligence.glyphIdForCodePoint("B".codePointAt(0)!);
  if (!gidA || !gidB) {
    throw new Error("Shaped fixture font does not contain A/B glyphs.");
  }

  const shaped = await shapeEmbeddedFontText(
    fontBytes,
    SHAPED_LTR_REPLACEMENT,
    {
      direction: "ltr",
      script: "Latn",
      language: "en",
    },
  );
  if (
    shaped.glyphs.length !== 1 ||
    shaped.clusterMap.length !== 1 ||
    shaped.clusterMap[0]?.text !== SHAPED_LTR_REPLACEMENT ||
    shaped.clusterMap[0]?.glyphIndices.length !== 1 ||
    shaped.glyphs[0]?.xOffset !== 0 ||
    shaped.glyphs[0]?.yOffset !== 0 ||
    shaped.glyphs[0]?.yAdvance !== 0 ||
    shaped.glyphs[0]?.xAdvance <= 0
  ) {
    throw new Error(
      "The CI font does not produce the bounded one-glyph LTR composition required by the shaped fixture.",
    );
  }
  const gidShaped = shaped.glyphs[0].glyphId;

  const widthFor = (gid: number) => {
    const width = intelligence.advanceWidthForGlyphId(gid);
    if (width === null || !Number.isFinite(width) || width <= 0) {
      throw new Error(`Missing advance width for fixture glyph ${gid}.`);
    }
    return Math.round((width / unitsPerEm) * 1000);
  };

  const widthEntries: (number | number[])[] = [];
  for (const gid of [...new Set([gidA, gidB, gidShaped])].sort((a, b) => a - b)) {
    widthEntries.push(gid, [widthFor(gid)]);
  }

  const cmapEntries: Array<[number, string]> = [
    [gidA, "A"],
    [gidB, "B"],
    [gidShaped, SHAPED_LTR_REPLACEMENT],
  ];
  const cmap = [
    "/CIDInit /ProcSet findresource begin",
    "12 dict begin",
    "begincmap",
    "1 begincodespacerange",
    "<0000> <FFFF>",
    "endcodespacerange",
    `${cmapEntries.length} beginbfchar`,
    ...cmapEntries.map(
      ([cid, text]) => `<${cidHex(cid)}> <${utf16BeHex(text)}>`,
    ),
    "endbfchar",
    "endcmap",
    "end",
    "end",
  ].join("\n");

  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const context = doc.context;
  const fontName =
    intelligence.metadata.postScriptName?.replace(/[^A-Za-z0-9_.-]/g, "") ||
    "LumeoShapedFixture";
  const fontFileRef = context.register(context.flateStream(fontBytes));
  const bbox = intelligence.metadata.bbox;
  const descriptorRef = context.register(
    context.obj({
      Type: "FontDescriptor",
      FontName: fontName,
      Flags: 32,
      ItalicAngle: intelligence.metadata.italicAngle ?? 0,
      Ascent: metric1000(intelligence.metadata.ascent, unitsPerEm, 800),
      Descent: metric1000(intelligence.metadata.descent, unitsPerEm, -200),
      CapHeight: metric1000(intelligence.metadata.capHeight, unitsPerEm, 700),
      FontBBox: bbox
        ? [
            metric1000(bbox.minX, unitsPerEm, 0),
            metric1000(bbox.minY, unitsPerEm, -200),
            metric1000(bbox.maxX, unitsPerEm, 1000),
            metric1000(bbox.maxY, unitsPerEm, 900),
          ]
        : [0, -200, 1000, 900],
      StemV: 80,
      FontFile2: fontFileRef,
    }),
  );
  const descendantRef = context.register(
    context.obj({
      Type: "Font",
      Subtype: "CIDFontType2",
      BaseFont: fontName,
      CIDSystemInfo: {
        Registry: "Adobe",
        Ordering: "Identity",
        Supplement: 0,
      },
      FontDescriptor: descriptorRef,
      DW: 1000,
      W: widthEntries,
      CIDToGIDMap: "Identity",
    }),
  );
  const toUnicodeRef = context.register(context.stream(cmap));
  const fontRef = context.register(
    context.obj({
      Type: "Font",
      Subtype: "Type0",
      BaseFont: fontName,
      Encoding: "Identity-H",
      DescendantFonts: [descendantRef],
      ToUnicode: toUnicodeRef,
    }),
  );
  page.node.set(
    PDFName.of("Resources"),
    context.obj({ Font: context.obj({ FShape: fontRef }) }),
  );
  const content = [
    "BT",
    "/FShape 20 Tf",
    "1 0 0 1 60 740 Tm",
    `<${cidHex(gidA)}${cidHex(gidB)}> Tj`,
    "ET",
  ].join("\n");
  page.node.set(
    PDFName.of("Contents"),
    context.register(context.flateStream(new TextEncoder().encode(content))),
  );

  return doc.save();
}
