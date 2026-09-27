import {
  resolveCompatibleShapingWriteEvidence,
} from "./compatibleShapingEvidence.ts";
import type {
  PdfEmbeddedFontTextShaper,
  PdfFontRegistry,
} from "./fontRegistry.ts";
import type { NativeReplacePageAnalysis } from "./nativeReplacePageAnalysis.ts";
import type {
  StructuredReplaceCandidate,
  StructuredReplacePagePlan,
} from "./structuredReplaceAll.ts";
import {
  validateStructuredReplaceCandidate,
  type StructuredReplaceShapingResolver,
  type ValidatedStructuredReplaceCandidate,
} from "./structuredReplaceNativePlan.ts";
import type { ValidatedEditPlan } from "./editPlan.ts";

export type StructuredReplaceWriteSkipReason =
  | "native-preflight-blocked"
  | "stale-original-text";

export type StructuredReplaceWriteSkippedCandidate = Readonly<{
  candidate: StructuredReplaceCandidate;
  reason: StructuredReplaceWriteSkipReason;
  detail: string;
}>;

export type StructuredReplaceWriteUnit = Readonly<{
  candidate: StructuredReplaceCandidate;
  plans: readonly ValidatedEditPlan[];
  bytesPerCode: 1 | 2;
  contentStreamIndex: number;
  operatorIndices: readonly number[];
  fontResourceName: string | null;
}>;

export type StructuredReplacePageWritePreflight = Readonly<{
  pageIndex: number;
  requestedMatchCount: number;
  validatedMatchCount: number;
  units: readonly StructuredReplaceWriteUnit[];
  skipped: readonly StructuredReplaceWriteSkippedCandidate[];
}>;

export type StructuredReplaceWriteDependencies = Readonly<{
  fontRegistry: Pick<PdfFontRegistry, "inspectShapingCompatibility">;
  shapeText?: PdfEmbeddedFontTextShaper | null;
}>;

function plansForTarget(
  target: ValidatedStructuredReplaceCandidate,
): readonly ValidatedEditPlan[] {
  return target.kind === "single" ? [target.plan] : target.plan.subPlans;
}

function originalTextForTarget(
  target: ValidatedStructuredReplaceCandidate,
): string {
  return target.plan.originalText;
}

function resourceNameForTarget(
  target: ValidatedStructuredReplaceCandidate,
): string | null {
  return target.kind === "single"
    ? target.plan.fontResourceName
    : target.plan.subPlans[0]?.fontResourceName ?? null;
}

function shapingResolverFor(
  dependencies: StructuredReplaceWriteDependencies,
): StructuredReplaceShapingResolver | null {
  if (!dependencies.shapeText) return null;
  const shapeText = dependencies.shapeText;

  return async (request) => {
    const resolution = await resolveCompatibleShapingWriteEvidence({
      replacementText: request.replacementText,
      embeddedProgramSha256: request.embeddedProgramSha256,
      inspect: (options, injectedShaper) =>
        dependencies.fontRegistry.inspectShapingCompatibility(
          request.resources,
          request.resourceName,
          request.replacementText,
          options,
          injectedShaper,
        ),
      shapeText,
    });

    if (resolution.kind === "validated") {
      return { kind: "validated", evidence: resolution.evidence };
    }
    if (resolution.kind === "blocked") {
      return { kind: "blocked", reason: resolution.reason };
    }

    // validateStructuredReplaceCandidate calls this resolver only after
    // complex shaping has already been proven necessary.
    return {
      kind: "blocked",
      reason:
        "This replacement requires shaping evidence, but no shaping proof was produced.",
    };
  };
}

/**
 * Aggregates the canonical native candidate validator into page-level
 * Replace All preflight results.
 *
 * structuredReplaceNativePlan.ts is the single source of per-candidate
 * writer authority. This layer adds only two batch concerns:
 * stale original-text detection and product-facing match/skipped counts.
 *
 * It never mutates PDF bytes.
 */
export async function preflightStructuredReplacePageWrites({
  analysis,
  pagePlan,
  dependencies,
}: {
  analysis: NativeReplacePageAnalysis;
  pagePlan: StructuredReplacePagePlan;
  dependencies: StructuredReplaceWriteDependencies;
}): Promise<StructuredReplacePageWritePreflight> {
  if (analysis.pageIndex !== pagePlan.pageIndex) {
    throw new Error(
      "Structured Replace All analysis and page plan refer to different pages.",
    );
  }

  const units: StructuredReplaceWriteUnit[] = [];
  const skipped: StructuredReplaceWriteSkippedCandidate[] = [];
  const resolveShaping = shapingResolverFor(dependencies);

  for (const candidate of pagePlan.candidates) {
    const validation = await validateStructuredReplaceCandidate({
      analysis,
      candidate,
      resolveShaping,
    });

    if (validation.kind === "skipped") {
      skipped.push({
        candidate,
        reason: "native-preflight-blocked",
        detail: validation.reason,
      });
      continue;
    }

    const target = validation.target;
    if (originalTextForTarget(target) !== candidate.originalText) {
      skipped.push({
        candidate,
        reason: "stale-original-text",
        detail:
          "The native PDF text changed after the search candidate was prepared. Run Find again before replacing.",
      });
      continue;
    }

    const plans = plansForTarget(target);
    units.push({
      candidate,
      plans,
      bytesPerCode: target.bytesPerCode,
      contentStreamIndex: target.plan.contentStreamIndex,
      operatorIndices:
        target.kind === "single"
          ? [target.plan.operatorIndex]
          : [...target.plan.operatorIndices],
      fontResourceName: resourceNameForTarget(target),
    });
  }

  return {
    pageIndex: pagePlan.pageIndex,
    requestedMatchCount: pagePlan.plannedMatchCount,
    validatedMatchCount: units.reduce(
      (total, unit) => total + unit.candidate.matchIds.length,
      0,
    ),
    units,
    skipped,
  };
}
