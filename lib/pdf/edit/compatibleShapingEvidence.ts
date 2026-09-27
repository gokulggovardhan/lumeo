import type { ResolvedFont } from "./fontEncoding.ts";
import type { FontMetrics } from "./fontMetrics.ts";
import type {
  PdfEmbeddedFontTextShaper,
  PdfFontResourceIdentity,
  PdfFontShapingInspection,
} from "./fontRegistry.ts";
import type { ShapeEmbeddedFontOptions } from "./harfbuzzShaping.ts";
import {
  detectComplexShapingRequirement,
  validateShapingEvidenceForCharacterCodeWriter,
  validateShapingEvidenceForIdentityCidGlyphWriter,
  type ComplexShapingRequirement,
  type ValidatedShapingWriteEvidence,
} from "./shapingWriteGuard.ts";

export type CompatibleShapingEvidenceResolution =
  | Readonly<{ kind: "not-required" }>
  | Readonly<{
      kind: "validated";
      evidence: ValidatedShapingWriteEvidence;
      direction: "ltr" | "rtl";
    }>
  | Readonly<{
      kind: "blocked";
      reason: string;
      direction: "ltr" | "rtl";
    }>;

export type LocalShapingInspection = (
  options: ShapeEmbeddedFontOptions & { direction: "ltr" | "rtl" },
  shapeText: PdfEmbeddedFontTextShaper,
) => Promise<PdfFontShapingInspection>;

export function explicitDirectionForShapingRequirement(
  requirement: Extract<ComplexShapingRequirement, { required: true }>,
): "ltr" | "rtl" {
  return requirement.kind === "rtl-script" ||
    requirement.kind === "joining-script" ||
    requirement.kind === "bidi-control"
    ? "rtl"
    : "ltr";
}

export function shapingEvidenceRequestKey({
  pageIndex,
  selectionKey,
  resourceName,
  embeddedProgramSha256,
  replacementText,
}: {
  pageIndex: number;
  selectionKey: string;
  resourceName: string;
  embeddedProgramSha256: string | null;
  replacementText: string;
}): string {
  return JSON.stringify([
    pageIndex,
    selectionKey,
    resourceName,
    embeddedProgramSha256?.toLowerCase() ?? "",
    replacementText,
  ]);
}

/**
 * Resolves only the additional shaping proof required by the existing native
 * character-code writer. The inspector/shaper are injected so this module
 * never loads HarfBuzz on the ordinary Latin/CJK fast path.
 */
export async function resolveCompatibleShapingWriteEvidence({
  replacementText,
  embeddedProgramSha256,
  inspect,
  shapeText,
  resourceName = null,
  resourceIdentity = null,
  resolvedFont = null,
  fontMetrics = null,
}: {
  replacementText: string;
  embeddedProgramSha256: string | null;
  inspect: LocalShapingInspection;
  shapeText: PdfEmbeddedFontTextShaper;
  resourceName?: string | null;
  resourceIdentity?: PdfFontResourceIdentity | null;
  resolvedFont?: Pick<
    ResolvedFont,
    "kind" | "bytesPerCode" | "glyphCodeToUnicode"
  > | null;
  fontMetrics?: FontMetrics | null;
}): Promise<CompatibleShapingEvidenceResolution> {
  const requirement = detectComplexShapingRequirement(replacementText);
  if (!requirement.required) return { kind: "not-required" };

  const direction = explicitDirectionForShapingRequirement(requirement);
  if (!embeddedProgramSha256) {
    return {
      kind: "blocked",
      direction,
      reason:
        "This text needs canonical shaping, but the exact embedded font fingerprint is unavailable.",
    };
  }

  const inspection = await inspect({ direction }, shapeText);
  if (inspection.kind !== "reconciled") {
    return { kind: "blocked", direction, reason: inspection.reason };
  }

  const proof = validateShapingEvidenceForCharacterCodeWriter({
    replacementText,
    embeddedProgramSha256,
    shaped: inspection.shaped,
    reconciliation: inspection.reconciliation,
  });
  if (proof.kind === "validated") {
    return { kind: "validated", direction, evidence: proof.evidence };
  }

  if (
    inspection.reconciliation.kind === "requires-shaped-glyph-write" &&
    resourceName &&
    resourceIdentity &&
    resolvedFont &&
    fontMetrics
  ) {
    const shapedProof = validateShapingEvidenceForIdentityCidGlyphWriter({
      replacementText,
      embeddedProgramSha256,
      shaped: inspection.shaped,
      reconciliation: inspection.reconciliation,
      resourceName,
      resourceIdentity,
      resolvedFont,
      fontMetrics,
    });
    return shapedProof.kind === "validated"
      ? { kind: "validated", direction, evidence: shapedProof.evidence }
      : { kind: "blocked", direction, reason: shapedProof.reason };
  }

  return { kind: "blocked", direction, reason: proof.reason };
}
