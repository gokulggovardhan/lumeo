import type { ShapedRun } from "./harfbuzzShaping.ts";

export const MAX_CID_TO_GID_MAP_BYTES = 0x20000;

export type CidToGidAddressingSource =
  | Readonly<{ kind: "identity" }>
  | Readonly<{ kind: "stream"; bytes: Uint8Array }>
  | Readonly<{ kind: "blocked"; reason: string }>;

export type ShapedGlyphResourceBinding = Readonly<{
  resourceName: string;
  fontObjectRef: string | null;
  descendantObjectRef: string | null;
  fontProgramObjectRef: string | null;
  toUnicodeObjectRef: string | null;
  encodingObjectRef: string | null;
  cidToGidMapObjectRef: string | null;
  cidToGidMapKind: "identity" | "stream";
}>;

export type ShapedGlyphPdfAddress = Readonly<{
  glyphIndex: number;
  glyphId: number;
  clusterText: string;
  cid: number;
  pdfCode: number;
  width1000: number;
}>;

export type ShapedGlyphAddressabilityResult =
  | Readonly<{
      kind: "addressable";
      advisoryOnly: true;
      embeddedProgramSha256: string;
      binding: ShapedGlyphResourceBinding;
      addresses: readonly ShapedGlyphPdfAddress[];
    }>
  | Readonly<{
      kind: "blocked";
      reason: string;
    }>;

function blocked(reason: string): ShapedGlyphAddressabilityResult {
  return { kind: "blocked", reason };
}

function validSha256(value: string | null | undefined): value is string {
  return Boolean(value && /^[a-f0-9]{64}$/i.test(value));
}

function clusterTextByGlyphIndex(
  shaped: Pick<ShapedRun, "glyphs" | "clusterMap">,
): readonly string[] | string {
  const owners: (string | null)[] = Array.from(
    { length: shaped.glyphs.length },
    () => null,
  );

  for (const cluster of shaped.clusterMap) {
    if (!cluster.text) {
      return "HarfBuzz returned an empty source cluster for a shaped glyph.";
    }
    if (cluster.glyphIndices.length !== 1) {
      return "This first shaped-glyph proof requires exactly one addressed PDF glyph per logical source cluster; multi-glyph clusters remain read-only.";
    }
    for (const glyphIndex of cluster.glyphIndices) {
      if (
        !Number.isInteger(glyphIndex) ||
        glyphIndex < 0 ||
        glyphIndex >= shaped.glyphs.length
      ) {
        return "HarfBuzz cluster metadata references a shaped glyph outside the run.";
      }
      if (owners[glyphIndex] !== null) {
        return "A HarfBuzz shaped glyph is owned by more than one source cluster.";
      }
      owners[glyphIndex] = cluster.text;
    }
  }

  if (owners.some((owner) => owner === null)) {
    return "HarfBuzz cluster metadata does not account for every shaped glyph exactly once.";
  }

  return owners as readonly string[];
}

function decodeCidCandidates(
  source: CidToGidAddressingSource,
): ReadonlyMap<number, readonly number[]> | string {
  if (source.kind === "blocked") return source.reason;
  if (source.kind === "identity") return new Map();

  const bytes = source.bytes;
  if (bytes.byteLength === 0) {
    return "The PDF CIDToGIDMap stream is empty.";
  }
  if (bytes.byteLength > MAX_CID_TO_GID_MAP_BYTES) {
    return "The PDF CIDToGIDMap stream exceeds the bounded 65,536-CID safety limit.";
  }
  if (bytes.byteLength % 2 !== 0) {
    return "The PDF CIDToGIDMap stream has an odd byte length and cannot be decoded safely.";
  }

  const byGlyph = new Map<number, number[]>();
  for (let cid = 0; cid < bytes.byteLength / 2; cid += 1) {
    const offset = cid * 2;
    const glyphId = (bytes[offset] << 8) | bytes[offset + 1];
    if (glyphId === 0) continue;
    const candidates = byGlyph.get(glyphId);
    if (candidates) candidates.push(cid);
    else byGlyph.set(glyphId, [cid]);
  }
  return byGlyph;
}

function candidateCidsForGlyph(
  glyphId: number,
  source: CidToGidAddressingSource,
  decoded: ReadonlyMap<number, readonly number[]>,
): readonly number[] {
  return source.kind === "identity" ? [glyphId] : decoded.get(glyphId) ?? [];
}

