import type { HeifEvidence, InspectionStatus } from "./types.ts";

type Box = {
  type: string;
  start: number;
  dataStart: number;
  end: number;
  children: Box[];
};

const CONTAINER_BOXES = new Set(["meta", "iinf", "iref", "iprp", "ipco", "moov", "trak", "mdia", "minf", "stbl", "udta"]);
const IMAGE_ITEM_TYPES = new Set(["hvc1", "av01", "jpeg", "grid"]);
const MAX_BOXES = 20_000;
const MAX_DEPTH = 12;

function readType(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(bytes[offset] ?? 0, bytes[offset + 1] ?? 0, bytes[offset + 2] ?? 0, bytes[offset + 3] ?? 0);
}

function uint64(view: DataView, offset: number): number | null {
  const high = view.getUint32(offset);
  const low = view.getUint32(offset + 4);
  const value = high * 2 ** 32 + low;
  return Number.isSafeInteger(value) ? value : null;
}

function childDataStart(box: Box, bytes: Uint8Array): number {
  if (box.type === "meta" || box.type === "iref") return box.dataStart + 4;
  if (box.type === "iinf") {
    const version = bytes[box.dataStart] ?? 0;
    return box.dataStart + 4 + (version === 0 ? 2 : 4);
  }
  return box.dataStart;
}

function parseBoxes(bytes: Uint8Array): { boxes: Box[]; complete: boolean; warnings: string[] } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const warnings: string[] = [];
  let count = 0;
  let complete = true;

  function parseRange(start: number, end: number, depth: number): Box[] {
    if (depth > MAX_DEPTH) {
      complete = false;
      warnings.push(`Container nesting exceeded ${MAX_DEPTH} levels.`);
      return [];
    }
    const boxes: Box[] = [];
    let offset = start;
    while (offset + 8 <= end && count < MAX_BOXES) {
      const size32 = view.getUint32(offset);
      const type = readType(bytes, offset + 4);
      let headerSize = 8;
      let size = size32;
      if (size32 === 1) {
        if (offset + 16 > end) {
          complete = false;
          break;
        }
        const largeSize = uint64(view, offset + 8);
        if (largeSize === null) {
          complete = false;
          warnings.push(`Box ${type} uses an unsupported unsafe 64-bit size.`);
          break;
        }
        size = largeSize;
        headerSize = 16;
      } else if (size32 === 0) {
        size = end - offset;
      }
      if (size < headerSize || offset + size > end) {
        complete = false;
        warnings.push(`Box ${type || "(invalid)"} has an invalid or truncated size.`);
        break;
      }
      const box: Box = { type, start: offset, dataStart: offset + headerSize, end: offset + size, children: [] };
      count += 1;
      if (CONTAINER_BOXES.has(type)) {
        const nestedStart = childDataStart(box, bytes);
        if (nestedStart <= box.end) box.children = parseRange(nestedStart, box.end, depth + 1);
      }
      boxes.push(box);
      offset += size;
    }
    if (count >= MAX_BOXES) {
      complete = false;
      warnings.push(`Container exceeded the ${MAX_BOXES}-box safety limit.`);
    }
    return boxes;
  }

  return { boxes: parseRange(0, bytes.byteLength, 0), complete, warnings };
}

function flatten(boxes: Box[]): Box[] {
  return boxes.flatMap((box) => [box, ...flatten(box.children)]);
}

function nullTerminated(bytes: Uint8Array, start: number, end: number): string {
  let cursor = start;
  while (cursor < end && bytes[cursor] !== 0) cursor += 1;
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(start, cursor));
}

function parseInfe(box: Box, bytes: Uint8Array, view: DataView): { id: number; type: string; name: string } | null {
  const version = bytes[box.dataStart] ?? 0;
  if (version < 2 || box.dataStart + 12 > box.end) return null;
  const idOffset = box.dataStart + 4;
  const id = version === 2 ? view.getUint16(idOffset) : view.getUint32(idOffset);
  const typeOffset = idOffset + (version === 2 ? 4 : 6);
  if (typeOffset + 4 > box.end) return null;
  return { id, type: readType(bytes, typeOffset), name: nullTerminated(bytes, typeOffset + 4, box.end) };
}

function parseFtyp(box: Box, bytes: Uint8Array): string[] {
  const brands: string[] = [];
  if (box.dataStart + 8 > box.end) return brands;
  brands.push(readType(bytes, box.dataStart));
  for (let offset = box.dataStart + 8; offset + 4 <= box.end; offset += 4) brands.push(readType(bytes, offset));
  return [...new Set(brands.filter((brand) => /^[\x20-\x7e]{4}$/.test(brand)))];
}

export function findAsciiEvidence(bytes: Uint8Array, needles: readonly string[]): string[] {
  const evidence: string[] = [];
  for (const needle of needles) {
    const encoded = new TextEncoder().encode(needle.toLocaleLowerCase("en-US"));
    outer: for (let offset = 0; offset <= bytes.length - encoded.length; offset += 1) {
      for (let index = 0; index < encoded.length; index += 1) {
        const byte = bytes[offset + index];
        const lower = byte >= 65 && byte <= 90 ? byte + 32 : byte;
        if (lower !== encoded[index]) continue outer;
      }
      evidence.push(needle);
      break;
    }
  }
  return evidence;
}

