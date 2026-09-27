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
