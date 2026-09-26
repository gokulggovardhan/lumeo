import type { PdfTextSourceMatch } from "./documentModel.ts";
import type { NativeContentStreamSpan } from "./nativeTextDetection.ts";
import { locatedTextOperatorKey } from "./nativeTextDetection.ts";
import { transformPoint2x3, type DetectedTextRun } from "./textRuns.ts";

export type TextSignalAgreement = "exact" | "unicode-normalized" | "different" | "unknown";
export type TextReconciliationConfidence = "high" | "medium" | "low" | "unmatched";

export type TextSignalReconciliation = {
  pdfJsRunIndex: number;
  nativeSpanKey: string | null;
  confidence: TextReconciliationConfidence;
  agreement: TextSignalAgreement;
  baselineDistancePt: number | null;
  angleDeltaDeg: number | null;
  source: "legacy-source-match" | "evidence-match" | "unmatched";
  reason: string;
};

export type TextEditArbitrationDecision = "editable" | "view-only";
export type TextEditArbitrationSource =
  | "reconciled"
  | "native-only-safe-synthesis"
  | "fragmented-reconstruction"
  | "conflict"
  | "pdfjs-only"
  | "unmatched";

export type TextEditArbitration = {
  pdfJsRunIndex: number;
  decision: TextEditArbitrationDecision;
  nativeSpanKey: string | null;
  source: TextEditArbitrationSource;
  reason: string;
};

/**
 * One choke point decides whether a detected run is allowed to become a
 * native edit target. Reconciliation/provenance and edit authorization are
 * deliberately separate concepts:
 *
 * - PDF.js-only, unmatched, low/medium-confidence or conflicting evidence is
 *   view-only.
 * - Native-only text is editable only when the independent native detector
 *   already produced its exact-simple-run synthesis (complete decoding,
 *   resolved font metrics/ascent/descent and safe simple geometry).
 * - A normal PDF.js run needs a high-confidence Unicode + geometry
 *   reconciliation to one native source operator.
 *
 * This function never guesses past missing evidence. Callers may retain
 * lower-confidence provenance for diagnostics/fragment reconstruction, but
 * must not use that provenance as write authorization.
 */
