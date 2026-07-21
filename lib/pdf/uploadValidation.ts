import { formatBytes } from "@/lib/pdf/formatBytes";

export const MAX_PDF_FILE_SIZE_BYTES = 150 * 1024 * 1024;
export const MAX_PDF_PAGE_COUNT = 500;

// PDFs always start with the 4-byte "%PDF" signature. Checking this (rather
// than trusting the file extension or the browser-reported MIME type, both
// of which are trivially spoofable) catches renamed non-PDF files before
// they reach pdfjs.
export function hasPdfMagicBytes(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 4) return false;
  const bytes = new Uint8Array(buffer, 0, 4);
  return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}

export function isPdfNamedFile(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

export function checkPdfFileSize(file: File): string | null {
  if (file.size > MAX_PDF_FILE_SIZE_BYTES) {
    return `This file is too large. The limit is ${formatBytes(MAX_PDF_FILE_SIZE_BYTES)}.`;
  }
  return null;
}

export function checkPdfPageCount(pageCount: number): string | null {
  if (pageCount > MAX_PDF_PAGE_COUNT) {
    return `This PDF has too many pages. The limit is ${MAX_PDF_PAGE_COUNT} pages.`;
  }
  return null;
}

// JPEGs always start with FF D8 FF, PNGs with an 8-byte signature. Checking
// this (rather than trusting the file extension or the browser-reported
// MIME type, both spoofable) catches renamed non-image files before they
// reach the canvas decode pipeline.
export function hasImageMagicBytes(buffer: ArrayBuffer, mimeType: string): boolean {
  const bytes = new Uint8Array(buffer);
  if (mimeType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mimeType === "image/png") {
    const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return bytes.length >= 8 && pngSignature.every((byte, index) => bytes[index] === byte);
  }
  if (mimeType === "image/webp") {
    // RIFF....WEBP: bytes 0-3 "RIFF", bytes 8-11 "WEBP".
    return (
      bytes.length >= 12 &&
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    );
  }
  return false;
}

export const MAX_IMAGE_FILE_SIZE_BYTES = 40 * 1024 * 1024;
export const MAX_IMAGE_COUNT = 300;
export const MAX_TOTAL_IMAGES_SIZE_BYTES = 500 * 1024 * 1024;

export function checkImageFileSize(file: File): string | null {
  if (file.size > MAX_IMAGE_FILE_SIZE_BYTES) {
    return `"${file.name}" is too large. The limit per image is ${formatBytes(MAX_IMAGE_FILE_SIZE_BYTES)}.`;
  }
  return null;
}

export function checkImageCount(count: number): string | null {
  if (count > MAX_IMAGE_COUNT) {
    return `Too many images. The limit is ${MAX_IMAGE_COUNT} images per PDF.`;
  }
  return null;
}

export function checkTotalImagesSize(totalBytes: number): string | null {
  if (totalBytes > MAX_TOTAL_IMAGES_SIZE_BYTES) {
    return `Total image size is too large. The limit is ${formatBytes(MAX_TOTAL_IMAGES_SIZE_BYTES)}.`;
  }
  return null;
}
