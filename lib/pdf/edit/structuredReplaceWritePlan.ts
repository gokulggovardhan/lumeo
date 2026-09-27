import type { PDFDict } from "pdf-lib";
import {
  buildEditPlan,
  isValidatedEditPlan,
  type ValidatedEditPlan,
} from "./editPlan.ts";
import {
  buildMultiRunEditPlan,
  isValidatedMultiRunEditPlan,
} from "./multiRunEditPlan.ts";
import {
  resolveCompatibleShapingWriteEvidence,
} from "./compatibleShapingEvidence.ts";
import {
  detectComplexShapingRequirement,
  type ValidatedShapingWriteEvidence,
} from "./shapingWriteGuard.ts";
import { decideReplacementLayout } from "./replacementLayout.ts";
import type {
  PdfEmbeddedFontTextShaper,
  PdfFontProfile,
  PdfFontRegistry,
} from "./fontRegistry.ts";
import type {
  NativeReplacePageAnalysis,
  NativeReplaceRunMatch,
} from "./nativeReplacePageAnalysis.ts";
import type {
  StructuredReplaceCandidate,
  StructuredReplacePagePlan,
} from "./structuredReplaceAll.ts";

export type StructuredReplaceWriteSkipReason =
  | "missing-native-evidence"
  | "unsupported-form-target"
  | "mixed-content-stream"
  | "non-consecutive-operators"
  | "mixed-font-resource"
  | "stale-original-text"
  | "shaping-blocked"
  | "plan-rejected"
  | "layout-blocked";

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
  fontRegistry: Pick<
    PdfFontRegistry,
    "resolve" | "inspectShapingCompatibility"
  >;
  shapeText?: PdfEmbeddedFontTextShaper | null;
}>;

function skipped(
  candidate: StructuredReplaceCandidate,
  reason: StructuredReplaceWriteSkipReason,
  detail: string,
): StructuredReplaceWriteSkippedCandidate {
  return { candidate, reason, detail };
}

async function resolveShapingEvidence({
  replacementText,
  resources,
  resourceName,
  profile,
  dependencies,
}: {
  replacementText: string;
  resources: PDFDict;
  resourceName: string;
  profile: PdfFontProfile;
  dependencies: StructuredReplaceWriteDependencies;
}): Promise<
  | { kind: "ok"; evidence: ValidatedShapingWriteEvidence | null }
  | { kind: "blocked"; reason: string }
> {
  const requirement = detectComplexShapingRequirement(replacementText);
  if (!requirement.required) return { kind: "ok", evidence: null };

  if (!dependencies.shapeText) {
    return {
      kind: "blocked",
      reason:
        "This replacement needs canonical shaping, but the local shaping engine is not available.",
    };
  }

  const resolution = await resolveCompatibleShapingWriteEvidence({
    replacementText,
    embeddedProgramSha256: profile.embeddedProgramSha256,
    inspect: (options, shapeText) =>
      dependencies.fontRegistry.inspectShapingCompatibility(
        resources,
        resourceName,
        replacementText,
        options,
        shapeText,
      ),
    shapeText: dependencies.shapeText,
  });

  if (resolution.kind === "blocked") {
    return { kind: "blocked", reason: resolution.reason };
  }
  return {
    kind: "ok",
    evidence:
      resolution.kind === "validated" ? resolution.evidence : null,
  };
}

function sourceMatchesForCandidate(
  analysis: NativeReplacePageAnalysis,
  candidate: StructuredReplaceCandidate,
): NativeReplaceRunMatch[] | null {
  const matches = candidate.sourceRunIndices.map(
    (index) => analysis.editableRunMatches[index] ?? null,
  );
  return matches.every(Boolean) ? matches : null;
}

function profileForRun(
  analysis: NativeReplacePageAnalysis,
  sourceRunIndex: number,
): PdfFontProfile | null {
  return analysis.fontProfiles[sourceRunIndex] ?? null;
}

