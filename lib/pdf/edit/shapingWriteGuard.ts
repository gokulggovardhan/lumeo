import type { ResolvedFont } from "./fontEncoding.ts";
import type { FontMetrics } from "./fontMetrics.ts";
import type { PdfFontResourceIdentity } from "./fontRegistry.ts";
import type { ShapedRun } from "./harfbuzzShaping.ts";
import type { ShapingReconciliation } from "./shapingReconciliation.ts";

export type ComplexShapingKind =
  | "rtl-script"
  | "joining-script"
  | "indic-script"
  | "southeast-asian-script"
  | "combining-mark"
  | "join-control"
  | "bidi-control"
  | "variation-selector";

export type ComplexShapingRequirement =
  | Readonly<{
      required: false;
      kind: null;
      reason: null;
    }>
  | Readonly<{
      required: true;
      kind: ComplexShapingKind;
      reason: string;
    }>;

function inRange(codePoint: number, start: number, end: number): boolean {
  return codePoint >= start && codePoint <= end;
}

function isCombiningMark(codePoint: number): boolean {
  return (
    inRange(codePoint, 0x0300, 0x036f) ||
    inRange(codePoint, 0x1ab0, 0x1aff) ||
    inRange(codePoint, 0x1dc0, 0x1dff) ||
    inRange(codePoint, 0x20d0, 0x20ff) ||
    inRange(codePoint, 0xfe20, 0xfe2f)
  );
}

function isRtlScript(codePoint: number): boolean {
  return (
    inRange(codePoint, 0x0590, 0x05ff) || // Hebrew
    inRange(codePoint, 0x0600, 0x06ff) || // Arabic
    inRange(codePoint, 0x0700, 0x074f) || // Syriac
    inRange(codePoint, 0x0750, 0x077f) || // Arabic Supplement
    inRange(codePoint, 0x0780, 0x07bf) || // Thaana
    inRange(codePoint, 0x07c0, 0x07ff) || // NKo
    inRange(codePoint, 0x0800, 0x083f) || // Samaritan
    inRange(codePoint, 0x0840, 0x085f) || // Mandaic
    inRange(codePoint, 0x08a0, 0x08ff) || // Arabic Extended-A
    inRange(codePoint, 0xfb1d, 0xfdff) ||
    inRange(codePoint, 0xfe70, 0xfeff)
  );
}

function isIndicScript(codePoint: number): boolean {
  return (
    inRange(codePoint, 0x0900, 0x0dff) ||
    inRange(codePoint, 0xa800, 0xabff) ||
    inRange(codePoint, 0x11000, 0x11fff)
  );
}

function isSoutheastAsianScript(codePoint: number): boolean {
  return (
    inRange(codePoint, 0x0e00, 0x0fff) || // Thai, Lao, Tibetan
    inRange(codePoint, 0x1000, 0x109f) || // Myanmar
    inRange(codePoint, 0x1780, 0x17ff) || // Khmer
    inRange(codePoint, 0x1a00, 0x1aaf) ||
    inRange(codePoint, 0xaa60, 0xaaff)
  );
}

export function detectComplexShapingRequirement(
  text: string,
): ComplexShapingRequirement {
  for (const char of text) {
    const codePoint = char.codePointAt(0);
    if (codePoint === undefined) continue;

    if (codePoint === 0x200c || codePoint === 0x200d) {
      return {
        required: true,
        kind: "join-control",
        reason:
          "This replacement contains a join control, so its glyph selection must be shaped before native PDF export.",
      };
    }

    if (
      inRange(codePoint, 0x202a, 0x202e) ||
      inRange(codePoint, 0x2066, 0x2069)
    ) {
      return {
        required: true,
        kind: "bidi-control",
        reason:
          "This replacement contains bidirectional controls, so visual glyph order must be proven before native PDF export.",
      };
    }

    if (
      inRange(codePoint, 0xfe00, 0xfe0f) ||
      inRange(codePoint, 0xe0100, 0xe01ef)
    ) {
      return {
        required: true,
        kind: "variation-selector",
        reason:
          "This replacement uses a variation selector, so the exact font glyph must be resolved by the shaping engine first.",
      };
    }

    if (isCombiningMark(codePoint)) {
      return {
        required: true,
        kind: "combining-mark",
        reason:
          "This replacement contains combining marks whose shaped offsets must be proven before native PDF export.",
      };
    }

    if (isRtlScript(codePoint)) {
      return {
        required: true,
        kind:
          inRange(codePoint, 0x0600, 0x08ff) ||
          inRange(codePoint, 0xfb50, 0xfeff)
            ? "joining-script"
            : "rtl-script",
        reason:
          "This replacement uses a right-to-left or joining script whose glyph order/forms require canonical shaping.",
      };
    }

    if (isIndicScript(codePoint)) {
      return {
        required: true,
        kind: "indic-script",
        reason:
          "This replacement uses a script with conjunct or reordering rules, so its shaped glyph sequence must be proven first.",
      };
    }

    if (isSoutheastAsianScript(codePoint)) {
      return {
        required: true,
        kind: "southeast-asian-script",
        reason:
          "This replacement uses a script whose marks/clusters require canonical shaping before native PDF export.",
      };
    }
  }

  return { required: false, kind: null, reason: null };
}

