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
// Mirror libheif's default max_items ceiling before entering the vulnerable WASM build.
// Modern iPhone still photos are orders of magnitude below these structural budgets.
const MAX_HEIF_ITEMS = 1_000;
const MAX_IREF_ENTRIES = 1_000;
const MAX_IREF_TARGETS_PER_ENTRY = 1_000;
const MAX_TOTAL_IREF_TARGETS = 100_000;

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

type ReferenceEdge = { type: string; from: number; to: number };

function readItemId(view: DataView, offset: number, size: 2 | 4): number {
  return size === 2 ? view.getUint16(offset) : view.getUint32(offset);
}

function hasDecodeReferenceCycle(edges: ReferenceEdge[]): boolean {
  const adjacency = new Map<number, Set<number>>();
  const indegree = new Map<number, number>();
  for (const { from, to } of edges) {
    if (!adjacency.has(from)) adjacency.set(from, new Set());
    if (!adjacency.has(to)) adjacency.set(to, new Set());
    indegree.set(from, indegree.get(from) ?? 0);
    indegree.set(to, indegree.get(to) ?? 0);
    const targets = adjacency.get(from)!;
    if (!targets.has(to)) {
      targets.add(to);
      indegree.set(to, (indegree.get(to) ?? 0) + 1);
    }
  }
  const queue = [...indegree.entries()].filter(([, degree]) => degree === 0).map(([id]) => id);
  let visited = 0;
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const id = queue[cursor];
    visited += 1;
    for (const target of adjacency.get(id) ?? []) {
      const next = (indegree.get(target) ?? 0) - 1;
      indegree.set(target, next);
      if (next === 0) queue.push(target);
    }
  }
  return visited !== indegree.size;
}