export function arbitrateTextEditability({
  run,
  reconciliation,
  nativeSpan,
  runIndex,
}: {
  run: DetectedTextRun;
  reconciliation: TextSignalReconciliation | null;
  nativeSpan: NativeContentStreamSpan | null;
  runIndex: number;
}): TextEditArbitration {
  if (run.detectionSource === "native") {
    const safeNativeSynthesis =
      Boolean(run.nativeSourceKey) &&
      nativeSpan !== null &&
      nativeSpan.key === run.nativeSourceKey &&
      nativeSpan.decodeComplete &&
      nativeSpan.geometryConfidence === "exact-simple-run" &&
      nativeSpan.detectedRun !== null &&
      nativeSpan.detectedRun.nativeSourceKey === run.nativeSourceKey &&
      nativeSpan.fontProfile !== null &&
      nativeSpan.limitationReason === null;

    return safeNativeSynthesis
      ? {
          pdfJsRunIndex: runIndex,
          decision: "editable",
          nativeSpanKey: nativeSpan!.key,
          source: "native-only-safe-synthesis",
          reason:
            "Native-only text cleared the existing safe-synthesis proof: complete decoding, resolved font metrics and exact simple geometry.",
        }
      : {
          pdfJsRunIndex: runIndex,
          decision: "view-only",
          nativeSpanKey: nativeSpan?.key ?? run.nativeSourceKey ?? null,
          source: nativeSpan ? "conflict" : "unmatched",
          reason:
            "Native-only text did not clear every safe-synthesis proof required for direct editing.",
        };
  }

  if (!reconciliation) {
    return {
      pdfJsRunIndex: runIndex,
      decision: "view-only",
      nativeSpanKey: null,
      source: "pdfjs-only",
      reason: "PDF.js detected visible text, but no independent native reconciliation result exists.",
    };
  }

  const textAgrees =
    reconciliation.agreement === "exact" ||
    reconciliation.agreement === "unicode-normalized";
  const measuredGeometry =
    reconciliation.baselineDistancePt !== null &&
    reconciliation.angleDeltaDeg !== null;
  const hasExportBaselineEvidence =
    (typeof run.baselineYPct === "number" && Number.isFinite(run.baselineYPct)) ||
    (typeof nativeSpan?.fontProfile?.ascentRatio === "number" &&
      Number.isFinite(nativeSpan.fontProfile.ascentRatio)) ||
    (typeof run.ascentRatio === "number" && Number.isFinite(run.ascentRatio));
  const sourceAgrees =
    reconciliation.confidence === "high" &&
    measuredGeometry &&
    hasExportBaselineEvidence &&
    Boolean(reconciliation.nativeSpanKey) &&
    nativeSpan?.key === reconciliation.nativeSpanKey &&
    nativeSpan.decodeComplete;

  if (textAgrees && sourceAgrees) {
    return {
      pdfJsRunIndex: runIndex,
      decision: "editable",
      nativeSpanKey: reconciliation.nativeSpanKey,
      source: "reconciled",
      reason:
        "PDF.js and native content-stream evidence agree at high confidence on Unicode and geometry.",
    };
  }

  const missingGeometryEvidence =
    reconciliation.confidence === "high" &&
    (!measuredGeometry || !hasExportBaselineEvidence);
  const conflict =
    reconciliation.agreement === "different" ||
    reconciliation.confidence === "low" ||
    reconciliation.confidence === "medium" ||
    missingGeometryEvidence;

  return {
    pdfJsRunIndex: runIndex,
    decision: "view-only",
    nativeSpanKey: reconciliation.nativeSpanKey,
    source: conflict ? "conflict" : reconciliation.nativeSpanKey ? "conflict" : "unmatched",
    reason: missingGeometryEvidence
      ? "Text identity agrees, but measured PDF.js/native geometry and a safe export baseline are not both available."
      : conflict
        ? "PDF.js and native evidence conflict or are not strong enough to authorize a native rewrite."
        : "No native source operator satisfied the edit-authorization evidence threshold.",
  };
}

/**
 * Applies the separate, stronger fragmented-run proof after the initial
 * one-run signal arbitration. A PDF.js visual run may legitimately span
 * several byte-adjacent Tj/TJ operators, so no single native span can agree
 * with the whole visible string. That single-span conflict remains visible,
 * but an exact fragmented reconstruction may independently authorize the
 * established multi-run writer.
 *
 * The caller may pass true only after reconstructFragmentedRun() has proven:
 * consecutive page-stream operators, identical text state/resource scope,
 * ignorable gaps only, complete decoding, and exact concatenated Unicode.
 */
export function finalizeTextEditArbitration(
  arbitration: TextEditArbitration,
  fragmentedReconstructionProven: boolean,
): TextEditArbitration {
  if (!fragmentedReconstructionProven || arbitration.decision === "editable") {
    return arbitration;
  }

  return {
    ...arbitration,
    decision: "editable",
    source: "fragmented-reconstruction",
    reason:
      "Single-operator reconciliation is insufficient, but exact consecutive fragmented-run reconstruction proved the full visible text and writer scope.",
  };
}