class ValidatedShapingWriteEvidenceProof {
  private readonly validationProof!: true;

  constructor() {
    Object.defineProperty(this, "validationProof", {
      value: true,
      enumerable: false,
      writable: false,
      configurable: false,
    });
  }

  isPlannerIssued(): boolean {
    return this.validationProof === true;
  }
}

export type ShapedGlyphWriteInstruction = Readonly<{
  /**
   * Exact PDF resource identity this shaped-glyph proof was issued for.
   * The EditPlan builder rechecks this key before it may carry glyph-level
   * output into the native writer.
   */
  resourceIdentityKey: string;
  fontResourceName: string;
  /** CID codes to emit. This first writer slice requires CID == GID. */
  glyphCodes: readonly number[];
  /**
   * One horizontal TJ adjustment after each emitted glyph, in PDF 1000-em
   * text units. These are shaping adjustments only; EditPlan adds the final
   * endpoint-preservation adjustment separately.
   */
  glyphTjAdjustments: readonly number[];
  /** HarfBuzz primary advance normalized into PDF's 1000-em text space. */
  naturalAdvanceUnits1000: number;
}>;

export type ValidatedShapingWriteEvidence =
  Readonly<{
    replacementText: string;
    embeddedProgramSha256: string;
    engineVersion: string;
    advanceAgreement: ShapingReconciliation["advanceAgreement"];
    writerMode: "character-codes" | "shaped-glyphs";
    shapedGlyphWrite: ShapedGlyphWriteInstruction | null;
  }> &
  ValidatedShapingWriteEvidenceProof;

export type ShapingWriteEvidenceResult =
  | Readonly<{
      kind: "validated";
      evidence: ValidatedShapingWriteEvidence;
    }>
  | Readonly<{
      kind: "blocked";
      reason: string;
    }>;

function validSha256(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value);
}

/**
 * Converts advisory HarfBuzz reconciliation into a narrow proof that the
 * EXISTING character-code writer is equivalent for this exact replacement.
 *
 * This function does not authorize a PDF write by itself. buildEditPlan still
 * requires the PDF encoding/ToUnicode map, glyph authority, PDF widths, text
 * state and every existing native-writer guard. The proof only closes the
 * additional shaping gap for replacements that need canonical shaping.
 */
export function validateShapingEvidenceForCharacterCodeWriter({
  replacementText,
  embeddedProgramSha256,
  shaped,
  reconciliation,
}: {
  replacementText: string;
  embeddedProgramSha256: string | null | undefined;
  shaped: ShapedRun;
  reconciliation: ShapingReconciliation;
}): ShapingWriteEvidenceResult {
  if (!embeddedProgramSha256 || !validSha256(embeddedProgramSha256)) {
    return {
      kind: "blocked",
      reason:
        "The exact embedded font fingerprint is unavailable, so shaping evidence cannot be bound to this PDF font safely.",
    };
  }

  if (shaped.text !== replacementText) {
    return {
      kind: "blocked",
      reason:
        "The shaping evidence belongs to different replacement text, so it cannot authorize this edit.",
    };
  }

  if (
    !shaped.directionWasExplicit ||
    shaped.requestedDirection === "auto"
  ) {
    return {
      kind: "blocked",
      reason:
        "The shaping direction was not explicit, so glyph order cannot be bound safely to the current writer.",
    };
  }

  if (reconciliation.kind !== "compatible-character-codes") {
    return {
      kind: "blocked",
      reason: reconciliation.reason,
    };
  }

  if (
    reconciliation.requiresGlyphSubstitution ||
    reconciliation.requiresPerGlyphPositioning
  ) {
    return {
      kind: "blocked",
      reason:
        "The shaping result needs glyph substitution or per-glyph positioning that the current native writer does not emit.",
    };
  }

  const proof = Object.assign(new ValidatedShapingWriteEvidenceProof(), {
    replacementText,
    embeddedProgramSha256: embeddedProgramSha256.toLowerCase(),
    engineVersion: shaped.engineVersion,
    advanceAgreement: reconciliation.advanceAgreement,
    writerMode: "character-codes" as const,
    shapedGlyphWrite: null,
  }) as ValidatedShapingWriteEvidence;

  Object.freeze(proof);
  return { kind: "validated", evidence: proof };
}


