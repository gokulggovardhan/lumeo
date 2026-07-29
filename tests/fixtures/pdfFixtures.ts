// tests/fixtures/pdfFixtures.ts
//
// Reusable synthetic PDF generators for the regression suite. Every asset is
// built in-memory via pdf-lib rather than committed as a binary file --
// consistent with the existing per-test `makeBlankPdf`-style helpers already
// used throughout tests/*.test.ts, and it keeps the repo free of binary blobs
// that git can't diff meaningfully.
//
// Not every asset in docs/RELEASE_CERTIFICATION.md's "Part 1" checklist is
// synthesizable here -- see that doc's "Known limitations" section for the
// ones pdf-lib genuinely cannot produce (encrypted/password-protected PDFs,
// true bookmarks/outline entries, and real annotation objects), rather than
// faking them with hand-crafted bytes.

import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";

export const PAGE_SIZES = {
  a3: [841.89, 1190.55] as [number, number],
  a4: [595.28, 841.89] as [number, number],
  letter: [612, 792] as [number, number],
  legal: [612, 1008] as [number, number],
  square: [600, 600] as [number, number],
  // 80mm thermal receipt roll, long single page.
  longReceipt: [226.77, 1500] as [number, number],
};

async function toArrayBuffer(doc: PDFDocument): Promise<ArrayBuffer> {
  const bytes = await doc.save();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/** Single blank page, smallest realistic case. */
export async function makeSinglePagePdf(size: [number, number] = PAGE_SIZES.a4): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  doc.addPage(size);
  return toArrayBuffer(doc);
}

/** A handful of blank pages -- the common "everyday" multi-page case. */
export async function makeMediumPdf(pageCount = 10, size: [number, number] = PAGE_SIZES.a4): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) doc.addPage(size);
  return toArrayBuffer(doc);
}

/** Stresses per-page loop performance and memory in export/preview code paths. */
export async function makeLargePdf(pageCount = 150, size: [number, number] = PAGE_SIZES.a4): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) doc.addPage(size);
  return toArrayBuffer(doc);
}

/** Landscape orientation via swapped dimensions (not /Rotate). */
export async function makeLandscapePdf(pageCount = 3): Promise<ArrayBuffer> {
  const [w, h] = PAGE_SIZES.a4;
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) doc.addPage([h, w]);
  return toArrayBuffer(doc);
}

/** One page per named size -- exercises mixed-page-size handling in a single document. */
export async function makeMixedPageSizesPdf(): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  for (const size of Object.values(PAGE_SIZES)) doc.addPage(size);
  return toArrayBuffer(doc);
}

/** One page per /Rotate value -- the exact case Watermark v1.1 and Crop's rotation math must handle identically. */
export async function makeMixedRotationsPdf(size: [number, number] = PAGE_SIZES.a4): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  for (const rotation of [0, 90, 180, 270] as const) {
    const page = doc.addPage(size);
    page.setRotation(degrees(rotation));
  }
  return toArrayBuffer(doc);
}

/** Dense text content -- approximates a "text-heavy" real-world document for Extract Text / Edit PDF. */
export async function makeTextHeavyPdf(pageCount = 3): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let p = 0; p < pageCount; p++) {
    const page = doc.addPage(PAGE_SIZES.a4);
    const { height } = page.getSize();
    for (let line = 0; line < 45; line++) {
      page.drawText(`Line ${line + 1} on page ${p + 1} -- regression test filler content.`, {
        x: 40,
        y: height - 40 - line * 16,
        size: 10,
        font,
      });
    }
  }
  return toArrayBuffer(doc);
}

/**
 * Unicode metadata (not glyph rendering) -- pdf-lib's built-in StandardFonts
 * are WinAnsi-only, so real Unicode/RTL glyph rendering would need a bundled
 * font file + fontkit registration, which this repo doesn't ship. The Info
 * dictionary's title/author strings do support full Unicode independent of
 * any font, so this is a genuine (if partial) Unicode/RTL structural check.
 */
