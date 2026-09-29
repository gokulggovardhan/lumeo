import type { FontMetrics } from "./fontMetrics.ts";
import type { ShapedRun } from "./harfbuzzShaping.ts";
import {
  MAX_CID_TO_GID_MAP_BYTES,
  type CidToGidAddressingSource,
  type ShapedGlyphResourceBinding,
} from "./shapedGlyphAddressability.ts";
import {
  metricForVerticalCid,
  type PdfVerticalFontMetricsEvidence,
  type PdfVerticalGlyphMetric,
} from "./verticalFontMetrics.ts";

type VerticalShapedGlyphResourceBindingInput = Omit<
  ShapedGlyphResourceBinding,
  "cidToGidMapKind"
>;

export type VerticalShapedGlyphPdfAddress = Readonly<{
  glyphIndex: number;
  glyphId: number;
  clusterText: string;
  cid: number;
  pdfCode: number;
  verticalMetric: PdfVerticalGlyphMetric;
}>;

export type VerticalShapedGlyphEvidence =
  | Readonly<{
      kind: "resolved";
      advisoryOnly: true;
      direction: "ttb";
      embeddedProgramSha256: string;
      binding: ShapedGlyphResourceBinding;
      addresses: readonly VerticalShapedGlyphPdfAddress[];
    }>
  | Readonly<{
      kind: "blocked";
      advisoryOnly: true;
      reason: string;
    }>;