function inspectStructuralSecurity(boxes: Box[], bytes: Uint8Array, view: DataView): string[] {
  const issues: string[] = [];
  const edges: ReferenceEdge[] = [];
  let totalReferenceTargets = 0;

  for (const box of boxes) {
    if (box.type === "iinf") {
      if (box.dataStart + 6 > box.end) {
        issues.push("The iinf item table is truncated.");
        continue;
      }
      const version = bytes[box.dataStart] ?? 0;
      const countOffset = box.dataStart + 4;
      const countSize = version === 0 ? 2 : 4;
      if (countOffset + countSize > box.end) {
        issues.push("The iinf item count is truncated.");
        continue;
      }
      const declaredItems = countSize === 2 ? view.getUint16(countOffset) : view.getUint32(countOffset);
      if (declaredItems > MAX_HEIF_ITEMS) issues.push(`The HEIF item table declares ${declaredItems} items, exceeding the ${MAX_HEIF_ITEMS}-item safety limit.`);
    }

    if (box.type !== "iref") continue;
    const version = bytes[box.dataStart] ?? 0;
    if (version > 1) {
      issues.push(`Unsupported iref version ${version}.`);
      continue;
    }
    if (box.children.length > MAX_IREF_ENTRIES) {
      issues.push(`The HEIF reference table contains more than ${MAX_IREF_ENTRIES} entries.`);
      continue;
    }

    const idSize: 2 | 4 = version === 0 ? 2 : 4;
    for (const child of box.children) {
      let cursor = child.dataStart;
      if (cursor + idSize + 2 > child.end) {
        issues.push(`The ${child.type || "iref"} reference entry is truncated.`);
        continue;
      }
      const from = readItemId(view, cursor, idSize);
      cursor += idSize;
      const targetCount = view.getUint16(cursor);
      cursor += 2;
      if (targetCount === 0) {
        issues.push(`The ${child.type || "iref"} reference entry contains no targets.`);
        continue;
      }
      if (targetCount > MAX_IREF_TARGETS_PER_ENTRY) {
        issues.push(`The ${child.type || "iref"} reference entry declares ${targetCount} targets, exceeding the ${MAX_IREF_TARGETS_PER_ENTRY}-target safety limit.`);
        continue;
      }
      totalReferenceTargets += targetCount;
      if (totalReferenceTargets > MAX_TOTAL_IREF_TARGETS) {
        issues.push(`The HEIF reference graph exceeds the ${MAX_TOTAL_IREF_TARGETS}-edge safety budget.`);
        break;
      }
      const required = cursor + targetCount * idSize;
      if (required > child.end) {
        issues.push(`The ${child.type || "iref"} reference entry is shorter than its declared target count.`);
        continue;
      }
      if (child.type === "dimg" || child.type === "auxl") {
        for (let index = 0; index < targetCount; index += 1) {
          edges.push({ type: child.type, from, to: readItemId(view, cursor + index * idSize, idSize) });
        }
      }
    }
  }

  if (hasDecodeReferenceCycle(edges)) issues.push("The HEIF decode-reference graph contains a dimg/auxl cycle.");
  return [...new Set(issues)];
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

function parseIpmaPropertyIndexes(box: Box, bytes: Uint8Array, view: DataView, targetItemId: number): number[] | null {
  if (box.dataStart + 8 > box.end) return null;
  const version = bytes[box.dataStart] ?? 0;
  const flags = ((bytes[box.dataStart + 1] ?? 0) << 16) | ((bytes[box.dataStart + 2] ?? 0) << 8) | (bytes[box.dataStart + 3] ?? 0);
  const wideAssociation = Boolean(flags & 1);
  let cursor = box.dataStart + 4;
  const entryCount = view.getUint32(cursor);
  cursor += 4;
  for (let entry = 0; entry < entryCount; entry += 1) {
    const idSize = version < 1 ? 2 : 4;
    if (cursor + idSize + 1 > box.end) return null;
    const itemId = idSize === 2 ? view.getUint16(cursor) : view.getUint32(cursor);
    cursor += idSize;
    const associationCount = bytes[cursor++] ?? 0;
    const indexes: number[] = [];
    for (let association = 0; association < associationCount; association += 1) {
      const associationSize = wideAssociation ? 2 : 1;
      if (cursor + associationSize > box.end) return null;
      const value = associationSize === 2 ? view.getUint16(cursor) : (bytes[cursor] ?? 0);
      cursor += associationSize;
      const index = value & (wideAssociation ? 0x7fff : 0x7f);
      if (index > 0) indexes.push(index);
    }
    if (itemId === targetItemId) return indexes;
  }
  return null;
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
    const securityIssues = inspectStructuralSecurity(boxes, bytes, view);
    if (securityIssues.length > 0) {
      return { ...empty, brands, inspectionStatus: "failed", evidence: securityIssues };
    }
    const itemInfo = boxes.flatMap((box) => (box.type === "infe" ? [parseInfe(box, bytes, view)].filter((item): item is NonNullable<typeof item> => item !== null) : []));
    const pitm = boxes.find((box) => box.type === "pitm");
    let primaryItemId: number | null = null;
    if (pitm && pitm.dataStart + 4 < pitm.end) {
      const version = bytes[pitm.dataStart] ?? 0;
      const idSize = version === 0 ? 2 : 4;
      if (pitm.dataStart + 4 + idSize <= pitm.end) primaryItemId = idSize === 2 ? view.getUint16(pitm.dataStart + 4) : view.getUint32(pitm.dataStart + 4);
    }

    const propertyContainer = boxes.find((box) => box.type === "ipco");
    const primaryPropertyIndexes = primaryItemId === null ? null : boxes
      .filter((box) => box.type === "ipma")
      .map((box) => parseIpmaPropertyIndexes(box, bytes, view, primaryItemId!))
      .find((indexes) => indexes !== null) ?? null;
    const primaryProperties = propertyContainer && primaryPropertyIndexes
      ? primaryPropertyIndexes.flatMap((index) => propertyContainer.children[index - 1] ? [propertyContainer.children[index - 1]] : [])
      : null;
    const imageProperties = primaryProperties ?? boxes;

    const dimensions = imageProperties.flatMap((box) => {
      if (box.type !== "ispe" || box.dataStart + 12 > box.end) return [];
      return [{ width: view.getUint32(box.dataStart + 4), height: view.getUint32(box.dataStart + 8) }];
    });
    const auxiliaryImages = boxes.flatMap((box) => {
      if (box.type !== "auxC" || box.dataStart + 5 > box.end) return [];
      const auxiliaryType = nullTerminated(bytes, box.dataStart + 4, box.end);
      return [{ auxiliaryType, evidence: `auxC property declares ${auxiliaryType || "an unnamed auxiliary image type"}.` }];
    });
    const references = [...new Set(boxes.filter((box) => ["auxl", "dimg", "thmb", "cdsc"].includes(box.type)).map((box) => box.type))];
    const colorProfiles = imageProperties.flatMap((box): Array<Record<string, string | number | boolean>> => {
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
    for (const box of imageProperties) {
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
        primaryProperties ? `${primaryProperties.length} properties associated with the primary image.` : "Primary property associations were unavailable; structural properties are reported conservatively.",
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
