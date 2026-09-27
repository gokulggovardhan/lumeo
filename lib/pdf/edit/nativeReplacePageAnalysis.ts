import type { PDFDocument } from "pdf-lib";
import type { PDFPageProxy } from "pdfjs-dist";
import {
  PAGE_RENDER_TIMEOUT_MS,
  withPageTimeout,
} from "../pdfjs.ts";
import {
  buildPdfPageTextModel,
  type PdfPageTextModel,
} from "./documentModel.ts";
import {
  buildNativeContentStreamSpans,
  nativeDetectedRuns,
  type NativeContentStreamSpan,
} from "./nativeTextDetection.ts";
import {
  buildTextEditArbitrations,
  finalizeTextEditArbitration,
  reconcileTextSignals,
  type TextEditArbitration,
  type TextSignalReconciliation,
} from "./textReconciliation.ts";
import {
  classifyNativeTextSpan,
  enforceSpanCapabilityOnArbitration,
} from "./textCapabilityClassifier.ts";
import {
  buildOperatorSpatialIndex,
  matchDetectedRunToOperatorIndexed,
} from "./matchTextRun.ts";
import {
  reconstructFragmentedRun,
  type FragmentedRunReconstruction,
} from "./fragmentedRun.ts";
import {
  textRunsFromContent,
  type DetectedTextRun,
} from "./textRuns.ts";
import type { LocatedTextOperator } from "./formXObjects.ts";
import type { PdfFontProfile, PdfFontRegistry } from "./fontRegistry.ts";

export type NativeReplaceRunMatch =
  | {
      locatedOperator: LocatedTextOperator;
      operator: LocatedTextOperator["operator"];
    }
  | null;

export type NativeReplacePageAnalysis = Readonly<{
  pageIndex: number;
  widthPt: number;
  heightPt: number;
  runs: readonly DetectedTextRun[];
  pageOperators: readonly LocatedTextOperator[];
  nativeSpans: readonly NativeContentStreamSpan[];
  reconciliations: readonly TextSignalReconciliation[];
  arbitrations: readonly TextEditArbitration[];
  provenanceMatches: readonly NativeReplaceRunMatch[];
  editableRunMatches: readonly NativeReplaceRunMatch[];
  fontProfiles: readonly (PdfFontProfile | null)[];
  fragmentedRunReconstructions: ReadonlyMap<number, FragmentedRunReconstruction>;
  pageTextModel: PdfPageTextModel;
}>;

export type AnalyzeNativeReplacePageDependencies = Readonly<{
  collectPageTextOperators(
    doc: PDFDocument,
    pageIndex: number,
  ): LocatedTextOperator[];
  fontRegistry: Pick<PdfFontRegistry, "resolve">;
}>;

/**
 * Rebuilds the same native text evidence used by the live editor for a page
 * that may not currently be visible.
 *
 * This function is intentionally read-only. It does not return write
 * authority by itself; callers still must build normal EditPlan or
 * MultiRunEditPlan instances and pass every shaping/layout/writer guard.
 */