function shapedGlyphResourceIdentityKey(
  resourceName: string,
  identity: PdfFontResourceIdentity,
): string {
  return JSON.stringify([
    resourceName,
    identity.fontObjectRef,
    identity.descriptorObjectRef,
    identity.descendantObjectRef,
    identity.fontProgramObjectRef,
    identity.toUnicodeObjectRef,
    identity.encodingObjectRef,
    identity.descriptorFontName,
    identity.descendantSubtype,
    identity.descendantBaseFont,
    identity.type0Encoding,
    identity.writingMode,
    identity.cidSystemInfo?.registry ?? null,
    identity.cidSystemInfo?.ordering ?? null,
    identity.cidSystemInfo?.supplement ?? null,
    identity.cidToGidMap?.kind ?? null,
    identity.cidToGidMap?.name ?? null,
    identity.cidToGidMap?.objectRef ?? null,
  ]);
}

export function shapedGlyphEvidenceMatchesResource({
  evidence,
  resourceName,
  resourceIdentity,
}: {
  evidence: ValidatedShapingWriteEvidence | null | undefined;
  resourceName: string | null | undefined;
  resourceIdentity: PdfFontResourceIdentity | null | undefined;
}): boolean {
  const instruction = evidence?.shapedGlyphWrite;
  return Boolean(
    evidence &&
      isValidatedShapingWriteEvidence(evidence) &&
      evidence.writerMode === "shaped-glyphs" &&
      instruction &&
      resourceName &&
      resourceIdentity &&
      instruction.fontResourceName === resourceName &&
      instruction.resourceIdentityKey ===
        shapedGlyphResourceIdentityKey(resourceName, resourceIdentity),
  );
}

/**
 * Narrow shaped-glyph authority for the first native glyph writer slice.
 *
 * It intentionally supports only a PDF structure where HarfBuzz glyph IDs
 * are independently proven to be writable CID codes:
 *   Type0 / Identity-H / CIDFontType2 / explicit CIDToGIDMap /Identity.
 *
 * The proof also requires the existing ToUnicode map to decode every shaped
 * CID back to the exact logical cluster text. This keeps reopen/searchability
 * authoritative instead of assuming that a visually correct glyph sequence
 * is also semantically correct PDF text.
 *
 * RTL/vertical order, glyph offsets, non-identity CID maps and unresolved
 * widths remain blocked. HarfBuzz still never authorizes a write by itself.
 */