/**
 * Proves only that HarfBuzz glyph IDs can be addressed through the exact
 * existing PDF Type0/CIDFontType2 resource without guessing.
 *
 * This result is deliberately advisory. It is NOT an EditPlan, is never
 * accepted by the native writer, and cannot authorize a PDF mutation.
 * A future shaped-glyph planner must still bind text/page/operator identity,
 * validate advances/positions, and pass the existing post-export gates.
 */
export function proveShapedGlyphAddressability({
  binding,
  fontKind,
  descendantSubtype,
  type0Encoding,
  writingMode,
  embeddedProgramSha256,
  cidToGidMap,
  glyphCodeToUnicode,
  glyphWidths,
  defaultWidth,
  shaped,
}: {
  binding: ShapedGlyphResourceBinding;
  fontKind: string;
  descendantSubtype: string | null;
  type0Encoding: string | null;
  writingMode: "horizontal" | "vertical" | "unknown";
  embeddedProgramSha256: string | null;
  cidToGidMap: CidToGidAddressingSource;
  glyphCodeToUnicode: ReadonlyMap<number, string>;
  glyphWidths: ReadonlyMap<number, number>;
  defaultWidth: number;
  shaped: Pick<ShapedRun, "glyphs" | "clusterMap">;
}): ShapedGlyphAddressabilityResult {
  if (fontKind !== "Type0") {
    return blocked(
      "Shaped-glyph addressability is currently proven only for existing Type0 PDF font resources.",
    );
  }
  if (descendantSubtype !== "CIDFontType2") {
    return blocked(
      "The existing Type0 resource is not a CIDFontType2 font, so HarfBuzz glyph IDs cannot be mapped to PDF CIDs by this proof.",
    );
  }
  if (type0Encoding !== "Identity-H" || writingMode !== "horizontal") {
    return blocked(
      "The first shaped-glyph addressability proof is limited to horizontal Identity-H Type0 fonts; vertical or custom CMaps remain read-only.",
    );
  }
  if (!validSha256(embeddedProgramSha256)) {
    return blocked(
      "The exact embedded font-program fingerprint is unavailable, so shaped glyphs cannot be bound to this PDF resource safely.",
    );
  }
  if (shaped.glyphs.length === 0) {
    return blocked("HarfBuzz returned no glyphs to address.");
  }

  const clusterOwners = clusterTextByGlyphIndex(shaped);
  if (typeof clusterOwners === "string") return blocked(clusterOwners);

  const decoded = decodeCidCandidates(cidToGidMap);
  if (typeof decoded === "string") return blocked(decoded);

  const addresses: ShapedGlyphPdfAddress[] = [];
  for (let glyphIndex = 0; glyphIndex < shaped.glyphs.length; glyphIndex += 1) {
    const glyph = shaped.glyphs[glyphIndex];
    const glyphId = glyph.glyphId;
    const clusterText = clusterOwners[glyphIndex];

    if (!Number.isInteger(glyphId) || glyphId <= 0 || glyphId > 0xffff) {
      return blocked(
        `HarfBuzz glyph ${glyphIndex} has glyph ID ${glyphId}, which is not a usable 16-bit CIDFontType2 glyph ID.`,
      );
    }

    const allCandidates = candidateCidsForGlyph(glyphId, cidToGidMap, decoded);
    const searchableCandidates = allCandidates.filter(
      (cid) => glyphCodeToUnicode.get(cid) === clusterText,
    );

    if (searchableCandidates.length === 0) {
      return blocked(
        `Glyph ID ${glyphId} cannot be bound to exactly matching ToUnicode text for source cluster “${clusterText}”.`,
      );
    }
    if (searchableCandidates.length > 1) {
      return blocked(
        `Glyph ID ${glyphId} maps to multiple PDF CIDs with the same ToUnicode text, so the shaped write would be ambiguous.`,
      );
    }

    const cid = searchableCandidates[0];
    const width1000 = glyphWidths.get(cid) ?? defaultWidth;
    if (!Number.isFinite(width1000) || width1000 <= 0) {
      return blocked(
        `PDF width metrics are unavailable for shaped glyph ID ${glyphId} at CID ${cid}.`,
      );
    }

    addresses.push(
      Object.freeze({
        glyphIndex,
        glyphId,
        clusterText,
        cid,
        pdfCode: cid,
        width1000,
      }),
    );
  }

  return Object.freeze({
    kind: "addressable",
    advisoryOnly: true,
    embeddedProgramSha256: embeddedProgramSha256.toLowerCase(),
    binding: Object.freeze({
      ...binding,
      cidToGidMapKind:
        cidToGidMap.kind === "identity" ? "identity" : "stream",
    }),
    addresses: Object.freeze(addresses),
  });
}
