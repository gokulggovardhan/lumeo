import {
  degrees,
  PDFDocument,
  PDFName,
  PDFString,
  StandardFonts,
  rgb,
} from "pdf-lib";

export async function makeFixedLayoutInvoicePdf(): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const serif = await pdf.embedFont(StandardFonts.TimesRoman);

  const page1 = pdf.addPage([595.276, 841.89]);
  const page2 = pdf.addPage([595.276, 841.89]);

  const rule = (page: ReturnType<typeof pdf.addPage>, y: number) =>
    page.drawLine({
      start: { x: 36, y },
      end: { x: 559, y },
      thickness: 0.8,
      color: rgb(0.25, 0.25, 0.25),
    });
  const text = (
    page: ReturnType<typeof pdf.addPage>,
    value: string,
    x: number,
    y: number,
    size = 9,
    useBold = false,
  ) =>
    page.drawText(value, {
      x,
      y,
      size,
      font: useBold ? bold : regular,
      color: rgb(0, 0, 0),
    });

  text(page1, "Invoice No: SYN-84721", 36, 806, 11, true);
  text(page1, "Service Labour Invoice", 225, 806, 11, true);
  text(page1, "Invoice Date: 15/01/2030 10:30", 394, 806, 9);
  rule(page1, 795);

  text(page1, "LUMEO MOTORS PRIVATE LIMITED", 36, 770, 10, true);
  text(page1, "SYNTHETIC AUTOMOBILES", 330, 770, 10, true);
  text(page1, "GST IN No.: SYNTH27DEMO", 36, 740, 9);

  const blue = rgb(0, 0, 0.93);
  const linkText = "support.example/fidelity";
  page1.drawText(linkText, {
    x: 36,
    y: 726,
    size: 9,
    font: regular,
    color: blue,
  });
  const linkWidth = regular.widthOfTextAtSize(linkText, 9);
  page1.drawRectangle({
    x: 36,
    y: 724.7,
    width: linkWidth,
    height: 0.7,
    color: blue,
  });
  const linkAnnotation = pdf.context.register(
    pdf.context.obj({
      Type: PDFName.of("Annot"),
      Subtype: PDFName.of("Link"),
      Rect: [36, 724, 36 + linkWidth, 738],
      Border: [0, 0, 0],
      A: {
        Type: PDFName.of("Action"),
        S: PDFName.of("URI"),
        URI: PDFString.of("https://example.com/fidelity"),
      },
    }),
  );
  page1.node.set(PDFName.of("Annots"), pdf.context.obj([linkAnnotation]));

  text(page1, "JC No.: 87542", 36, 708, 9);
  text(page1, "JobType: PAID SERVICE", 210, 708, 9);
  text(page1, "RegnNo.: DEMO-4821", 36, 688, 9);
  text(page1, "Model: SAMPLE ROADSTER", 210, 688, 9);
  rule(page1, 674);

  const columns = [
    ["Item No", 38],
    ["Particulars", 112],
    ["Qty", 250],
    ["Rate", 292],
    ["Disc", 335],
    ["Taxable", 375],
    ["HSN", 428],
    ["IGST", 485],
    ["MRP", 530],
  ] as const;
  for (const [label, x] of columns) text(page1, label, x, 655, 8, true);
  rule(page1, 644);

  const rows = [
    ["ITEM-A101", "Cleaning fluid 50 ml", "1.00", "83.90", "12.58", "71.32", "34030000", "18.00", "99.00"],
    ["ITEM-B202", "BRAKE LINING KIT", "1.00", "435.59", "108.90", "326.69", "87149000", "18.00", "514.00"],
    ["ITEM-C303", "SYNTHETIC LUBRICANT 1200 ML", "1.00", "761.86", "152.37", "609.49", "27100000", "18.00", "899.00"],
    ["SHOP", "shop consumable", "1.00", "200.00", "60.00", "140.00", "9985", "18.00", "236.00"],
    ["SERVICE-X", "DRIVE SYSTEM CLEANING", "1.00", "100.00", "30.00", "70.00", "9987", "18.00", "118.00"],
    ["PA", "PAID SERVICE", "1.00", "560.00", "559.94", "0.06", "9954", "18.00", "660.80"],
  ] as const;
  const xs = [38, 112, 250, 292, 335, 375, 428, 485, 530];
  rows.forEach((row, rowIndex) => {
    const y = 615 - rowIndex * 42;
    row.forEach((value, columnIndex) =>
      text(page1, value, xs[columnIndex], y, columnIndex === 1 ? 7.5 : 8),
    );
  });
  text(page1, "LONG-DESC", 38, 354, 8);
  text(page1, "Long service description", 112, 366, 7.5);
  text(page1, "continues on a second line", 112, 354, 7.5);
  text(page1, "without moving numeric cells", 112, 342, 7.5);
  text(page1, "1.00", 250, 354, 8);
  text(page1, "88.00", 292, 354, 8);
  text(page1, "0.00", 335, 354, 8);
  text(page1, "88.00", 375, 354, 8);
  text(page1, "9988", 428, 354, 8);
  text(page1, "18.00", 485, 354, 8);
  text(page1, "103.84", 530, 354, 8);
  rule(page1, 326);
  text(page1, "Parts Total", 112, 306, 9, true);
  text(page1, "3.00", 250, 306, 9);
  text(page1, "1007.50", 375, 306, 9);
  text(page1, "Labour Total", 112, 282, 9, true);
  text(page1, "4.00", 250, 282, 9);
  text(page1, "294.06", 375, 282, 9);
  rule(page1, 268);
  text(page1, "Sub Total", 112, 244, 9, true);
  text(page1, "1301.56", 375, 244, 9);
  rule(page1, 228);
  text(page1, "Grand Total", 345, 198, 10, true);
  text(page1, "1842.75", 445, 198, 10, true);
  text(page1, "Round Off", 345, 178, 9);
  text(page1, "0.16", 445, 178, 9);
  rule(page1, 162);

  page1.drawText("Unicode café résumé €", {
    x: 36,
    y: 140,
    size: 8,
    font: regular,
    color: rgb(0.35, 0.35, 0.35),
  });

  text(page2, "Net Total", 300, 795, 11, true);
  text(page2, "1843.00", 455, 795, 11, true);
  text(page2, "( Rupees One Thousand Five Hundred and Thirty Six Only )", 130, 770, 9);
  text(page2, "Synthetic AMC fixture preserves fixed-layout service columns.", 36, 738, 9);
  page2.drawText("Serif text validates mixed-family metrics.", {
    x: 36,
    y: 720,
    size: 11,
    font: serif,
    color: rgb(0.08, 0.08, 0.08),
  });
  page2.drawText("ROTATED NOTE", {
    x: 570,
    y: 500,
    size: 8,
    font: regular,
    rotate: degrees(90),
    color: rgb(0.4, 0.4, 0.4),
  });
  rule(page2, 700);

  const amcHeadings = [
    ["Amc No.", 36],
    ["Valid Till", 95],
    ["Service", 166],
    ["Water wash", 255],
    ["Co check", 342],
    ["chain", 414],
    ["Pick up & drop", 480],
  ] as const;
  for (const [label, x] of amcHeadings) text(page2, label, x, 670, 8, true);
  const totalAvail = [166, 210, 255, 299, 342, 382, 414, 448, 500, 540];
  totalAvail.forEach((x, index) =>
    text(page2, index % 2 === 0 ? "Total" : "Avail", x, 650, 7.5, true),
  );
  rule(page2, 638);

  text(page2, "AMC9007", 36, 610, 9);
  text(page2, "15-Jan-2030", 95, 610, 9);
  ["3", "2", "2", "0", "0", "0", "0", "0", "2", "0"].forEach((value, index) =>
    text(page2, value, totalAvail[index] + 8, 610, 9),
  );
  rule(page2, 590);
  text(page2, "For LUMEO MOTORS PRIVATE LIMITED", 315, 555, 9, true);
  text(page2, "Authorised Signatory", 430, 520, 9);

  return Buffer.from(await pdf.save());
}

export function frameXForText(documentXml: string, value: string): number {
  const marker = `>${value}</w:t>`;
  const index = documentXml.indexOf(marker);
  if (index < 0) throw new Error(`Missing reconstructed text: ${value}`);
  const prefix = documentXml.slice(Math.max(0, index - 1600), index);
  const matches = Array.from(prefix.matchAll(/w:x="(\d+)"/g));
  const x = matches.at(-1)?.[1];
  if (!x) throw new Error(`Missing positioned frame for: ${value}`);
  return Number(x) / 20;
}
