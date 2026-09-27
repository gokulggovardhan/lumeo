import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const TMP_DIR = join(process.cwd(), "e2e", ".tmp");
export const EDIT_PERFORMANCE_120_PDF = join(
  TMP_DIR,
  "edit-performance-120-pages.pdf",
);
export const EDIT_PERFORMANCE_320_PDF = join(
  TMP_DIR,
  "edit-performance-320-pages.pdf",
);

async function buildPerformancePdf(pageCount: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const page = doc.addPage([612, 792]);
    page.drawText(`Performance page ${pageNumber}`, {
      x: 54,
      y: 738,
      size: 16,
      font: bold,
    });
    for (let row = 0; row < 12; row += 1) {
      page.drawText(
        `Row ${row + 1} on page ${pageNumber}: local Edit PDF performance fixture text.`,
        {
          x: 54,
          y: 700 - row * 42,
          size: 10,
          font: regular,
        },
      );
      page.drawRectangle({
        x: 52,
        y: 689 - row * 42,
        width: 500,
        height: 24,
        borderWidth: 0.4,
        borderColor: rgb(0.75, 0.75, 0.75),
      });
    }
  }

  return doc.save({ useObjectStreams: false });
}

export async function writeEditPerformanceFixtures(): Promise<void> {
  await mkdir(TMP_DIR, { recursive: true });
  const [small, large] = await Promise.all([
    buildPerformancePdf(120),
    buildPerformancePdf(320),
  ]);
  await Promise.all([
    writeFile(EDIT_PERFORMANCE_120_PDF, small),
    writeFile(EDIT_PERFORMANCE_320_PDF, large),
  ]);
}
