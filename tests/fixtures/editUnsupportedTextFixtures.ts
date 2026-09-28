import { PDFDocument, PDFName } from "pdf-lib";
import { inspectPdfFontProgram } from "../../lib/pdf/edit/fontProgramIntelligence.ts";
import type { DocumentTextCapabilityCategory } from "../../lib/pdf/edit/textCapabilityClassifier.ts";
import { readCiTrueTypeFontBytes } from "./shapedGlyphFixture.ts";

export type UnsupportedTextSafetyFixture = Readonly<{
  id: string;
  bytes: Uint8Array;
  expectedCategory: DocumentTextCapabilityCategory;
  expectedPlannerReason: RegExp;
}>;

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
    throw new Error(`Unsupported-text fixture CID ${cid} is outside the two-byte range.`);
  }
  return cid.toString(16).padStart(4, "0").toUpperCase();
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

async function buildType3Pdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const context = doc.context;

  const charProcRef = context.register(
    context.stream(
      [
        "500 0 0 0 500 700 d1",
        "0 0 500 700 re",
        "f",
      ].join("\n"),
    ),
  );
  const charProcs = context.obj({ A: charProcRef });
  const encoding = context.obj({
    Type: "Encoding",
    Differences: [65, PDFName.of("A")],
  });
  const fontRef = context.register(
    context.obj({
      Type: "Font",
      Subtype: "Type3",
      Name: "FType3",
      FontBBox: [0, 0, 500, 700],
      FontMatrix: [0.001, 0, 0, 0.001, 0, 0],
      CharProcs: charProcs,
      Encoding: encoding,
      FirstChar: 65,
      LastChar: 65,
      Widths: [500],
      Resources: context.obj({}),
    }),
  );

  page.node.set(
    PDFName.of("Resources"),
    context.obj({ Font: context.obj({ FType3: fontRef }) }),
  );
  const content = [
    "BT",
    "/FType3 20 Tf",
    "1 0 0 1 72 700 Tm",
    "<41> Tj",
    "ET",
  ].join("\n");
  page.node.set(
    PDFName.of("Contents"),
    context.register(context.flateStream(new TextEncoder().encode(content))),
  );

  return doc.save();
}

async function buildVerticalIdentityPdf(): Promise<Uint8Array> {
  const fontBytes = await readCiTrueTypeFontBytes();
  const inspection = await inspectPdfFontProgram(fontBytes);
  if (inspection.kind !== "ok") {
    throw new Error(
      `Could not inspect vertical safety fixture font: ${inspection.reason}`,
    );
  }
  const intelligence = inspection.intelligence;
  const unitsPerEm = intelligence.metadata.unitsPerEm;
  if (!unitsPerEm || unitsPerEm <= 0) {
    throw new Error("Vertical safety fixture font has no valid units-per-em.");
  }
  const gid = intelligence.glyphIdForCodePoint("A".codePointAt(0)!);
  if (!gid) {
    throw new Error("Vertical safety fixture font does not contain A.");
  }
  const rawWidth = intelligence.advanceWidthForGlyphId(gid);
  if (rawWidth === null || !Number.isFinite(rawWidth) || rawWidth <= 0) {
    throw new Error("Vertical safety fixture font has no usable A advance.");
  }
  const width1000 = Math.round((rawWidth / unitsPerEm) * 1000);

  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const context = doc.context;
  const fontName =
    intelligence.metadata.postScriptName?.replace(/[^A-Za-z0-9_.-]/g, "") ||
    "LumeoVerticalSafety";
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
      W: [gid, [width1000]],
      // Default vertical origin/advance metrics are explicit evidence that
      // this is a genuine vertical CID font. The current native writer does
      // not consume DW2/W2 and therefore must remain read-only.
      DW2: [880, -1000],
      CIDToGIDMap: "Identity",
    }),
  );
  const cmap = [
    "/CIDInit /ProcSet findresource begin",
    "12 dict begin",
    "begincmap",
    "1 begincodespacerange",
    "<0000> <FFFF>",
    "endcodespacerange",
    "1 beginbfchar",
    `<${cidHex(gid)}> <${utf16BeHex("A")}>`,
    "endbfchar",
    "endcmap",
    "end",
    "end",
  ].join("\n");
  const toUnicodeRef = context.register(context.stream(cmap));
  const fontRef = context.register(
    context.obj({
      Type: "Font",
      Subtype: "Type0",
      BaseFont: fontName,
      Encoding: "Identity-V",
      DescendantFonts: [descendantRef],
      ToUnicode: toUnicodeRef,
    }),
  );

  page.node.set(
    PDFName.of("Resources"),
    context.obj({ Font: context.obj({ FVertical: fontRef }) }),
  );
  const content = [
    "BT",
    "/FVertical 20 Tf",
    "1 0 0 1 72 700 Tm",
    `<${cidHex(gid)}> Tj`,
    "ET",
  ].join("\n");
  page.node.set(
    PDFName.of("Contents"),
    context.register(context.flateStream(new TextEncoder().encode(content))),
  );

  return doc.save();
}

