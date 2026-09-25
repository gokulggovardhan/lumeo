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
