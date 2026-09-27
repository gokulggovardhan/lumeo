import {
  PDFDocument,
  PDFName,
  StandardFonts,
} from "pdf-lib";

export const PARAGRAPH_SOURCE_LINES = [
  "Paragraph alpha",
  "Paragraph beta",
] as const;

export const PARAGRAPH_REPLACEMENT_LINES = [
  "Alpha revised",
  "Beta revised",
] as const;

/**
 * Two visible native text lines in one BT/ET text object, using the same font
 * resource and CTM with an explicit T* line move between them. This is the
 * bounded structure supported by the first preserved-line paragraph writer.
 */
export async function buildPreservedLineParagraphPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const context = doc.context;
  const fonts = context.obj({});
  fonts.set(PDFName.of("FPara"), font.ref);
  page.node.Resources()!.set(PDFName.of("Font"), fonts);

  const body = [
    "BT",
    "/FPara 18 Tf",
    "24 TL",
    "1 0 0 1 60 740 Tm",
    `(${PARAGRAPH_SOURCE_LINES[0]}) Tj`,
    "T*",
    `(${PARAGRAPH_SOURCE_LINES[1]}) Tj`,
    "ET",
  ].join("\n");

  page.node.set(
    PDFName.of("Contents"),
    context.register(
      context.flateStream(new TextEncoder().encode(body)),
    ),
  );
  return doc.save();
}


export const FRAGMENTED_PARAGRAPH_SOURCE_LINES = [
  "Fragmented alpha",
  "Fragmented beta",
] as const;

export const FRAGMENTED_PARAGRAPH_REPLACEMENT_LINES = [
  "Alpha combined",
  "Beta combined",
] as const;

/**
 * Two visible paragraph lines in one BT/ET object where EACH visible line is
 * internally split across consecutive native show-text operators. There is no
 * positioning/text-state operator between a line's fragments, so PDF.js may
 * present each pair as one visual run while native provenance remains two
 * byte-addressable operators. This is the bounded Phase B.2 structure.
 */
export async function buildFragmentedLineParagraphPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const context = doc.context;
  const fonts = context.obj({});
  fonts.set(PDFName.of("FParaFrag"), font.ref);
  page.node.Resources()!.set(PDFName.of("Font"), fonts);

  const body = [
    "BT",
    "/FParaFrag 18 Tf",
    "24 TL",
    "1 0 0 1 60 740 Tm",
    "(Fragmented ) Tj",
    "(alpha) Tj",
    "T*",
    "(Fragmented ) Tj",
    "[(beta)] TJ",
    "ET",
  ].join("\n");

  page.node.set(
    PDFName.of("Contents"),
    context.register(
      context.flateStream(new TextEncoder().encode(body)),
    ),
  );
  return doc.save();
}
