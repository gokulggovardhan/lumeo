import type { LocatedTextOperator } from "./formXObjects.ts";
import type { NativeDetectedTextSpan } from "./nativeTextDetection.ts";
import type { DetectedTextRun } from "./textRuns.ts";

export type TextReconciliationConfidence =
  | "high"
  | "medium"
  | "low"
  | "unreconciled";

export type TextUnicodeAgreement =
  | "exact"
  | "fragment-prefix"
  | "unknown"
  | "conflict";

export type TextDirectionAgreement =
  | "agree"
  | "unknown"
  | "conflict";

export type TextReconciliationEvidence = {
  source: "reconciled" | "pdfjs-only" | "native-only";
  confidence: TextReconciliationConfidence;
  unicodeAgreement: TextUnicodeAgreement;
  positionDistancePt: number | null;
  widthDeltaPt: number | null;
  fontSizeDeltaPt: number | null;
  directionAgreement: TextDirectionAgreement;
  score: number;
};

export type ReconciledDetectedTextRun = {
  run: DetectedTextRun;
  locatedOperator: LocatedTextOperator | null;
  nativeSpan: NativeDetectedTextSpan | null;
  evidence: TextReconciliationEvidence;
};

function normalizedText(value: string): string {
  return value.normalize("NFC");
}

function unicodeAgreement(
  pdfJs: string,
  nativeText: string | null,
): TextUnicodeAgreement {
  if (nativeText === null) return "unknown";
  const left = normalizedText(pdfJs);
  const right = normalizedText(nativeText);
  if (left === right) return "exact";
  if (left.startsWith(right) || right.startsWith(left)) {
    return "fragment-prefix";
  }
  return "conflict";
}

function directionAgreement(
  pdfJsDirection: string | null | undefined,
  native: NativeDetectedTextSpan,
): TextDirectionAgreement {
  const nativeWriting = native.fontProfile?.resolvedFont.writingMode;
  if (!pdfJsDirection || !nativeWriting || nativeWriting === "unknown") {
    return "unknown";
  }
  const pdfVertical =
    pdfJsDirection === "ttb" ||
    pdfJsDirection === "btt" ||
    pdfJsDirection === "vertical";
  const nativeVertical = nativeWriting === "vertical";
  return pdfVertical === nativeVertical ? "agree" : "conflict";
}

function originPt(
  run: DetectedTextRun,
  pageWidthPt: number,
  pageHeightPt: number,
): { x: number; y: number } {
  return {
    x: (run.xPct / 100) * pageWidthPt,
    y: (run.yPct / 100) * pageHeightPt,
  };
}

function scoreCandidate({
  pdfJsRun,
  native,
  pageWidthPt,
  pageHeightPt,
  pdfJsIndex,
  nativeIndex,
}: {
  pdfJsRun: DetectedTextRun;
  native: NativeDetectedTextSpan;
  pageWidthPt: number;
  pageHeightPt: number;
  pdfJsIndex: number;
  nativeIndex: number;
}): TextReconciliationEvidence | null {
  if (!native.run) return null;

  const pdfOrigin = originPt(pdfJsRun, pageWidthPt, pageHeightPt);
  const nativeOrigin = originPt(native.run, pageWidthPt, pageHeightPt);
  const positionDistancePt = Math.hypot(
    pdfOrigin.x - nativeOrigin.x,
    pdfOrigin.y - nativeOrigin.y,
  );

  const sizeBasis = Math.max(
    1,
    Math.min(pdfJsRun.fontSizePt, native.run.fontSizePt),
  );
  const maxPositionDistancePt = Math.max(2.5, sizeBasis * 0.25);
  if (positionDistancePt > maxPositionDistancePt) return null;

  const unicode = unicodeAgreement(pdfJsRun.str, native.decode.text);
  const direction = directionAgreement(pdfJsRun.pdfJsDirection, native);
  const widthDeltaPt = Math.abs(
    (pdfJsRun.widthPct / 100) * pageWidthPt -
      (native.run.widthPct / 100) * pageWidthPt,
  );
  const fontSizeDeltaPt = Math.abs(
    pdfJsRun.fontSizePt - native.run.fontSizePt,
  );

  let score = 0;
  if (unicode === "exact") score += 50;
  else if (unicode === "fragment-prefix") score += 26;
  else if (unicode === "unknown") score += 4;
  else score -= 35;

  if (positionDistancePt <= 0.5) score += 30;
  else if (positionDistancePt <= 1.5) score += 22;
  else score += 10;

  if (fontSizeDeltaPt <= 0.25) score += 10;
  else if (fontSizeDeltaPt <= 1) score += 5;
  else if (fontSizeDeltaPt > Math.max(2, sizeBasis * 0.25)) score -= 8;

  if (widthDeltaPt <= 0.75) score += 6;
  else if (widthDeltaPt <= Math.max(2, sizeBasis * 0.2)) score += 3;

  if (direction === "agree") score += 5;
  else if (direction === "conflict") score -= 20;

  const orderDistance = Math.abs(pdfJsIndex - nativeIndex);
  if (orderDistance === 0) score += 4;
  else if (orderDistance <= 2) score += 2;

  const confidence: TextReconciliationConfidence =
    score >= 78
      ? "high"
      : score >= 55
        ? "medium"
        : score >= 35
          ? "low"
          : "unreconciled";

  return {
    source: "reconciled",
    confidence,
    unicodeAgreement: unicode,
    positionDistancePt,
    widthDeltaPt,
    fontSizeDeltaPt,
    directionAgreement: direction,
    score,
  };
}