export function inspectContainerIdentifiers(bytes: Uint8Array): { keys: string[]; identifiers: string[] } {
  const keys = findAsciiEvidence(bytes, [
    "com.apple.quicktime.content.identifier",
    "com.apple.quicktime.live-photo.auto",
    "com.apple.quicktime.still-image-time",
    "assetIdentifier",
    "contentIdentifier",
  ]);
  const identifiers = new Set<string>();
  const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi;
  const chunkSize = 1024 * 1024;
  for (let offset = 0; offset < bytes.length; offset += chunkSize - 64) {
    const chunk = new TextDecoder("latin1").decode(bytes.subarray(offset, Math.min(bytes.length, offset + chunkSize)));
    for (const match of chunk.matchAll(uuidPattern)) identifiers.add(match[0].toLocaleLowerCase("en-US"));
  }
  return { keys, identifiers: [...identifiers] };
}

export function inspectHeifStructure(bytes: Uint8Array): HeifEvidence {
  const empty: HeifEvidence = {
    inspectionStatus: "unsupported",
    brands: [],
    primaryItemId: null,
    imageCount: null,
    dimensions: [],
    itemTypes: [],
    auxiliaryImages: [],
    references: [],
    exifBlockPresent: null,
    colorProfiles: [],
    orientation: [],
    evidence: [],
  };
  if (bytes.byteLength < 12) return { ...empty, inspectionStatus: "failed", evidence: ["File is too short to contain an ISO-BMFF header."] };

  try {
    const parsed = parseBoxes(bytes);
    const boxes = flatten(parsed.boxes);
    const ftyp = boxes.find((box) => box.type === "ftyp");
    if (!ftyp) return { ...empty, inspectionStatus: "unsupported", evidence: ["No ISO-BMFF ftyp box was found."] };
    const brands = parseFtyp(ftyp, bytes);
    const heifBrand = brands.some((brand) => ["heic", "heix", "hevc", "hevx", "mif1", "msf1", "avif"].includes(brand));
    if (!heifBrand) return { ...empty, brands, inspectionStatus: "unsupported", evidence: ["ISO-BMFF container found, but no recognized HEIF/HEIC brand was observed."] };

    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const itemInfo = boxes.flatMap((box) => (box.type === "infe" ? [parseInfe(box, bytes, view)].filter((item): item is NonNullable<typeof item> => item !== null) : []));
    const pitm = boxes.find((box) => box.type === "pitm");
    let primaryItemId: number | null = null;
    if (pitm && pitm.dataStart + 6 <= pitm.end) {
      const version = bytes[pitm.dataStart] ?? 0;
      primaryItemId = version === 0 ? view.getUint16(pitm.dataStart + 4) : view.getUint32(pitm.dataStart + 4);
    }

    const dimensions = boxes.flatMap((box) => {
      if (box.type !== "ispe" || box.dataStart + 12 > box.end) return [];
      return [{ width: view.getUint32(box.dataStart + 4), height: view.getUint32(box.dataStart + 8) }];
    });
    const auxiliaryImages = boxes.flatMap((box) => {
      if (box.type !== "auxC" || box.dataStart + 5 > box.end) return [];
      const auxiliaryType = nullTerminated(bytes, box.dataStart + 4, box.end);
      return [{ auxiliaryType, evidence: `auxC property declares ${auxiliaryType || "an unnamed auxiliary image type"}.` }];
    });
    const references = [...new Set(boxes.filter((box) => ["auxl", "dimg", "thmb", "cdsc"].includes(box.type)).map((box) => box.type))];
    const colorProfiles = boxes.flatMap((box): Array<Record<string, string | number | boolean>> => {
      if (box.type !== "colr" || box.dataStart + 4 > box.end) return [];
      const colorType = readType(bytes, box.dataStart);
      if (colorType === "nclx" && box.dataStart + 11 <= box.end) {
        return [{
          type: colorType,
          colorPrimaries: view.getUint16(box.dataStart + 4),
          transferCharacteristics: view.getUint16(box.dataStart + 6),
          matrixCoefficients: view.getUint16(box.dataStart + 8),
          fullRange: Boolean(bytes[box.dataStart + 10] & 0x80),
        }];
      }
      return [{ type: colorType }];
    });
    const orientation: Array<{ rotationDegrees?: number; mirrorAxis?: "horizontal" | "vertical" }> = [];
    for (const box of boxes) {
      if (box.type === "irot" && box.dataStart < box.end) orientation.push({ rotationDegrees: (bytes[box.dataStart] & 0x03) * 90 });
      if (box.type === "imir" && box.dataStart < box.end) orientation.push({ mirrorAxis: (bytes[box.dataStart] & 0x01) === 0 ? "vertical" : "horizontal" });
    }
    const directHdrIdentifiers = findAsciiEvidence(bytes, ["hdrgm", "hdrgainmap", "aux:hdrgainmap", "aux:gainmap"]);
    const itemTypes = [...new Set(itemInfo.map((item) => item.type))];
    const imageCount = itemInfo.filter((item) => IMAGE_ITEM_TYPES.has(item.type)).length;
    const exifBlockPresent = itemTypes.includes("Exif");
    return {
      inspectionStatus: parsed.complete ? "complete" : "partial",
      brands,
      primaryItemId,
      imageCount,
      dimensions,
      itemTypes,
      auxiliaryImages,
      references,
      exifBlockPresent,
      colorProfiles,
      orientation,
      evidence: [
        `Observed HEIF brands: ${brands.join(", ")}.`,
        `${itemInfo.length} item-info entries parsed.`,
        ...directHdrIdentifiers.map((identifier) => `Observed HDR identifier: ${identifier}.`),
        ...parsed.warnings,
      ],
    };
  } catch (error) {
    return {
      ...empty,
      inspectionStatus: "failed" as InspectionStatus,
      evidence: [`HEIF structure parsing failed safely: ${error instanceof Error ? error.name : "UnknownError"}.`],
    };
  }
}