export async function makeUnicodeMetadataPdf(): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  doc.addPage(PAGE_SIZES.a4);
  doc.setTitle("Unicode test — 日本語 · العربية · Русский");
  doc.setAuthor("שם מחבר");
  return toArrayBuffer(doc);
}

/** Full metadata set -- exercises any export path that reads/preserves document Info. */
export async function makeMetadataPdf(): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  doc.addPage(PAGE_SIZES.a4);
  doc.setTitle("Regression Test Document");
  doc.setAuthor("Lumeo Release Certification");
  doc.setSubject("Automated PDF metadata check");
  doc.setKeywords(["lumeo", "regression", "certification"]);
  doc.setProducer("Lumeo PDF Workspace");
  doc.setCreator("tests/fixtures/pdfFixtures.ts");
  return toArrayBuffer(doc);
}

/** Transparent shape -- exercises any export path sensitive to alpha/graphics-state handling. */
export async function makeTransparencyPdf(): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage(PAGE_SIZES.a4);
  page.drawRectangle({ x: 50, y: 50, width: 200, height: 200, color: rgb(1, 0, 0), opacity: 0.35 });
  page.drawRectangle({ x: 150, y: 150, width: 200, height: 200, color: rgb(0, 0, 1), opacity: 0.35 });
  return toArrayBuffer(doc);
}

/** Vector-only content (lines + shapes, no text/images) -- approximates a "vector PDF" (e.g. a CAD/diagram export). */
export async function makeVectorPdf(): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage(PAGE_SIZES.a4);
  page.drawLine({ start: { x: 50, y: 50 }, end: { x: 500, y: 700 }, thickness: 2, color: rgb(0, 0, 0) });
  page.drawEllipse({ x: 300, y: 400, xScale: 100, yScale: 60, borderColor: rgb(0, 0, 0), borderWidth: 1 });
  page.drawRectangle({ x: 100, y: 100, width: 150, height: 80, borderColor: rgb(0, 0, 0), borderWidth: 1 });
  return toArrayBuffer(doc);
}

/**
 * Image-only page (a single embedded solid-color PNG, no text layer) --
 * approximates a "scanned"/"image-only" PDF for Compress, PDF-to-JPG, and
 * Extract Text's "no extractable text" path. A real scanned document has
 * far more visual entropy than this flat-color synthetic image, so this
 * covers the *structural* image-only case, not OCR-quality fidelity.
 */
export async function makeImageOnlyPdf(): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  // Minimal valid 1x1 PNG (solid gray), scaled up when drawn -- avoids
  // depending on any bundled image asset.
  const onePixelGrayPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  const image = await doc.embedPng(onePixelGrayPng);
  const page = doc.addPage(PAGE_SIZES.a4);
  const { width, height } = page.getSize();
  page.drawImage(image, { x: 0, y: 0, width, height });
  return toArrayBuffer(doc);
}

/** A fillable text field -- exercises any export path that must preserve or flatten AcroForm fields. */
export async function makeFormFieldPdf(): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage(PAGE_SIZES.a4);
  const form = doc.getForm();
  const field = form.createTextField("regression.testField");
  field.setText("Sample form value");
  field.addToPage(page, { x: 50, y: 700, width: 200, height: 24 });
  return toArrayBuffer(doc);
}

/** Truncated mid-stream -- a common real-world "corrupted download" case (never opens). */
export async function makeCorruptedPdfBytes(): Promise<ArrayBuffer> {
  const valid = await makeMediumPdf(5);
  const bytes = new Uint8Array(valid);
  return bytes.slice(0, Math.floor(bytes.length * 0.4)).buffer;
}

/** No %PDF signature at all -- the "wrong file type entirely" case (e.g. a renamed .txt/.docx). */
export function makeNonPdfBytes(): ArrayBuffer {
  const text = "This is plain text, not a PDF at all -- a renamed or mislabeled file.";
  const bytes = new TextEncoder().encode(text);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/** Empty (zero-page) document -- the degenerate edge case every scope/page-index loop must not crash on. */
export async function makeZeroPagePdf(): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  return toArrayBuffer(doc);
}
