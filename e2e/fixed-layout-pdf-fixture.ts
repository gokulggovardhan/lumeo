import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export async function makeFixedLayoutInvoicePdf(): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

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
  text(page1, "JC No.: 87542", 36, 720, 9);
  text(page1, "JobType: PAID SERVICE", 210, 720, 9);
  text(page1, "RegnNo.: DEMO-4821", 36, 700, 9);
  text(page1, "Model: SAMPLE ROADSTER", 210, 700, 9);
  rule(page1, 684);

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
  for (const [label, x] of columns) text(page1, label, x, 665, 8, true);
  rule(page1, 654);

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
    const y = 625 - rowIndex * 42;
    row.forEach((value, columnIndex) =>
      text(page1, value, xs[columnIndex], y, columnIndex === 1 ? 7.5 : 8),
    );
  });
  rule(page1, 355);
  text(page1, "Parts Total", 112, 330, 9, true);
  text(page1, "3.00", 250, 330, 9);
  text(page1, "1007.50", 375, 330, 9);
  text(page1, "Labour Total", 112, 306, 9, true);
  text(page1, "4.00", 250, 306, 9);
  text(page1, "294.06", 375, 306, 9);
  rule(page1, 292);
  text(page1, "Sub Total", 112, 266, 9, true);
  text(page1, "1301.56", 375, 266, 9);
  rule(page1, 250);
  text(page1, "Grand Total", 345, 218, 10, true);
  text(page1, "1842.75", 445, 218, 10, true);
  text(page1, "Round Off", 345, 198, 9);
  text(page1, "0.16", 445, 198, 9);
  rule(page1, 182);

  text(page2, "Net Total", 300, 795, 11, true);
  text(page2, "1843.00", 455, 795, 11, true);
  text(page2, "( Rupees One Thousand Five Hundred and Thirty Six Only )", 130, 770, 9);
  text(page2, "Synthetic AMC fixture preserves fixed-layout service columns.", 36, 738, 9);
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