function boxesOverlap(
  a: DetectedTextRun,
  b: DetectedTextRun,
  paddingPct = 0.2,
): boolean {
  const aLeft = a.xPct - paddingPct;
  const aTop = a.yPct - paddingPct;
  const aRight = a.xPct + a.widthPct + paddingPct;
  const aBottom = a.yPct + a.heightPct + paddingPct;
  const bLeft = b.xPct - paddingPct;
  const bTop = b.yPct - paddingPct;
  const bRight = b.xPct + b.widthPct + paddingPct;
  const bBottom = b.yPct + b.heightPct + paddingPct;
  return (
    aLeft <= bRight &&
    aRight >= bLeft &&
    aTop <= bBottom &&
    aBottom >= bTop
  );
}

function nativeCoveredByPdfJs(
  nativeRun: DetectedTextRun,
  pdfJsRuns: readonly DetectedTextRun[],
): boolean {
  return pdfJsRuns.some((run) => boxesOverlap(nativeRun, run));
}

export function reconcileTextDetections({
  pdfJsRuns,
  nativeSpans,
  pageWidthPt,
  pageHeightPt,
}: {
  pdfJsRuns: readonly DetectedTextRun[];
  nativeSpans: readonly NativeDetectedTextSpan[];
  pageWidthPt: number;
  pageHeightPt: number;
}): ReconciledDetectedTextRun[] {
  const usedNative = new Set<number>();
  const reconciled: ReconciledDetectedTextRun[] = [];

  pdfJsRuns.forEach((pdfJsRun, pdfJsIndex) => {
    let bestIndex = -1;
    let bestEvidence: TextReconciliationEvidence | null = null;

    nativeSpans.forEach((native, nativeIndex) => {
      if (usedNative.has(nativeIndex)) return;
      const evidence = scoreCandidate({
        pdfJsRun,
        native,
        pageWidthPt,
        pageHeightPt,
        pdfJsIndex,
        nativeIndex,
      });
      if (!evidence) return;
      if (!bestEvidence || evidence.score > bestEvidence.score) {
        bestIndex = nativeIndex;
        bestEvidence = evidence;
      }
    });

    const selectedEvidence = bestEvidence as TextReconciliationEvidence | null;
    if (
      bestIndex >= 0 &&
      selectedEvidence !== null &&
      selectedEvidence.confidence !== "unreconciled"
    ) {
      usedNative.add(bestIndex);
      const native = nativeSpans[bestIndex];
      reconciled.push({
        run: {
          ...pdfJsRun,
          detectionSource: "reconciled",
          detectionConfidence: selectedEvidence.confidence,
        },
        locatedOperator: native.locatedOperator,
        nativeSpan: native,
        evidence: selectedEvidence,
      });
      return;
    }

    reconciled.push({
      run: {
        ...pdfJsRun,
        detectionSource: "pdfjs",
        detectionConfidence: "unreconciled",
      },
      locatedOperator: null,
      nativeSpan: null,
      evidence: {
        source: "pdfjs-only",
        confidence: "unreconciled",
        unicodeAgreement: "unknown",
        positionDistancePt: null,
        widthDeltaPt: null,
        fontSizeDeltaPt: null,
        directionAgreement: "unknown",
        score: 0,
      },
    });
  });

  nativeSpans.forEach((native, nativeIndex) => {
    if (usedNative.has(nativeIndex) || !native.run) return;
    // PDF.js commonly merges adjacent native Tj/TJ operators into one visual
    // item. Do not add a duplicate native-only run inside a region PDF.js
    // already represents; native-only fallback is reserved for genuinely
    // missed visual text regions.
    if (nativeCoveredByPdfJs(native.run, pdfJsRuns)) return;

    reconciled.push({
      run: {
        ...native.run,
        detectionSource: "native",
        detectionConfidence: "high",
      },
      locatedOperator: native.locatedOperator,
      nativeSpan: native,
      evidence: {
        source: "native-only",
        confidence: "high",
        unicodeAgreement: native.decode.complete ? "exact" : "unknown",
        positionDistancePt: 0,
        widthDeltaPt: 0,
        fontSizeDeltaPt: 0,
        directionAgreement: "unknown",
        score: native.decode.complete ? 100 : 70,
      },
    });
  });

  return reconciled;
}
