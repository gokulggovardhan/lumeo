import type {
  PdfEmbeddedFontTextShaper,
  PdfFontShapingInspection,
} from "./fontRegistry.ts";
import type { ShapeEmbeddedFontOptions } from "./harfbuzzShaping.ts";
import {
  detectComplexShapingRequirement,
  validateShapingEvidenceForCharacterCodeWriter,
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
      kind: "shaped-glyph-required";
      inspection: Extract<PdfFontShapingInspection, { kind: "reconciled" }>;
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

export function shouldRequestShapingEvidence({
  sourceText,
  replacementText,
  complexShapingRequired,
  verticalWriterCandidate,
}: {
  sourceText: string;
  replacementText: string;
  complexShapingRequired: boolean;
  verticalWriterCandidate: boolean;
}): boolean {
  return (
    replacementText !== sourceText &&
    (complexShapingRequired || verticalWriterCandidate)
  );
}

/**
 * Resolves the additional local shaping evidence required by native Edit PDF.
 *
 * Character-code-compatible results mint only the existing shaping proof.
 * Results that genuinely require addressed shaped glyphs are surfaced to the
 * separate bounded shaped-glyph planner; this resolver never authorizes that
 * mutation itself. The inspector/shaper are injected so HarfBuzz still stays
 * off the ordinary Latin/CJK fast path.
 */
export async function resolveCompatibleShapingWriteEvidence({
  replacementText,
  embeddedProgramSha256,
  inspect,
  shapeText,
}: {
  replacementText: string;
  embeddedProgramSha256: string | null;
  inspect: LocalShapingInspection;
  shapeText: PdfEmbeddedFontTextShaper;
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

  if (inspection.reconciliation.kind === "requires-shaped-glyph-write") {
    return {
      kind: "shaped-glyph-required",
      direction,
      inspection,
    };
  }

  const proof = validateShapingEvidenceForCharacterCodeWriter({
    replacementText,
    embeddedProgramSha256,
    shaped: inspection.shaped,
    reconciliation: inspection.reconciliation,
  });
  return proof.kind === "validated"
    ? { kind: "validated", direction, evidence: proof.evidence }
    : { kind: "blocked", direction, reason: proof.reason };
}
