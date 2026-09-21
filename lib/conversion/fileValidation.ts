export type ConversionInputValidation =
  | { ok: true }
  | {
      ok: false;
      code: "unsupported-file" | "malformed-input";
      message: string;
    };

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const DOC_MIME = "application/msword";
const PDF_MIME = "application/pdf";

const GENERIC_MIME_TYPES = new Set([
  "",
  "application/octet-stream",
  "binary/octet-stream",
]);

function hasPrefix(bytes: Uint8Array, prefix: readonly number[]): boolean {
  return (
    bytes.length >= prefix.length &&
    prefix.every((value, index) => bytes[index] === value)
  );
}

async function readHeader(file: File, bytes: number): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(0, bytes).arrayBuffer());
}

export function isWordNamedFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return name.endsWith(".docx") || name.endsWith(".doc");
}

export async function validateWordConversionFile(
  file: File,
): Promise<ConversionInputValidation> {
  const name = file.name.toLowerCase();
  const isDocx = name.endsWith(".docx");
  const isDoc = name.endsWith(".doc");

  if (!isDocx && !isDoc) {
    return {
      ok: false,
      code: "unsupported-file",
      message: "Choose a DOCX or DOC Word document.",
    };
  }

  if (
    !GENERIC_MIME_TYPES.has(file.type) &&
    file.type !== DOCX_MIME &&
    file.type !== DOC_MIME
  ) {
    return {
      ok: false,
      code: "unsupported-file",
      message: "This file does not appear to be a Word document.",
    };
  }

  const header = await readHeader(file, 8);
  const hasZipSignature =
    hasPrefix(header, [0x50, 0x4b, 0x03, 0x04]) ||
    hasPrefix(header, [0x50, 0x4b, 0x05, 0x06]) ||
    hasPrefix(header, [0x50, 0x4b, 0x07, 0x08]);
  const hasOleSignature = hasPrefix(header, [
    0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1,
  ]);

  if ((isDocx && !hasZipSignature) || (isDoc && !hasOleSignature)) {
    return {
      ok: false,
      code: "malformed-input",
      message:
        "This Word file appears to be damaged, incomplete, or saved in a different format.",
    };
  }

  return { ok: true };
}

export async function validatePdfConversionFile(
  file: File,
): Promise<ConversionInputValidation> {
  const nameLooksPdf = file.name.toLowerCase().endsWith(".pdf");
  const mimeLooksPdf =
    file.type === PDF_MIME || GENERIC_MIME_TYPES.has(file.type);

  if (!nameLooksPdf && file.type !== PDF_MIME) {
    return {
      ok: false,
      code: "unsupported-file",
      message: "Choose a PDF document.",
    };
  }

  if (!mimeLooksPdf) {
    return {
      ok: false,
      code: "unsupported-file",
      message: "This file does not appear to be a PDF document.",
    };
  }

  const header = await readHeader(file, 5);
  const hasPdfSignature = hasPrefix(header, [0x25, 0x50, 0x44, 0x46, 0x2d]);

  if (!hasPdfSignature) {
    return {
      ok: false,
      code: "malformed-input",
      message:
        "This PDF appears to be damaged, incomplete, or saved in a different format.",
    };
  }

  return { ok: true };
}