function simpleFontDescriptor(
  context: PDFDocument["context"],
  fontName: string,
) {
  return context.register(
    context.obj({
      Type: "FontDescriptor",
      FontName: fontName,
      Flags: 32,
      ItalicAngle: 0,
      Ascent: 800,
      Descent: -200,
      CapHeight: 700,
      FontBBox: [0, -200, 1000, 900],
      StemV: 80,
      MissingWidth: 600,
    }),
  );
}

async function buildSimpleTextPdf({
  encoding,
  textMatrix,
}: {
  encoding: "WinAnsiEncoding" | null;
  textMatrix: readonly [number, number, number, number, number, number];
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const context = doc.context;
  const fontName = "Helvetica";
  const descriptorRef = simpleFontDescriptor(context, fontName);
  const fontEntries: Record<string, unknown> = {
    Type: "Font",
    Subtype: "Type1",
    BaseFont: fontName,
    FirstChar: 65,
    LastChar: 65,
    Widths: [600],
    FontDescriptor: descriptorRef,
  };
  if (encoding) fontEntries.Encoding = encoding;
  const fontRef = context.register(context.obj(fontEntries));
  page.node.set(
    PDFName.of("Resources"),
    context.obj({ Font: context.obj({ FSimple: fontRef }) }),
  );
  const content = [
    "BT",
    "/FSimple 20 Tf",
    `${textMatrix.join(" ")} Tm`,
    "<41> Tj",
    "ET",
  ].join("\n");
  page.node.set(
    PDFName.of("Contents"),
    context.register(context.flateStream(new TextEncoder().encode(content))),
  );
  return doc.save();
}

export async function buildUnsupportedTextSafetyFixtures(): Promise<
  UnsupportedTextSafetyFixture[]
> {
  return [
    {
      id: "unsupported-type3-charproc",
      bytes: await buildType3Pdf(),
      expectedCategory: "TYPE3_TEXT",
      expectedPlannerReason: /Type3/i,
    },
    {
      id: "unsupported-vertical-identity-v",
      bytes: await buildVerticalIdentityPdf(),
      expectedCategory: "VERTICAL_TEXT",
      expectedPlannerReason: /vertical|writing mode/i,
    },
    {
      id: "unsupported-unresolved-simple-encoding",
      bytes: await buildSimpleTextPdf({
        encoding: null,
        textMatrix: [1, 0, 0, 1, 72, 700],
      }),
      expectedCategory: "NATIVE_TEXT_WITH_ENCODING_LIMITATIONS",
      expectedPlannerReason: /encoding could not be resolved/i,
    },
    {
      id: "unsupported-material-skew",
      bytes: await buildSimpleTextPdf({
        encoding: "WinAnsiEncoding",
        textMatrix: [1, 0, 0.25, 1, 72, 700],
      }),
      expectedCategory: "COMPLEX_VECTOR_TEXT",
      expectedPlannerReason: /skew/i,
    },
  ];
}
