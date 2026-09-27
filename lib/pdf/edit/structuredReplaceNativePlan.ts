import type { PDFDict } from "pdf-lib";
import {
  buildEditPlan,
  isValidatedEditPlan,
  type ValidatedEditPlan,
} from "./editPlan.ts";
import {
  buildMultiRunEditPlan,
  isValidatedMultiRunEditPlan,
  type ValidatedMultiRunEditPlan,
} from "./multiRunEditPlan.ts";
import { decideReplacementLayout } from "./replacementLayout.ts";
import { detectComplexShapingRequirement, type ValidatedShapingWriteEvidence } from "./shapingWriteGuard.ts";
import { runSpansMultipleOperators } from "./matchTextRun.ts";
import type { NativeReplacePageAnalysis } from "./nativeReplacePageAnalysis.ts";
import type { StructuredReplaceCandidate } from "./structuredReplaceAll.ts";
import type { PdfFontProfile } from "./fontRegistry.ts";

export type StructuredReplaceShapingRequest = Readonly<{
  replacementText: string;
  embeddedProgramSha256: string | null;
  resources: PDFDict;
  resourceName: string;
  profile: PdfFontProfile;
}>;

export type StructuredReplaceShapingResolution =
  | Readonly<{ kind: "validated"; evidence: ValidatedShapingWriteEvidence }>
  | Readonly<{ kind: "blocked"; reason: string }>;

export type StructuredReplaceShapingResolver = (
  request: StructuredReplaceShapingRequest,
) => Promise<StructuredReplaceShapingResolution>;

export type ValidatedStructuredReplaceCandidate =
  | Readonly<{
      kind: "single";
      candidate: StructuredReplaceCandidate;
      plan: ValidatedEditPlan;
      bytesPerCode: 1 | 2;
    }>
  | Readonly<{
      kind: "multi";
      candidate: StructuredReplaceCandidate;
      plan: ValidatedMultiRunEditPlan;
      bytesPerCode: 1 | 2;
    }>;

export type StructuredReplaceCandidateValidation =
  | Readonly<{ kind: "validated"; target: ValidatedStructuredReplaceCandidate }>
  | Readonly<{ kind: "skipped"; reason: string }>;

async function shapingEvidenceFor({
  replacementText,
  profile,
  resources,
  resourceName,
  resolveShaping,
}: {
  replacementText: string;
  profile: PdfFontProfile;
  resources: PDFDict;
  resourceName: string;
  resolveShaping?: StructuredReplaceShapingResolver | null;
}): Promise<
  | Readonly<{ kind: "ready"; evidence: ValidatedShapingWriteEvidence | null }>
  | Readonly<{ kind: "blocked"; reason: string }>
> {
  const requirement = detectComplexShapingRequirement(replacementText);
  if (!requirement.required) return { kind: "ready", evidence: null };
  if (!resolveShaping) {
    return {
      kind: "blocked",
      reason:
        "This replacement needs canonical shaping, but batch shaping evidence is unavailable.",
    };
  }
  const result = await resolveShaping({
    replacementText,
    embeddedProgramSha256: profile.embeddedProgramSha256,
    resources,
    resourceName,
    profile,
  });
  return result.kind === "validated"
    ? { kind: "ready", evidence: result.evidence }
    : { kind: "blocked", reason: result.reason };
}

function layoutReason(plan: ValidatedEditPlan): string | null {
  const decision = decideReplacementLayout(plan);
  return decision.safeToApplyWithCurrentWriter
    ? null
    : decision.reason ?? "This replacement does not fit safely in the current PDF text box.";
}

function streamOperatorsFor(
  analysis: NativeReplacePageAnalysis,
  contentStreamIndex: number,
) {
  return analysis.pageOperators
    .filter(
      (item) =>
        item.locator.kind === "page" &&
        item.locator.contentStreamIndex === contentStreamIndex,
    )
    .sort((a, b) => a.operatorIndex - b.operatorIndex)
    .map((item) => item.operator);
}

/**
 * Revalidates one Replace All candidate against live native PDF evidence and
 * returns only planner-issued writer authority.
 *
 * No fallback font is attempted here. A batch edit must either remain in the
 * exact proven font resource or be skipped; silent per-match substitution
 * would make a document-wide action visually unpredictable.
 */