export function buildTextEditArbitrations({
  runs,
  reconciliations,
  nativeSpans,
}: {
  runs: readonly DetectedTextRun[];
  reconciliations: readonly TextSignalReconciliation[];
  nativeSpans: readonly NativeContentStreamSpan[];
}): TextEditArbitration[] {export function buildTextEditArbitrations({
  runs,
  reconciliations,
  nativeSpans,
}: {
  runs: readonly DetectedTextRun[];
  reconciliations: readonly TextSignalReconciliation[];
  nativeSpans: readonly NativeContentStreamSpan[];
}): TextEditArbitration[] {
  const nativeByKey = new Map(nativeSpans.map((span) => [span.key, span] as const));
  return runs.map((run, index) => {
    const reconciliation = reconciliations[index] ?? null;
    const nativeKey = run.nativeSourceKey ?? reconciliation?.nativeSpanKey ?? null;
    return arbitrateTextEditability({
      run,
      reconciliation,
      nativeSpan: nativeKey ? nativeByKey.get(nativeKey) ?? null : null,
      runIndex: index,
    });
  });
}

function normalizeText(value: string): string {
  return value.normalize("NFC");
}

function angleDeg(x: number, y: number): number {
  return (Math.atan2(y, x) * 180) / Math.PI;
}

function angleDistance(a: number, b: number): number {
  const raw = Math.abs(a - b) % 360;
  return raw > 180 ? 360 - raw : raw;
}

function pdfJsBaseline(run: DetectedTextRun, viewportTransform: readonly number[]): {
  x: number;
  y: number;
  angle: number;
} | null {
  if (!run.pdfJsTransform || run.pdfJsTransform.length < 6) return null;
  const tx = transformPoint2x3([...viewportTransform], [...run.pdfJsTransform]);
  return { x: tx[4], y: tx[5], angle: angleDeg(tx[0], tx[1]) };
}

function nativeBaseline(
  span: NativeContentStreamSpan,
  viewportTransform: readonly number[],
): { x: number; y: number; angle: number } {
  const tx = transformPoint2x3(
    [...viewportTransform],
    [...span.locatedOperator.operator.textRenderingMatrix],
  );
  return { x: tx[4], y: tx[5], angle: angleDeg(tx[0], tx[1]) };
}

function agreementFor(run: DetectedTextRun, span: NativeContentStreamSpan): TextSignalAgreement {
  if (!span.decodeComplete) return "unknown";
  if (run.str === span.text) return "exact";
  if (normalizeText(run.str) === normalizeText(span.text)) return "unicode-normalized";
  return "different";
}

function metrics(
  run: DetectedTextRun,
  span: NativeContentStreamSpan,
  viewportTransform: readonly number[],
): { baselineDistancePt: number | null; angleDeltaDeg: number | null } {
  const left = pdfJsBaseline(run, viewportTransform);
  if (!left) return { baselineDistancePt: null, angleDeltaDeg: null };
  const right = nativeBaseline(span, viewportTransform);
  return {
    baselineDistancePt: Math.hypot(left.x - right.x, left.y - right.y),
    angleDeltaDeg: angleDistance(left.angle, right.angle),
  };
}

function thresholdFor(run: DetectedTextRun): number {
  return Math.max(1.25, run.fontSizePt * 0.22);
}

export function reconcileTextSignals({
  runs,
  legacyMatches,
  nativeSpans,
  viewportTransform,
}: {
  runs: readonly DetectedTextRun[];
  legacyMatches: readonly PdfTextSourceMatch[];
  nativeSpans: readonly NativeContentStreamSpan[];
  viewportTransform: readonly number[];
}): TextSignalReconciliation[] {
  const nativeByKey = new Map(nativeSpans.map((span) => [span.key, span] as const));
  const claimed = new Set<string>();
  const results: TextSignalReconciliation[] = [];

  for (let index = 0; index < runs.length; index += 1) {
    const run = runs[index];
    const directKey = run.nativeSourceKey ?? (
      legacyMatches[index]
        ? locatedTextOperatorKey(legacyMatches[index]!.locatedOperator)
        : null
    );
    const direct = directKey ? nativeByKey.get(directKey) ?? null : null;

    let rejectedDirect:
      | {
          span: NativeContentStreamSpan;
          agreement: TextSignalAgreement;
          baselineDistancePt: number | null;
          angleDeltaDeg: number | null;
        }
      | null = null;

    if (direct) {
      const agreement = agreementFor(run, direct);
      const measured = metrics(run, direct, viewportTransform);
      const close =
        measured.baselineDistancePt === null ||
        measured.baselineDistancePt <= thresholdFor(run);
      const aligned =
        measured.angleDeltaDeg === null || measured.angleDeltaDeg <= 3;
      const confidence =
        (agreement === "exact" || agreement === "unicode-normalized") && close && aligned
          ? "high"
          : agreement === "different"
            ? "low"
            : "medium";

      if (confidence === "high" || run.nativeSourceKey) {
        claimed.add(direct.key);
        results.push({
          pdfJsRunIndex: index,
          nativeSpanKey: direct.key,
          confidence,
          agreement,
          baselineDistancePt: measured.baselineDistancePt,
          angleDeltaDeg: measured.angleDeltaDeg,
          source: run.nativeSourceKey ? "evidence-match" : "legacy-source-match",
          reason:
            confidence === "high"
              ? "Native content-stream text and PDF.js extraction agree on text and geometry."
              : "The native-synthesized run retains its exact source operator even though independent PDF.js evidence is unavailable.",
        });
        continue;
      }

      rejectedDirect = {
        span: direct,
        agreement,
        baselineDistancePt: measured.baselineDistancePt,
        angleDeltaDeg: measured.angleDeltaDeg,
      };
    }

    let best:
      | { span: NativeContentStreamSpan; distance: number; angle: number; agreement: TextSignalAgreement }
      | null = null;

    for (const span of nativeSpans) {
      if (claimed.has(span.key) || !span.decodeComplete) continue;
      const agreement = agreementFor(run, span);
      if (agreement !== "exact" && agreement !== "unicode-normalized") continue;
      const measured = metrics(run, span, viewportTransform);
      if (measured.baselineDistancePt === null || measured.angleDeltaDeg === null) continue;
      if (measured.baselineDistancePt > thresholdFor(run) || measured.angleDeltaDeg > 3) continue;
      if (!best || measured.baselineDistancePt < best.distance) {
        best = {
          span,
          distance: measured.baselineDistancePt,
          angle: measured.angleDeltaDeg,
          agreement,
        };
      }
    }

    if (best) {
      claimed.add(best.span.key);
      results.push({
        pdfJsRunIndex: index,
        nativeSpanKey: best.span.key,
        confidence: "high",
        agreement: best.agreement,
        baselineDistancePt: best.distance,
        angleDeltaDeg: best.angle,
        source: "evidence-match",
        reason: "Exact decoded text plus baseline and writing-angle agreement identified the native source operator.",
      });
    } else if (rejectedDirect) {
      results.push({
        pdfJsRunIndex: index,
        nativeSpanKey: rejectedDirect.span.key,
        confidence: "low",
        agreement: rejectedDirect.agreement,
        baselineDistancePt: rejectedDirect.baselineDistancePt,
        angleDeltaDeg: rejectedDirect.angleDeltaDeg,
        source: "legacy-source-match",
        reason: "The legacy position match disagrees with PDF.js text, and no better text-and-geometry match was found.",
      });
    } else {
      results.push({
        pdfJsRunIndex: index,
        nativeSpanKey: null,
        confidence: "unmatched",
        agreement: "unknown",
        baselineDistancePt: null,
        angleDeltaDeg: null,
        source: "unmatched",
        reason: "No native source operator satisfied the text and geometry evidence threshold.",
      });
    }
  }

  return results;
}

export function reconciliationMatchMap(
  reconciliations: readonly TextSignalReconciliation[],
  nativeSpans: readonly NativeContentStreamSpan[],
): ReadonlyMap<number, NativeContentStreamSpan> {
  const nativeByKey = new Map(nativeSpans.map((span) => [span.key, span] as const));
  const result = new Map<number, NativeContentStreamSpan>();
  for (const item of reconciliations) {
    if (item.confidence !== "high" || !item.nativeSpanKey) continue;
    const span = nativeByKey.get(item.nativeSpanKey);
    if (span) result.set(item.pdfJsRunIndex, span);
  }
  return result;
}
