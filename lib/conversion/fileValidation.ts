export type ConversionInputValidation =
  | { ok: true }
  | {
      ok: false;
      code: "unsupported-file" | "malformed-input" | "encrypted-input";
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

const MAX_ZIP_EOCD_SEARCH_BYTES = 65_557;
const MAX_DOCX_ENTRIES = 10_000;
const MAX_DOCX_UNCOMPRESSED_BYTES = 768 * 1024 * 1024;

type DocxPackageInspection =
  | { ok: true }
  | {
      ok: false;
      code: "malformed-input" | "encrypted-input";
      message: string;
    };

function readUint16(view: DataView, offset: number): number {
  return view.getUint16(offset, true);
}

function readUint32(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

function unsafeZipEntryName(name: string): boolean {
  return (
    name.startsWith("/") ||
    name.startsWith("\\") ||
    name.includes("\\") ||
    name.split("/").some((part) => part === "..")
  );
}

async function inspectDocxPackage(file: File): Promise<DocxPackageInspection> {
  const tailStart = Math.max(0, file.size - MAX_ZIP_EOCD_SEARCH_BYTES);
  const tail = new Uint8Array(await file.slice(tailStart).arrayBuffer());
  const tailView = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);

  let eocdOffset = -1;
  for (let offset = tail.byteLength - 22; offset >= 0; offset -= 1) {
    if (
      tail[offset] === 0x50 &&
      tail[offset + 1] === 0x4b &&
      tail[offset + 2] === 0x05 &&
      tail[offset + 3] === 0x06
    ) {
      eocdOffset = offset;
      break;
    }
  }

  if (eocdOffset < 0) {
    return {
      ok: false,
      code: "malformed-input",
      message: "This DOCX is missing its ZIP directory and appears damaged or incomplete.",
    };
  }

  const diskNumber = readUint16(tailView, eocdOffset + 4);
  const directoryDisk = readUint16(tailView, eocdOffset + 6);
  const entriesOnDisk = readUint16(tailView, eocdOffset + 8);
  const totalEntries = readUint16(tailView, eocdOffset + 10);
  const directorySize = readUint32(tailView, eocdOffset + 12);
  const directoryOffset = readUint32(tailView, eocdOffset + 16);

  if (
    diskNumber !== 0 ||
    directoryDisk !== 0 ||
    entriesOnDisk !== totalEntries ||
    totalEntries === 0xffff ||
    directorySize === 0xffffffff ||
    directoryOffset === 0xffffffff
  ) {
    return {
      ok: false,
      code: "malformed-input",
      message: "This DOCX uses an unsupported or malformed ZIP package layout.",
    };
  }

  if (
    totalEntries < 1 ||
    totalEntries > MAX_DOCX_ENTRIES ||
    directoryOffset + directorySize > file.size
  ) {
    return {
      ok: false,
      code: "malformed-input",
      message: "This DOCX has an invalid or excessively large package directory.",
    };
  }

  const directoryBytes = new Uint8Array(
    await file.slice(directoryOffset, directoryOffset + directorySize).arrayBuffer(),
  );
  const view = new DataView(
    directoryBytes.buffer,
    directoryBytes.byteOffset,
    directoryBytes.byteLength,
  );
  const decoder = new TextDecoder("utf-8");
  const names = new Set<string>();
  let offset = 0;
  let uncompressedTotal = 0;

  for (let index = 0; index < totalEntries; index += 1) {
    if (
      offset + 46 > directoryBytes.byteLength ||
      readUint32(view, offset) !== 0x02014b50
    ) {
      return {
        ok: false,
        code: "malformed-input",
        message: "This DOCX contains a malformed ZIP directory entry.",
      };
    }

    const flags = readUint16(view, offset + 8);
    if ((flags & 0x0001) !== 0) {
      return {
        ok: false,
        code: "encrypted-input",
        message: "This DOCX is encrypted or password-protected. Unlock it before converting.",
      };
    }

    const uncompressedSize = readUint32(view, offset + 24);
    const nameLength = readUint16(view, offset + 28);
    const extraLength = readUint16(view, offset + 30);
    const commentLength = readUint16(view, offset + 32);
    const nextOffset =
      offset + 46 + nameLength + extraLength + commentLength;

    if (nextOffset > directoryBytes.byteLength || nameLength === 0) {
      return {
        ok: false,
        code: "malformed-input",
        message: "This DOCX contains a malformed ZIP directory entry.",
      };
    }

    const name = decoder.decode(
      directoryBytes.subarray(offset + 46, offset + 46 + nameLength),
    );
    if (unsafeZipEntryName(name)) {
      return {
        ok: false,
        code: "malformed-input",
        message: "This DOCX contains an unsafe package path.",
      };
    }

    if (/^(?:word\/)?vbaProject\.bin$/i.test(name)) {
      return {
        ok: false,
        code: "malformed-input",
        message: "Macro-enabled Word packages are not supported for local conversion.",
      };
    }

    names.add(name);
    uncompressedTotal += uncompressedSize;
    if (uncompressedTotal > MAX_DOCX_UNCOMPRESSED_BYTES) {
      return {
        ok: false,
        code: "malformed-input",
        message: "This DOCX expands beyond the safe local-processing limit.",
      };
    }

    offset = nextOffset;
  }

  for (const required of [
    "[Content_Types].xml",
    "_rels/.rels",
    "word/document.xml",
  ]) {
    if (!names.has(required)) {
      return {
        ok: false,
        code: "malformed-input",
        message: `This DOCX is missing required package part ${required}.`,
      };
    }
  }

  return { ok: true };
}

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

  if (isDocx && hasOleSignature) {
    return {
      ok: false,
      code: "encrypted-input",
      message:
        "This DOCX appears to be encrypted or password-protected. Unlock it before converting.",
    };
  }

  if ((isDocx && !hasZipSignature) || (isDoc && !hasOleSignature)) {
    return {
      ok: false,
      code: "malformed-input",
      message:
        "This Word file appears to be damaged, incomplete, or saved in a different format.",
    };
  }

  if (isDocx) {
    return inspectDocxPackage(file);
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