export async function validateStructuredReplaceCandidate({
  analysis,
  candidate,
  resolveShaping = null,
}: {
  analysis: NativeReplacePageAnalysis;
  candidate: StructuredReplaceCandidate;
  resolveShaping?: StructuredReplaceShapingResolver | null;
}): Promise<StructuredReplaceCandidateValidation> {
  if (candidate.pageIndex !== analysis.pageIndex) {
    return { kind: "skipped", reason: "The replacement candidate belongs to a different page revision." };
  }
  if (candidate.sourceRunIndices.length === 0) {
    return { kind: "skipped", reason: "The replacement candidate no longer has a native source run." };
  }

  const runEntries = candidate.sourceRunIndices.map((sourceRunIndex) => ({
    sourceRunIndex,
    run: analysis.runs[sourceRunIndex] ?? null,
    match: analysis.editableRunMatches[sourceRunIndex] ?? null,
    profile: analysis.fontProfiles[sourceRunIndex] ?? null,
  }));
  if (runEntries.some((entry) => !entry.run || !entry.match || !entry.profile)) {
    return {
      kind: "skipped",
      reason:
        "One or more matching text spans no longer have complete native source/font authority.",
    };
  }

  const first = runEntries[0] as {
    sourceRunIndex: number;
    run: NonNullable<(typeof runEntries)[number]["run"]>;
    match: NonNullable<(typeof runEntries)[number]["match"]>;
    profile: NonNullable<(typeof runEntries)[number]["profile"]>;
  };

  // One visual run may itself be a proven reconstruction of several adjacent
  // text-showing operators. Reuse the normal multi-run planner in that case.
  if (runEntries.length === 1) {
    const fragment = analysis.fragmentedRunReconstructions.get(
      first.sourceRunIndex,
    );
    if (fragment) {
      const shaping = await shapingEvidenceFor({
        replacementText: candidate.replacementText,
        profile: first.profile,
        resources: fragment.resources,
        resourceName: fragment.fontResourceName,
        resolveShaping,
      });
      if (shaping.kind === "blocked") {
        return { kind: "skipped", reason: shaping.reason };
      }
      const plan = buildMultiRunEditPlan({
        pageIndex: analysis.pageIndex,
        contentStreamIndex: fragment.contentStreamIndex,
        allOperators: fragment.allOperators,
        operatorIndices: fragment.operatorIndices,
        replacementText: candidate.replacementText,
        resolvedFont: first.profile.resolvedFont,
        fontMetrics: first.profile.metrics,
        embeddedGlyphEvidence: first.profile.embeddedGlyphEvidence,
        embeddedProgramSha256: first.profile.embeddedProgramSha256,
        shapingWriteEvidence: shaping.evidence,
      });
      if (!isValidatedMultiRunEditPlan(plan)) {
        return { kind: "skipped", reason: plan.reason };
      }
      const layoutBlocked = layoutReason(plan.subPlans[0]);
      if (layoutBlocked) return { kind: "skipped", reason: layoutBlocked };
      return {
        kind: "validated",
        target: {
          kind: "multi",
          candidate,
          plan,
          bytesPerCode: first.profile.resolvedFont.bytesPerCode,
        },
      };
    }

    const located = first.match.locatedOperator;
    if (located.locator.kind !== "page") {
      return {
        kind: "skipped",
        reason:
          "Replace All does not rewrite shared Form XObject text in batch mode. Replace this match individually so Lumeo can isolate it safely.",
      };
    }
    const resourceName = first.match.operator.fontResourceName;
    if (!resourceName) {
      return {
        kind: "skipped",
        reason: "The matching native text font resource could not be identified.",
      };
    }
    const shaping = await shapingEvidenceFor({
      replacementText: candidate.replacementText,
      profile: first.profile,
      resources: located.resources,
      resourceName,
      resolveShaping,
    });
    if (shaping.kind === "blocked") {
      return { kind: "skipped", reason: shaping.reason };
    }

    const plan = buildEditPlan({
      pageIndex: analysis.pageIndex,
      contentStreamIndex: located.locator.contentStreamIndex,
      operatorIndex: located.operatorIndex,
      operator: located.operator,
      replacementText: candidate.replacementText,
      resolvedFont: first.profile.resolvedFont,
      fontMetrics: first.profile.metrics,
      embeddedGlyphEvidence: first.profile.embeddedGlyphEvidence,
      embeddedProgramSha256: first.profile.embeddedProgramSha256,
      shapingWriteEvidence: shaping.evidence,
    });
    if (!isValidatedEditPlan(plan)) {
      return { kind: "skipped", reason: plan.reason };
    }
    if (runSpansMultipleOperators(plan.originalText, first.run.str)) {
      return {
        kind: "skipped",
        reason:
          "This visible text is split across native operators and could not be reconstructed exactly for batch replacement.",
      };
    }
    const layoutBlocked = layoutReason(plan);
    if (layoutBlocked) return { kind: "skipped", reason: layoutBlocked };
    return {
      kind: "validated",
      target: {
        kind: "single",
        candidate,
        plan,
        bytesPerCode: first.profile.resolvedFont.bytesPerCode,
      },
    };
  }

  const matches = runEntries.map((entry) => entry.match!);
  if (matches.some((match) => match.locatedOperator.locator.kind !== "page")) {
    return {
      kind: "skipped",
      reason:
        "Replace All skips multi-span text inside Form XObjects because the batch writer cannot isolate shared form invocations safely.",
    };
  }

  const firstLocator = matches[0].locatedOperator.locator;
  if (firstLocator.kind !== "page") {
    return { kind: "skipped", reason: "The batch target is not a page content stream." };
  }
  if (
    matches.some(
      (match) =>
        match.locatedOperator.locator.kind !== "page" ||
        match.locatedOperator.locator.contentStreamIndex !==
          firstLocator.contentStreamIndex,
    )
  ) {
    return {
      kind: "skipped",
      reason:
        "This match crosses separate PDF content streams and cannot be replaced atomically.",
    };
  }

  const operatorIndices = matches
    .map((match) => match.locatedOperator.operatorIndex)
    .sort((a, b) => a - b);
  for (let index = 1; index < operatorIndices.length; index += 1) {
    if (operatorIndices[index] !== operatorIndices[index - 1] + 1) {
      return {
        kind: "skipped",
        reason:
          "This match contains unselected native text operators between its spans.",
      };
    }
  }

  const resourceName = matches[0].operator.fontResourceName;
  if (
    !resourceName ||
    matches.some((match) => match.operator.fontResourceName !== resourceName)
  ) {
    return {
      kind: "skipped",
      reason:
        "This match spans different PDF font resources and is not safe for one in-place batch replacement.",
    };
  }

  const profile = first.profile;
  if (
    runEntries.some(
      (entry) =>
        entry.profile?.resourceIdentity.fontObjectRef !==
          profile.resourceIdentity.fontObjectRef ||
        entry.profile?.embeddedProgramSha256 !== profile.embeddedProgramSha256,
    )
  ) {
    return {
      kind: "skipped",
      reason:
        "This match does not resolve to one stable native PDF font identity.",
    };
  }

  const shaping = await shapingEvidenceFor({
    replacementText: candidate.replacementText,
    profile,
    resources: matches[0].locatedOperator.resources,
    resourceName,
    resolveShaping,
  });
  if (shaping.kind === "blocked") {
    return { kind: "skipped", reason: shaping.reason };
  }

  const plan = buildMultiRunEditPlan({
    pageIndex: analysis.pageIndex,
    contentStreamIndex: firstLocator.contentStreamIndex,
    allOperators: streamOperatorsFor(
      analysis,
      firstLocator.contentStreamIndex,
    ),
    operatorIndices,
    replacementText: candidate.replacementText,
    resolvedFont: profile.resolvedFont,
    fontMetrics: profile.metrics,
    embeddedGlyphEvidence: profile.embeddedGlyphEvidence,
    embeddedProgramSha256: profile.embeddedProgramSha256,
    shapingWriteEvidence: shaping.evidence,
  });
  if (!isValidatedMultiRunEditPlan(plan)) {
    return { kind: "skipped", reason: plan.reason };
  }
  const layoutBlocked = layoutReason(plan.subPlans[0]);
  if (layoutBlocked) return { kind: "skipped", reason: layoutBlocked };

  return {
    kind: "validated",
    target: {
      kind: "multi",
      candidate,
      plan,
      bytesPerCode: profile.resolvedFont.bytesPerCode,
    },
  };
}