function blocked(reason: string): VerticalShapedGlyphEvidence {
  return Object.freeze({ kind: "blocked", advisoryOnly: true, reason });
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
      return "HarfBuzz returned an empty source cluster for a vertical shaped glyph.";
    }
    if (cluster.glyphIndices.length !== 1) {
      return "The first vertical shaped proof requires exactly one addressed PDF glyph per logical source cluster; multi-glyph vertical clusters remain read-only.";
    }

    const glyphIndex = cluster.glyphIndices[0];
    if (
      !Number.isInteger(glyphIndex) ||
      glyphIndex < 0 ||
      glyphIndex >= shaped.glyphs.length
    ) {
      return "HarfBuzz vertical cluster metadata references a glyph outside the shaped run.";
    }
    if (owners[glyphIndex] !== null) {
      return "A vertical HarfBuzz glyph is owned by more than one source cluster.";
    }
    owners[glyphIndex] = cluster.text;
  }

  if (owners.some((owner) => owner === null)) {
    return "HarfBuzz vertical cluster metadata does not account for every shaped glyph exactly once.";
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
 * Binds explicit top-to-bottom HarfBuzz glyph evidence to the exact existing
 * Identity-V CIDFontType2 resource and its independently resolved DW2/W2
 * metrics.
 *
 * This is deliberately evidence only. It does not calculate PDF TJ placement,
 * does not build an EditPlan, does not change VERTICAL_TEXT capability, and is
 * not accepted by any native writer.
 */
export function proveVerticalShapedGlyphEvidence({
  binding,
  fontKind,
  descendantSubtype,
  type0Encoding,
  writingMode,
  embeddedProgramSha256,
  cidToGidMap,
  glyphCodeToUnicode,
  horizontalMetrics,
  verticalMetrics,
  shaped,
}: {
  binding: VerticalShapedGlyphResourceBindingInput;
  fontKind: string;
  descendantSubtype: string | null;
  type0Encoding: string | null;
  writingMode: "horizontal" | "vertical" | "unknown";
  embeddedProgramSha256: string | null;
  cidToGidMap: CidToGidAddressingSource;
  glyphCodeToUnicode: ReadonlyMap<number, string>;
  horizontalMetrics: FontMetrics;
  verticalMetrics: PdfVerticalFontMetricsEvidence;
  shaped: Pick<
    ShapedRun,
    | "glyphs"
    | "clusterMap"
    | "requestedDirection"
    | "directionWasExplicit"
    | "unitsPerEm"
  >;
}): VerticalShapedGlyphEvidence {
  if (fontKind !== "Type0") {
    return blocked(
      "Vertical shaped-glyph evidence is currently limited to existing Type0 PDF font resources.",
    );
  }
  if (descendantSubtype !== "CIDFontType2") {
    return blocked(
      "The existing vertical Type0 resource is not a CIDFontType2 font, so HarfBuzz glyph IDs cannot be mapped to CIDs by this proof.",
    );
  }
  if (type0Encoding !== "Identity-V" || writingMode !== "vertical") {
    return blocked(
      "Vertical shaped-glyph evidence requires a proven Identity-V Type0 resource.",
    );
  }
  if (
    !shaped.directionWasExplicit ||
    shaped.requestedDirection !== "ttb"
  ) {
    return blocked(
      "The first vertical shaped-glyph proof requires explicit top-to-bottom HarfBuzz shaping.",
    );
  }
  if (!Number.isFinite(shaped.unitsPerEm) || shaped.unitsPerEm <= 0) {
    return blocked("HarfBuzz returned an invalid units-per-em value.");
  }
  if (!validSha256(embeddedProgramSha256)) {
    return blocked(
      "The exact embedded font-program fingerprint is unavailable, so vertical shaped glyphs cannot be bound to this PDF resource safely.",
    );
  }
  if (verticalMetrics.kind !== "resolved") {
    return blocked(verticalMetrics.reason);
  }
  if (shaped.glyphs.length === 0) {
    return blocked("HarfBuzz returned no vertical glyphs to address.");
  }

  const clusterOwners = clusterTextByGlyphIndex(shaped);
  if (typeof clusterOwners === "string") return blocked(clusterOwners);

  const decoded = decodeCidCandidates(cidToGidMap);
  if (typeof decoded === "string") return blocked(decoded);

  const addresses: VerticalShapedGlyphPdfAddress[] = [];
  for (let glyphIndex = 0; glyphIndex < shaped.glyphs.length; glyphIndex += 1) {
    const glyph = shaped.glyphs[glyphIndex];
    const glyphId = glyph.glyphId;
    const clusterText = clusterOwners[glyphIndex];

    if (!Number.isInteger(glyphId) || glyphId <= 0 || glyphId > 0xffff) {
      return blocked(
        `HarfBuzz vertical glyph ${glyphIndex} has glyph ID ${glyphId}, which is not a usable 16-bit CIDFontType2 glyph ID.`,
      );
    }
    if (
      !Number.isFinite(glyph.xAdvance) ||
      !Number.isFinite(glyph.yAdvance) ||
      !Number.isFinite(glyph.xOffset) ||
      !Number.isFinite(glyph.yOffset)
    ) {
      return blocked(
        `HarfBuzz vertical glyph ${glyphIndex} contains non-finite positioning evidence.`,
      );
    }

    const allCandidates = candidateCidsForGlyph(glyphId, cidToGidMap, decoded);
    const searchableCandidates = allCandidates.filter(
      (cid) => glyphCodeToUnicode.get(cid) === clusterText,
    );
    if (searchableCandidates.length === 0) {
      return blocked(
        `Vertical glyph ID ${glyphId} cannot be bound to exactly matching ToUnicode text for source cluster “${clusterText}”.`,
      );
    }
    if (searchableCandidates.length > 1) {
      return blocked(
        `Vertical glyph ID ${glyphId} maps to multiple PDF CIDs with the same ToUnicode text, so the shaped address would be ambiguous.`,
      );
    }

    const cid = searchableCandidates[0];
    const verticalMetric = metricForVerticalCid({
      cid,
      vertical: verticalMetrics,
      horizontal: horizontalMetrics,
    });
    if (!verticalMetric) {
      return blocked(
        `Complete DW2/W2 vertical metrics are unavailable for CID ${cid}.`,
      );
    }

    addresses.push(
      Object.freeze({
        glyphIndex,
        glyphId,
        clusterText,
        cid,
        pdfCode: cid,
        verticalMetric,
      }),
    );
  }

  return Object.freeze({
    kind: "resolved",
    advisoryOnly: true,
    direction: "ttb",
    embeddedProgramSha256: embeddedProgramSha256.toLowerCase(),
    binding: Object.freeze({
      ...binding,
      cidToGidMapKind:
        cidToGidMap.kind === "identity" ? "identity" : "stream",
    }),
    addresses: Object.freeze(addresses),
  });
}