export function validateShapingEvidenceForIdentityCidGlyphWriter({
  replacementText,
  embeddedProgramSha256,
  shaped,
  reconciliation,
  resourceName,
  resourceIdentity,
  resolvedFont,
  fontMetrics,
}: {
  replacementText: string;
  embeddedProgramSha256: string | null | undefined;
  shaped: ShapedRun;
  reconciliation: ShapingReconciliation;
  resourceName: string | null | undefined;
  resourceIdentity: PdfFontResourceIdentity | null | undefined;
  resolvedFont: Pick<
    ResolvedFont,
    "kind" | "bytesPerCode" | "glyphCodeToUnicode"
  >;
  fontMetrics: FontMetrics;
}): ShapingWriteEvidenceResult {
  if (!embeddedProgramSha256 || !validSha256(embeddedProgramSha256)) {
    return {
      kind: "blocked",
      reason:
        "The exact embedded font fingerprint is unavailable, so shaped glyph output cannot be bound to this PDF font safely.",
    };
  }
  if (shaped.text !== replacementText) {
    return {
      kind: "blocked",
      reason:
        "The shaping evidence belongs to different replacement text, so it cannot authorize this edit.",
    };
  }
  if (
    !shaped.directionWasExplicit ||
    shaped.requestedDirection !== "ltr"
  ) {
    return {
      kind: "blocked",
      reason:
        "The first shaped-glyph writer supports only explicit left-to-right horizontal glyph order. RTL and vertical text remain read-only.",
    };
  }
  if (reconciliation.kind !== "requires-shaped-glyph-write") {
    return {
      kind: "blocked",
      reason:
        "This shaping result does not require the shaped-glyph writer.",
    };
  }
  if (!resourceName || !resourceIdentity) {
    return {
      kind: "blocked",
      reason:
        "The exact PDF font resource identity is unavailable, so shaped glyphs cannot be addressed safely.",
    };
  }
  if (
    resolvedFont.kind !== "Type0" ||
    resolvedFont.bytesPerCode !== 2 ||
    fontMetrics.bytesPerCode !== 2 ||
    resourceIdentity.descendantSubtype !== "CIDFontType2" ||
    resourceIdentity.type0Encoding !== "Identity-H" ||
    resourceIdentity.writingMode !== "horizontal" ||
    resourceIdentity.cidSystemInfo?.ordering !== "Identity" ||
    resourceIdentity.cidToGidMap?.kind !== "name" ||
    resourceIdentity.cidToGidMap.name !== "Identity"
  ) {
    return {
      kind: "blocked",
      reason:
        "This shaped text is not backed by a proven horizontal Type0 Identity-H CIDFontType2 resource with an explicit Identity CID-to-GID map.",
    };
  }
  if (
    !resourceIdentity.fontObjectRef ||
    !resourceIdentity.descendantObjectRef ||
    !resourceIdentity.fontProgramObjectRef ||
    !resourceIdentity.toUnicodeObjectRef
  ) {
    return {
      kind: "blocked",
      reason:
        "This shaped font does not expose complete indirect PDF resource provenance for the font, descendant, embedded program and ToUnicode map.",
    };
  }
  if (fontMetrics.source === "Unknown") {
    return {
      kind: "blocked",
      reason:
        "The PDF CID widths are unresolved, so shaped glyph positioning cannot be emitted safely.",
    };
  }
  if (
    !Number.isFinite(shaped.unitsPerEm) ||
    shaped.unitsPerEm <= 0 ||
    shaped.glyphs.length === 0 ||
    shaped.clusterMap.length === 0
  ) {
    return {
      kind: "blocked",
      reason:
        "The shaped glyph sequence or font units are unavailable.",
    };
  }

  const glyphCodes: number[] = [];
  const glyphTjAdjustments: number[] = [];
  let expectedClusterStart = 0;
  let expectedGlyphIndex = 0;
  let naturalAdvanceUnits1000 = 0;

  for (const cluster of shaped.clusterMap) {
    if (
      cluster.startUtf16 !== expectedClusterStart ||
      cluster.endUtf16 <= cluster.startUtf16 ||
      cluster.endUtf16 > replacementText.length ||
      cluster.text !==
        replacementText.slice(cluster.startUtf16, cluster.endUtf16) ||
      cluster.glyphIndices.length === 0
    ) {
      return {
        kind: "blocked",
        reason:
          "HarfBuzz cluster coverage is not a contiguous logical text range, so shaped output cannot be written safely.",
      };
    }

    let extractedCluster = "";
    for (const glyphIndex of cluster.glyphIndices) {
      if (glyphIndex !== expectedGlyphIndex) {
        return {
          kind: "blocked",
          reason:
            "The shaped glyph sequence reorders glyphs relative to logical text. This first writer keeps reordered/RTL clusters read-only.",
        };
      }
      const glyph = shaped.glyphs[glyphIndex];
      if (
        !glyph ||
        glyph.clusterUtf16 !== cluster.startUtf16 ||
        !Number.isInteger(glyph.glyphId) ||
        glyph.glyphId <= 0 ||
        glyph.glyphId > 0xffff
      ) {
        return {
          kind: "blocked",
          reason:
            "A shaped glyph is missing, out of range, or not bound to its source cluster.",
        };
      }
      if (
        !Number.isFinite(glyph.xAdvance) ||
        glyph.xAdvance < 0 ||
        Math.abs(glyph.yAdvance) > 1 ||
        Math.abs(glyph.xOffset) > 1 ||
        Math.abs(glyph.yOffset) > 1
      ) {
        return {
          kind: "blocked",
          reason:
            "This shaped run needs glyph offsets, vertical movement, or unsupported positioning that the horizontal CID writer does not emit.",
        };
      }

      const cid = glyph.glyphId;
      const unicode = resolvedFont.glyphCodeToUnicode.get(cid);
      if (unicode === undefined) {
        return {
          kind: "blocked",
          reason:
            "A shaped glyph ID is not present in this exact PDF font resource's ToUnicode map.",
        };
      }
      extractedCluster += unicode;

      const widthUnits =
        fontMetrics.glyphWidths.get(cid) ?? fontMetrics.defaultWidth;
      if (!Number.isFinite(widthUnits) || widthUnits <= 0) {
        return {
          kind: "blocked",
          reason:
            "A shaped CID has no positive resolved PDF width.",
        };
      }

      const shapedAdvanceUnits1000 =
        (glyph.xAdvance / shaped.unitsPerEm) * 1000;
      if (
        !Number.isFinite(shapedAdvanceUnits1000) ||
        Math.abs(shapedAdvanceUnits1000) > 1_000_000
      ) {
        return {
          kind: "blocked",
          reason:
            "A shaped glyph advance is outside the safe PDF text range.",
        };
      }

      const tjAdjustment = widthUnits - shapedAdvanceUnits1000;
      if (
        !Number.isFinite(tjAdjustment) ||
        Math.abs(tjAdjustment) > 1_000_000
      ) {
        return {
          kind: "blocked",
          reason:
            "A shaped glyph positioning adjustment is outside the safe PDF text range.",
        };
      }

      glyphCodes.push(cid);
      glyphTjAdjustments.push(tjAdjustment);
      naturalAdvanceUnits1000 += shapedAdvanceUnits1000;
      expectedGlyphIndex += 1;
    }

    if (extractedCluster !== cluster.text) {
      return {
        kind: "blocked",
        reason:
          "The shaped CID sequence does not reopen through ToUnicode as the exact logical source text.",
      };
    }
    expectedClusterStart = cluster.endUtf16;
  }

  if (
    expectedClusterStart !== replacementText.length ||
    expectedGlyphIndex !== shaped.glyphs.length ||
    !Number.isFinite(naturalAdvanceUnits1000)
  ) {
    return {
      kind: "blocked",
      reason:
        "The shaped glyph proof does not cover the replacement text and glyph sequence exactly once.",
    };
  }

  const instruction: ShapedGlyphWriteInstruction = Object.freeze({
    resourceIdentityKey: shapedGlyphResourceIdentityKey(
      resourceName,
      resourceIdentity,
    ),
    fontResourceName: resourceName,
    glyphCodes: Object.freeze([...glyphCodes]),
    glyphTjAdjustments: Object.freeze([...glyphTjAdjustments]),
    naturalAdvanceUnits1000,
  });

  const proof = Object.assign(new ValidatedShapingWriteEvidenceProof(), {
    replacementText,
    embeddedProgramSha256: embeddedProgramSha256.toLowerCase(),
    engineVersion: shaped.engineVersion,
    advanceAgreement: reconciliation.advanceAgreement,
    writerMode: "shaped-glyphs" as const,
    shapedGlyphWrite: instruction,
  }) as ValidatedShapingWriteEvidence;

  Object.freeze(proof);
  return { kind: "validated", evidence: proof };
}

export function isValidatedShapingWriteEvidence(
  evidence: unknown,
): evidence is ValidatedShapingWriteEvidence {
  return (
    evidence instanceof ValidatedShapingWriteEvidenceProof &&
    evidence.isPlannerIssued() &&
    Object.isFrozen(evidence)
  );
}

export function shapingEvidenceMatchesReplacement({
  evidence,
  replacementText,
  embeddedProgramSha256,
}: {
  evidence: ValidatedShapingWriteEvidence | null | undefined;
  replacementText: string;
  embeddedProgramSha256: string | null | undefined;
}): boolean {
  return Boolean(
    evidence &&
      isValidatedShapingWriteEvidence(evidence) &&
      evidence.replacementText === replacementText &&
      embeddedProgramSha256 &&
      validSha256(embeddedProgramSha256) &&
      evidence.embeddedProgramSha256 === embeddedProgramSha256.toLowerCase(),
  );
}