export async function analyzeNativeReplacePage({
  page,
  pdfDocument,
  pageIndex,
  dependencies,
}: {
  page: Pick<PDFPageProxy, "getViewport" | "getTextContent">;
  pdfDocument: PDFDocument;
  pageIndex: number;
  dependencies: AnalyzeNativeReplacePageDependencies;
}): Promise<NativeReplacePageAnalysis> {
  if (!Number.isInteger(pageIndex) || pageIndex < 0) {
    throw new Error("Native Replace All page index must be a non-negative integer.");
  }

  const viewport = page.getViewport({ scale: 1 });
  const content = await withPageTimeout(
    page.getTextContent(),
    pageIndex + 1,
    PAGE_RENDER_TIMEOUT_MS,
    "extract text from",
  );
  let runs = textRunsFromContent(
    content.items as never,
    viewport.transform,
    viewport.width,
    viewport.height,
    content.styles as never,
  );

  const located = dependencies.collectPageTextOperators(pdfDocument, pageIndex);
  const nativeSpans = buildNativeContentStreamSpans({
    operators: located,
    viewportTransform: viewport.transform,
    pageWidthPt: viewport.width,
    pageHeightPt: viewport.height,
    resolveFontProfile: (locatedOperator) => {
      const resourceName = locatedOperator.operator.fontResourceName;
      if (!resourceName) return null;
      try {
        return dependencies.fontRegistry.resolve(
          locatedOperator.resources,
          resourceName,
        );
      } catch {
        return null;
      }
    },
  });

  if (runs.length === 0) {
    runs = nativeDetectedRuns(nativeSpans);
  }

  const flatOperators = located.map((item) => item.operator);
  const operatorIndex = buildOperatorSpatialIndex(
    flatOperators,
    viewport.transform,
  );
  const locatedByOperator = new Map(
    located.map((item) => [item.operator, item] as const),
  );
  const nativeByKey = new Map(
    nativeSpans.map((span) => [span.key, span] as const),
  );

  const legacyMatches = runs.map((run): NativeReplaceRunMatch => {
    if (run.nativeSourceKey) {
      const native = nativeByKey.get(run.nativeSourceKey);
      return native
        ? {
            locatedOperator: native.locatedOperator,
            operator: native.locatedOperator.operator,
          }
        : null;
    }
    const matchedOperator = matchDetectedRunToOperatorIndexed(
      run,
      viewport.width,
      viewport.height,
      operatorIndex,
    );
    if (!matchedOperator) return null;
    const locatedOperator = locatedByOperator.get(matchedOperator);
    return locatedOperator
      ? { locatedOperator, operator: matchedOperator }
      : null;
  });

  const reconciliations = reconcileTextSignals({
    runs,
    legacyMatches,
    nativeSpans,
    viewportTransform: viewport.transform,
  });

  const provenanceMatches = runs.map(
    (run, index): NativeReplaceRunMatch => {
      if (run.nativeSourceKey) {
        const native = nativeByKey.get(run.nativeSourceKey);
        return native
          ? {
              locatedOperator: native.locatedOperator,
              operator: native.locatedOperator.operator,
            }
          : null;
      }
      const legacy = legacyMatches[index];
      const reconciliation = reconciliations[index];
      if (
        reconciliation?.confidence === "high" &&
        reconciliation.nativeSpanKey &&
        reconciliation.source === "evidence-match"
      ) {
        const evidence = nativeByKey.get(reconciliation.nativeSpanKey);
        if (evidence) {
          return {
            locatedOperator: evidence.locatedOperator,
            operator: evidence.locatedOperator.operator,
          };
        }
      }
      return legacy;
    },
  );

  const initialArbitrations = buildTextEditArbitrations({
    runs,
    reconciliations,
    nativeSpans,
  });

  // Mirror EditPdfTool's first authority layer: an editable arbitration with
  // an exact native span key may point more strongly than a legacy positional
  // provenance match. Final structural capability gating is applied below.
  const authorizedMatches = initialArbitrations.map(
    (arbitration): NativeReplaceRunMatch => {
      if (arbitration.decision !== "editable" || !arbitration.nativeSpanKey) {
        return null;
      }
      const native = nativeByKey.get(arbitration.nativeSpanKey);
      return native
        ? {
            locatedOperator: native.locatedOperator,
            operator: native.locatedOperator.operator,
          }
        : null;
    },
  );

  const fontProfiles = runs.map((run, index) => {
    const match = provenanceMatches[index];
    const resourceName = match?.operator.fontResourceName;
    if (!match || !resourceName) return null;
    try {
      return dependencies.fontRegistry.resolve(
        match.locatedOperator.resources,
        resourceName,
      );
    } catch {
      return null;
    }
  });

  const fragmentedRunReconstructions = new Map<
    number,
    FragmentedRunReconstruction
  >();
  for (let index = 0; index < runs.length; index += 1) {
    const run = runs[index];
    const match = provenanceMatches[index];
    const profile = fontProfiles[index];
    if (!match || !profile) continue;
    const fragment = reconstructFragmentedRun({
      fullDetectedText: run.str,
      matched: match.locatedOperator,
      pageOperators: located,
      resolvedFont: profile.resolvedFont,
    });
    if (fragment) fragmentedRunReconstructions.set(index, fragment);
  }

  const nativeCapabilityByKey = new Map(
    nativeSpans.map(
      (span) => [span.key, classifyNativeTextSpan(span)] as const,
    ),
  );

  const arbitrations = runs.map((run, index) => {
    const arbitration =
      initialArbitrations[index] ??
      ({
        pdfJsRunIndex: index,
        decision: "view-only",
        nativeSpanKey: null,
        source: "unmatched",
        reason:
          "Edit authorization evidence has not been established for this run.",
      } satisfies TextEditArbitration);
    const finalized = finalizeTextEditArbitration({
      arbitration,
      run,
      reconciliation: reconciliations[index] ?? null,
      fragmentedReconstructionProven:
        fragmentedRunReconstructions.has(index),
    });
    const spanClassification = finalized.nativeSpanKey
      ? nativeCapabilityByKey.get(finalized.nativeSpanKey) ?? null
      : null;
    return enforceSpanCapabilityOnArbitration({
      arbitration: finalized,
      spanClassification,
    });
  });

  const editableRunMatches = runs.map(
    (_run, index): NativeReplaceRunMatch => {
      if (arbitrations[index]?.decision !== "editable") return null;
      return authorizedMatches[index] ?? provenanceMatches[index] ?? null;
    },
  );

  const pageTextModel = buildPdfPageTextModel({
    pageIndex,
    widthPt: viewport.width,
    heightPt: viewport.height,
    runs,
    matches: editableRunMatches,
    fontProfiles,
    fragmentedRunIndices: new Set(fragmentedRunReconstructions.keys()),
  });

  return {
    pageIndex,
    widthPt: viewport.width,
    heightPt: viewport.height,
    runs,
    pageOperators: located,
    nativeSpans,
    reconciliations,
    arbitrations,
    provenanceMatches,
    editableRunMatches,
    fontProfiles,
    fragmentedRunReconstructions,
    pageTextModel,
  };
}
