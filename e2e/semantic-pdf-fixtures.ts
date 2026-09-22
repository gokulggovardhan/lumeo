import {
  PDFDocument,
  PDFName,
  PDFString,
  StandardFonts,
  rgb,
} from "pdf-lib";

export async function makeSemanticLetterPdf(): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const body = await pdf.embedFont(StandardFonts.TimesRoman);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const linkFont = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([612, 792]);

  page.drawText("Lumeo Professional Letter", {
    x: 72,
    y: 720,
    size: 16,
    font: bold,
    color: rgb(0.12, 0.18, 0.3),
  });
  page.drawText(
    "This document exercises normal paragraph reconstruction from a fixed PDF page while preserving useful Word editability.",
    { x: 72, y: 680, size: 11, font: body, color: rgb(0, 0, 0) },
  );
  page.drawText(
    "The second visual line continues the same paragraph with stable spacing, baseline placement and selectable text.",
    { x: 72, y: 666, size: 11, font: body, color: rgb(0, 0, 0) },
  );
  page.drawText(
    "A separate paragraph follows after a larger vertical gap and must remain independently editable in the DOCX.",
    { x: 72, y: 626, size: 11, font: body, color: rgb(0, 0, 0) },
  );

  const linkText = "https://example.com/semantic-letter";
  page.drawText(linkText, {
    x: 72,
    y: 588,
    size: 10,
    font: linkFont,
    color: rgb(0.02, 0.35, 0.76),
  });
  const linkWidth = linkFont.widthOfTextAtSize(linkText, 10);
  const annotation = pdf.context.register(
    pdf.context.obj({
      Type: PDFName.of("Annot"),
      Subtype: PDFName.of("Link"),
      Rect: [72, 586, 72 + linkWidth, 600],
      Border: [0, 0, 0],
      A: {
        Type: PDFName.of("Action"),
        S: PDFName.of("URI"),
        URI: PDFString.of(linkText),
      },
    }),
  );
  page.node.set(PDFName.of("Annots"), pdf.context.obj([annotation]));

  page.drawText("Kind regards,", {
    x: 72,
    y: 530,
    size: 11,
    font: body,
  });
  page.drawText("Lumeo Quality Engineering", {
    x: 72,
    y: 512,
    size: 11,
    font: body,
  });

  return Buffer.from(await pdf.save());
}

export async function makeWhitespaceStatementPdf(): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const body = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([612, 792]);

  page.drawText("Account activity statement", {
    x: 72,
    y: 720,
    size: 15,
    font: bold,
  });

  const rows = [
    ["Description", "Qty", "Amount"],
    ["Monthly service", "2", "125.00"],
    ["Priority support", "1", "80.00"],
    ["Total", "3", "205.00"],
  ] as const;
  const xs = [72, 310, 420] as const;
  rows.forEach((row, rowIndex) => {
    const y = 670 - rowIndex * 24;
    row.forEach((value, columnIndex) => {
      page.drawText(value, {
        x: xs[columnIndex],
        y,
        size: rowIndex === 0 ? 10.5 : 10,
        font: rowIndex === 0 ? bold : body,
      });
    });
  });

  page.drawText("All values above are synthetic regression data.", {
    x: 72,
    y: 540,
    size: 9,
    font: body,
    color: rgb(0.35, 0.35, 0.35),
  });

  return Buffer.from(await pdf.save());
}

export async function makeTwoColumnReportPdf(): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const body = await pdf.embedFont(StandardFonts.TimesRoman);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([612, 792]);

  page.drawText("Two-column research brief", {
    x: 54,
    y: 730,
    size: 15,
    font: bold,
  });

  const left = [
    "Left column introduces the first topic.",
    "It continues with ordinary narrative prose.",
    "The final left line closes the discussion.",
  ];
  const right = [
    "Right column begins an independent topic.",
    "It must not be inferred as table cells.",
    "Its reading structure remains independent.",
  ];

  left.forEach((value, index) =>
    page.drawText(value, {
      x: 54,
      y: 680 - index * 20,
      size: 10,
      font: body,
    }),
  );
  right.forEach((value, index) =>
    page.drawText(value, {
      x: 320,
      y: 680 - index * 20,
      size: 10,
      font: body,
    }),
  );

  return Buffer.from(await pdf.save());
}