function samePageStream(
  matches: readonly NonNullable<NativeReplaceRunMatch>[],
): {
  contentStreamIndex: number;
  resources: PDFDict;
  operatorIndices: number[];
} | null {
  const first = matches[0]?.locatedOperator;
  if (!first || first.locator.kind !== "page") return null;
  const contentStreamIndex = first.locator.contentStreamIndex;
  if (
    matches.some(
      (match) =>
        match.locatedOperator.locator.kind !== "page" ||
        match.locatedOperator.locator.contentStreamIndex !==
          contentStreamIndex,
    )
  ) {
    return null;
  }
  return {
    contentStreamIndex,
    resources: first.resources,
    operatorIndices: matches
      .map((match) => match.locatedOperator.operatorIndex)
      .sort((a, b) => a - b),
  };
}

function consecutive(indices: readonly number[]): boolean {
  for (let index = 1; index < indices.length; index += 1) {
    if (indices[index] !== indices[index - 1] + 1) return false;
  }
  return true;
}

function allOperatorsForStream(
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

async function preflightCandidate({
  analysis,
  candidate,
  dependencies,
}: {
  analysis: NativeReplacePageAnalysis;
  candidate: StructuredReplaceCandidate;
  dependencies: StructuredReplaceWriteDependencies;
}): Promise<
  | { kind: "validated"; unit: StructuredReplaceWriteUnit }
  | { kind: "skipped"; skipped: StructuredReplaceWriteSkippedCandidate }
> {
  const rawMatches = sourceMatchesForCandidate(analysis, candidate);
  if (!rawMatches) {
    return {
      kind: "skipped",
      skipped: skipped(
        candidate,
        "missing-native-evidence",
        "One or more replacement targets no longer have complete native PDF write authority.",
      ),
    };
  }
  const matches = rawMatches as NonNullable<NativeReplaceRunMatch>[];

  if (matches.some((match) => match.locatedOperator.locator.kind === "xobject")) {
    return {
      kind: "skipped",
      skipped: skipped(
        candidate,
        "unsupported-form-target",
        "Structured Replace All leaves text inside reusable PDF objects unchanged so it cannot affect another invocation of the same object.",
      ),
    };
  }

  const stream = samePageStream(matches);
  if (!stream) {
    return {
      kind: "skipped",
      skipped: skipped(
        candidate,
        "mixed-content-stream",
        "This match crosses separate PDF content streams and cannot be committed as one atomic native replacement.",
      ),
    };
  }

  if (!consecutive(stream.operatorIndices)) {
    return {
      kind: "skipped",
      skipped: skipped(
        candidate,
        "non-consecutive-operators",
        "This match crosses native text operators with unrelated content between them.",
      ),
    };
  }

  const resourceNames = matches.map((match) => match.operator.fontResourceName);
  const firstResourceName = resourceNames[0];
  if (
    !firstResourceName ||
    resourceNames.some((name) => name !== firstResourceName)
  ) {
    return {
      kind: "skipped",
      skipped: skipped(
        candidate,
        "mixed-font-resource",
        "This match crosses different native font resources, so one replacement cannot preserve all original font semantics safely.",
      ),
    };
  }

  const profile = profileForRun(
    analysis,
    candidate.sourceRunIndices[0],
  );
  if (!profile) {
    return {
      kind: "skipped",
      skipped: skipped(
        candidate,
        "missing-native-evidence",
        "The exact PDF font profile for this replacement is no longer available.",
      ),
    };
  }

  const shaping = await resolveShapingEvidence({
    replacementText: candidate.replacementText,
    resources: stream.resources,
    resourceName: firstResourceName,
    profile,
    dependencies,
  });
  if (shaping.kind === "blocked") {
    return {
      kind: "skipped",
      skipped: skipped(
        candidate,
        "shaping-blocked",
        shaping.reason,
      ),
    };
  }

  let validatedPlans: ValidatedEditPlan[];

  const fragmented =
    candidate.sourceRunIndices.length === 1
      ? analysis.fragmentedRunReconstructions.get(
          candidate.sourceRunIndices[0],
        ) ?? null
      : null;

  if (candidate.sourceRunIndices.length === 1 && !fragmented) {
    const match = matches[0];
    const locator = match.locatedOperator.locator;
    if (locator.kind !== "page") {
      return {
        kind: "skipped",
        skipped: skipped(
          candidate,
          "unsupported-form-target",
          "Structured Replace All does not batch-edit reusable PDF objects.",
        ),
      };
    }
    const plan = buildEditPlan({
      pageIndex: analysis.pageIndex,
      contentStreamIndex: locator.contentStreamIndex,
      formPath: null,
      operatorIndex: match.locatedOperator.operatorIndex,
      operator: match.operator,
      replacementText: candidate.replacementText,
      resolvedFont: profile.resolvedFont,
      fontMetrics: profile.metrics,
      embeddedGlyphEvidence: profile.embeddedGlyphEvidence,
      embeddedProgramSha256: profile.embeddedProgramSha256,
      shapingWriteEvidence: shaping.evidence,
    });
    if (!isValidatedEditPlan(plan)) {
      return {
        kind: "skipped",
        skipped: skipped(
          candidate,
          "plan-rejected",
          plan.reason,
        ),
      };
    }
    validatedPlans = [plan];
  } else {
    const contentStreamIndex =
      fragmented?.contentStreamIndex ?? stream.contentStreamIndex;
    const operatorIndices =
      fragmented?.operatorIndices ?? stream.operatorIndices;
    const allOperators =
      fragmented?.allOperators ??
      allOperatorsForStream(analysis, contentStreamIndex);

    const multiPlan = buildMultiRunEditPlan({
      pageIndex: analysis.pageIndex,
      contentStreamIndex,
      allOperators,
      operatorIndices,
      replacementText: candidate.replacementText,
      resolvedFont: profile.resolvedFont,
      fontMetrics: profile.metrics,
      embeddedGlyphEvidence: profile.embeddedGlyphEvidence,
      embeddedProgramSha256: profile.embeddedProgramSha256,
      shapingWriteEvidence: shaping.evidence,
    });
    if (!isValidatedMultiRunEditPlan(multiPlan)) {
      return {
        kind: "skipped",
        skipped: skipped(
          candidate,
          "plan-rejected",
          multiPlan.reason,
        ),
      };
    }
    validatedPlans = [...multiPlan.subPlans];
  }

  const originalText = validatedPlans
    .map((plan) => plan.originalText)
    .join("");
  if (originalText !== candidate.originalText) {
    return {
      kind: "skipped",
      skipped: skipped(
        candidate,
        "stale-original-text",
        "The native PDF text changed after the search index was built. Re-run Find before replacing.",
      ),
    };
  }

  const layout = decideReplacementLayout(validatedPlans[0]);
  if (!layout.safeToApplyWithCurrentWriter) {
    return {
      kind: "skipped",
      skipped: skipped(
        candidate,
        "layout-blocked",
        layout.reason ??
          "This replacement does not fit the original native text geometry safely.",
      ),
    };
  }

  return {
    kind: "validated",
    unit: {
      candidate,
      plans: validatedPlans,
      bytesPerCode: profile.bytesPerCode,
      contentStreamIndex:
        validatedPlans[0].contentStreamIndex,
      operatorIndices: validatedPlans.map((plan) => plan.operatorIndex),
      fontResourceName: firstResourceName,
    },
  };
}

/**
 * Builds write-ready proof objects for one page without mutating PDF bytes.
 * All candidate-level failures are returned explicitly so the caller can
 * present an honest "safe / skipped" summary before committing anything.
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
  const skippedCandidates: StructuredReplaceWriteSkippedCandidate[] = [];

  for (const candidate of pagePlan.candidates) {
    const result = await preflightCandidate({
      analysis,
      candidate,
      dependencies,
    });
    if (result.kind === "validated") units.push(result.unit);
    else skippedCandidates.push(result.skipped);
  }

  return {
    pageIndex: pagePlan.pageIndex,
    requestedMatchCount: pagePlan.plannedMatchCount,
    validatedMatchCount: units.reduce(
      (total, unit) => total + unit.candidate.matchIds.length,
      0,
    ),
    units,
    skipped: skippedCandidates,
  };
}
