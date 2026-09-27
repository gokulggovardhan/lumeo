import type { ResolvedFont } from "./fontEncoding.ts";
import type { PdfFontResourceIdentity } from "./fontRegistry.ts";
import type { ShapedRun } from "./harfbuzzShaping.ts";

export type ShapedGlyphWriterEligibility =
  | Readonly<{
      kind: "eligible";
      advisoryOnly: true;
      glyphCodes: readonly number[];
      clusterUnicode: readonly string[];
      writingMode: "horizontal" | "vertical";
      reason: string;
    }>
  | Readonly<{
      kind: "blocked";
      advisoryOnly: true;
      reason: string;
    }>;

function blocked(reason: string): ShapedGlyphWriterEligibility {
  return { kind: "blocked", advisoryOnly: true, reason };
}

/**
 * Proves only whether HarfBuzz glyph IDs can be addressed through the CURRENT
 * PDF font resource without inventing a new resource or guessing a CID/GID
 * relationship. It is deliberately advisory: EditPlan/native-writer authority,
 * text state, geometry, advance reconciliation and post-export verification
 * remain independently mandatory.
 *
 * The first supported candidate is intentionally narrow:
 * - Type0, two-byte character codes;
 * - Identity-H / Identity-V CMap;
 * - explicit /CIDToGIDMap /Identity;
 * - exact embedded font fingerprint already resolved by PdfFontRegistry;
 * - every source cluster owns exactly one shaped glyph in this first slice;
 * - every shaped glyph ID is a legal two-byte CID;
 * - the existing ToUnicode map maps that exact CID to the owning HarfBuzz
 *   cluster text. This preserves reopen/search semantics, including ligatures,
 *   without duplicating logical text for one-to-many cluster expansion.
 *
 * A missing CIDToGIDMap is NOT treated as Identity. PDF producers and CIDFont
 * subtypes vary, so absence is insufficient proof for a native mutation.
 */
export function inspectShapedGlyphWriterEligibility({
  shaped,
  resolvedFont,
  resourceIdentity,
  embeddedProgramSha256,
}: {
  shaped: ShapedRun;
  resolvedFont: Pick<
    ResolvedFont,
    "kind" | "bytesPerCode" | "encodingSource" | "glyphCodeToUnicode"
  >;
  resourceIdentity: Pick<
    PdfFontResourceIdentity,
    "type0Encoding" | "writingMode" | "cidToGidMap"
  >;
  embeddedProgramSha256: string | null | undefined;
}): ShapedGlyphWriterEligibility {
  if (
    !embeddedProgramSha256 ||
    !/^[a-f0-9]{64}$/i.test(embeddedProgramSha256)
  ) {
    return blocked(
      "The exact embedded font fingerprint is unavailable, so shaped glyph IDs cannot be bound to this PDF font resource.",
    );
  }

  if (
    resolvedFont.kind !== "Type0" ||
    resolvedFont.bytesPerCode !== 2 ||
    resolvedFont.encodingSource !== "ToUnicode"
  ) {
    return blocked(
      "Shaped-glyph writing currently requires a Type0 font with a verified two-byte ToUnicode character-code model.",
    );
  }

  const encoding = resourceIdentity.type0Encoding;
  if (encoding !== "Identity-H" && encoding !== "Identity-V") {
    return blocked(
      "The PDF font does not use an Identity-H/Identity-V CMap, so HarfBuzz glyph IDs cannot be treated as writable CIDs.",
    );
  }

  if (
    resourceIdentity.cidToGidMap?.kind !== "name" ||
    resourceIdentity.cidToGidMap.name !== "Identity"
  ) {
    return blocked(
      "The PDF font does not explicitly prove an Identity CID-to-GID mapping; shaped glyph IDs therefore remain read-only.",
    );
  }

  const expectedMode = encoding === "Identity-V" ? "vertical" : "horizontal";
  if (resourceIdentity.writingMode !== expectedMode) {
    return blocked(
      "The PDF font writing mode disagrees with its Identity CMap, so shaped glyph order cannot be authorized.",
    );
  }

  if (
    !shaped.directionWasExplicit ||
    shaped.requestedDirection === "auto"
  ) {
    return blocked(
      "HarfBuzz direction must be explicit before shaped glyph order can become a native-writer candidate.",
    );
  }

  const verticalDirection =
    shaped.requestedDirection === "ttb" || shaped.requestedDirection === "btt";
  if ((expectedMode === "vertical") !== verticalDirection) {
    return blocked(
      "HarfBuzz direction does not match the PDF font writing mode.",
    );
  }

  if (shaped.glyphs.length === 0 && shaped.text.length > 0) {
    return blocked("HarfBuzz returned no glyphs for non-empty replacement text.");
  }

  const clusterByGlyph = new Map<number, string>();
  for (const cluster of shaped.clusterMap) {
    if (cluster.glyphIndices.length !== 1) {
      return blocked(
        "A source cluster expands to multiple shaped glyphs; this first writer proof cannot preserve exact ToUnicode extraction for that one-to-many mapping.",
      );
    }
    for (const glyphIndex of cluster.glyphIndices) {
      if (
        !Number.isInteger(glyphIndex) ||
        glyphIndex < 0 ||
        glyphIndex >= shaped.glyphs.length ||
        clusterByGlyph.has(glyphIndex)
      ) {
        return blocked(
          "HarfBuzz cluster ownership is incomplete, duplicated, or out of bounds.",
        );
      }
      clusterByGlyph.set(glyphIndex, cluster.text);
    }
  }

  if (clusterByGlyph.size !== shaped.glyphs.length) {
    return blocked(
      "Every shaped glyph must belong to exactly one verified HarfBuzz cluster.",
    );
  }

  const glyphCodes: number[] = [];
  const clusterUnicode: string[] = [];
  for (let index = 0; index < shaped.glyphs.length; index += 1) {
    const glyph = shaped.glyphs[index];
    const clusterText = clusterByGlyph.get(index);
    if (!clusterText) {
      return blocked("A shaped glyph has no verified source cluster.");
    }
    if (
      !Number.isInteger(glyph.glyphId) ||
      glyph.glyphId < 0 ||
      glyph.glyphId > 0xffff
    ) {
      return blocked(
        "A HarfBuzz glyph ID cannot be represented as the current two-byte Identity CID.",
      );
    }

    const searchableUnicode = resolvedFont.glyphCodeToUnicode.get(glyph.glyphId);
    if (searchableUnicode !== clusterText) {
      return blocked(
        "The existing ToUnicode map does not map the shaped glyph CID to its exact source cluster, so native output would not preserve verified searchability.",
      );
    }

    glyphCodes.push(glyph.glyphId);
    clusterUnicode.push(clusterText);
  }

  return {
    kind: "eligible",
    advisoryOnly: true,
    glyphCodes: Object.freeze(glyphCodes),
    clusterUnicode: Object.freeze(clusterUnicode),
    writingMode: expectedMode,
    reason:
      "The existing Type0 Identity font resource proves CID-to-GID identity and exact ToUnicode coverage for every shaped glyph. Writer/layout authority is still required.",
  };
}
