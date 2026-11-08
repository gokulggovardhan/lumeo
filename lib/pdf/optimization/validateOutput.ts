import { PDFDocument } from "pdf-lib";

/**
 * Shared release guard for Merge PDF and Compress PDF. Treat displayed size
 * and page count as properties of the actual serialized bytes, never as
 * guesses from the compression plan or UI state.
 */
export async function validatePdfOutput(
  bytes: Uint8Array | ArrayBuffer,
  expectedPageCount: number,
): Promise<{ byteLength: number; pageCount: number }> {
  const byteLength = bytes.byteLength;
  if (!Number.isSafeInteger(expectedPageCount) || expectedPageCount < 1) {
    throw new Error("Output validation failed. Expected page count is invalid.");
  }
  if (byteLength < 8) {
    throw new Error("Output validation failed. The generated PDF was empty.");
  }
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: false });
  const pageCount = pdf.getPageCount();
  if (pageCount !== expectedPageCount) {
    throw new Error("Output validation failed. Page count did not match the expected document.");
  }
  return { byteLength, pageCount };
}
