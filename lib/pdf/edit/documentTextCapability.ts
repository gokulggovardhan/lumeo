import type { PageContentEvidence } from "./formXObjects.ts";
import type { NativeDetectedTextSpan } from "./nativeTextDetection.ts";
import type { ReconciledDetectedTextRun } from "./textReconciliation.ts";

export type DocumentTextCapabilityCategory =
  | "NATIVE_TEXT"
  | "SCANNED_IMAGE"
  | "HYBRID_TEXT_AND_IMAGE"
  | "NATIVE_TEXT_WITH_ENCODING_LIMITATIONS"
  | "NATIVE_TEXT_WITH_FONT_LIMITATIONS"
  | "COMPLEX_VECTOR_TEXT"
  | "TYPE3_TEXT"
  | "FORM_XOBJECT_TEXT"
  | "CLIPPED_TEXT"
  | "VERTICAL_TEXT"
  | "UNKNOWN_OR_UNSAFE";

export type SpanTextCapabilityClassification = {
  category: DocumentTextCapabilityCategory;
  safelyRewritable: boolean;
  reasons: readonly string[];
};

export type PageTextCapabilityClassification = {
  primary: DocumentTextCapabilityCategory;
  signals: readonly DocumentTextCapabilityCategory[];
  reasons: readonly string[];
  counts: {
    reconciledRuns: number;
    nativeOnlyRuns: number;
    pdfJsOnlyRuns: number;
    nativeOperators: number;
    imageXObjectInvocations: number;
    inlineImageInvocations: number;
    formXObjectInvocations: number;
    vectorPaintOperatorCount: number;
  };
};

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

export function classifySpanTextCapability(
  item: ReconciledDetectedTextRun,
): SpanTextCapabilityClassification {
  const reasons: string[] = [];
  const native = item.nativeSpan;
  const locatedOperator = item.locatedOperator;
  const operator = locatedOperator?.operator ?? null;
  const profile = native?.fontProfile ?? null;

  if (!native || !locatedOperator || !operator) {
    return {
      category: "UNKNOWN_OR_UNSAFE",
      safelyRewritable: false,
      reasons: ["No proven native source operator is reconciled to this visible text."],
    };
  }

  if (operator.renderMode >= 4) {
    return {
      category: "CLIPPED_TEXT",
      safelyRewritable: false,
      reasons: ["The text participates in a clipping rendering mode."],
    };
  }

  if (profile?.kind === "Type3") {
    return {
      category: "TYPE3_TEXT",
      safelyRewritable: false,
      reasons: ["Type3 glyph programs are not safely rewritable by the native text writer."],
    };
  }

  if (profile?.resolvedFont.writingMode === "vertical") {
    return {
      category: "VERTICAL_TEXT",
      safelyRewritable: false,
      reasons: ["Vertical writing metrics are not yet supported for native replacement."],
    };
  }

  if (
    !profile ||
    !native.decode.complete ||
    profile.encodingSource === "Unknown"
  ) {
    reasons.push(
      "The original glyph encoding cannot be reconstructed completely enough for safe replacement.",
    );
    return {
      category: "NATIVE_TEXT_WITH_ENCODING_LIMITATIONS",
      safelyRewritable: false,
      reasons,
    };
  }

  if (
    profile.metricsSource === "Unknown" ||
    native.advancePt === null ||
    native.positionReliability !== "proven"
  ) {
    reasons.push(
      "The font metrics or implicit native text position are not fully proven.",
    );
    return {
      category: "NATIVE_TEXT_WITH_FONT_LIMITATIONS",
      safelyRewritable: false,
      reasons,
    };
  }

  if (
    item.evidence.source === "reconciled" &&
    item.evidence.confidence !== "high" &&
    item.evidence.confidence !== "medium"
  ) {
    return {
      category: "UNKNOWN_OR_UNSAFE",
      safelyRewritable: false,
      reasons: ["Native and PDF.js text evidence does not reconcile with sufficient confidence."],
    };
  }

  if (
    item.evidence.unicodeAgreement === "conflict" ||
    item.evidence.directionAgreement === "conflict"
  ) {
    return {
      category: "UNKNOWN_OR_UNSAFE",
      safelyRewritable: false,
      reasons: ["Independent extraction signals materially disagree."],
    };
  }

  if (locatedOperator.locator.kind === "xobject") {
    return {
      category: "FORM_XOBJECT_TEXT",
      safelyRewritable: true,
      reasons: ["Text is inside a Form XObject with proven source/resource scope."],
    };
  }

  return {
    category: "NATIVE_TEXT",
    safelyRewritable: true,
    reasons: [],
  };
}

export class DocumentTextCapabilityClassifier {
  classifyPage({
    reconciled,
    nativeSpans,
    contentEvidence,
  }: {
    reconciled: readonly ReconciledDetectedTextRun[];
    nativeSpans: readonly NativeDetectedTextSpan[];
    contentEvidence: PageContentEvidence;
  }): PageTextCapabilityClassification {
    const spanClassifications = reconciled.map(classifySpanTextCapability);
    const signals = unique(
      spanClassifications.map((classification) => classification.category),
    );
    const reasons = unique(
      spanClassifications.flatMap((classification) => classification.reasons),
    );

    const reconciledRuns = reconciled.filter(
      (item) => item.evidence.source === "reconciled",
    ).length;
    const nativeOnlyRuns = reconciled.filter(
      (item) => item.evidence.source === "native-only",
    ).length;
    const pdfJsOnlyRuns = reconciled.filter(
      (item) => item.evidence.source === "pdfjs-only",
    ).length;

    const hasText = reconciled.length > 0 || nativeSpans.length > 0;
    const imageOnlyCandidate =
      !hasText &&
      contentEvidence.imageXObjectInvocations +
        contentEvidence.inlineImageInvocations >
        0;
    const hasNativeText = nativeSpans.some(
      (span) => span.decode.complete && span.decode.text?.trim(),
    );
    const hasImages =
      contentEvidence.imageXObjectInvocations +
        contentEvidence.inlineImageInvocations >
      0;

    let primary: DocumentTextCapabilityCategory;

    if (imageOnlyCandidate) {
      primary = "SCANNED_IMAGE";
      signals.push("SCANNED_IMAGE");
      reasons.push(
        "The page contains image content but no native/PDF.js text. It is an OCR candidate, not proof that the image contains text.",
      );
    } else if (!hasText) {
      primary =
        contentEvidence.vectorPaintOperatorCount > 0
          ? "COMPLEX_VECTOR_TEXT"
          : "UNKNOWN_OR_UNSAFE";
      signals.push(primary);
    } else if (hasNativeText && hasImages) {
      primary = "HYBRID_TEXT_AND_IMAGE";
      signals.push("HYBRID_TEXT_AND_IMAGE");
    } else if (signals.includes("NATIVE_TEXT_WITH_ENCODING_LIMITATIONS")) {
      primary = "NATIVE_TEXT_WITH_ENCODING_LIMITATIONS";
    } else if (signals.includes("NATIVE_TEXT_WITH_FONT_LIMITATIONS")) {
      primary = "NATIVE_TEXT_WITH_FONT_LIMITATIONS";
    } else if (signals.includes("TYPE3_TEXT")) {
      primary = "TYPE3_TEXT";
    } else if (signals.includes("CLIPPED_TEXT")) {
      primary = "CLIPPED_TEXT";
    } else if (signals.includes("VERTICAL_TEXT")) {
      primary = "VERTICAL_TEXT";
    } else if (
      signals.length > 0 &&
      signals.every(
        (signal) =>
          signal === "NATIVE_TEXT" || signal === "FORM_XOBJECT_TEXT",
      )
    ) {
      primary = signals.includes("FORM_XOBJECT_TEXT")
        ? "FORM_XOBJECT_TEXT"
        : "NATIVE_TEXT";
    } else {
      primary = "UNKNOWN_OR_UNSAFE";
      signals.push("UNKNOWN_OR_UNSAFE");
    }

    return {
      primary,
      signals: unique(signals),
      reasons: unique(reasons),
      counts: {
        reconciledRuns,
        nativeOnlyRuns,
        pdfJsOnlyRuns,
        nativeOperators: nativeSpans.length,
        imageXObjectInvocations: contentEvidence.imageXObjectInvocations,
        inlineImageInvocations: contentEvidence.inlineImageInvocations,
        formXObjectInvocations: contentEvidence.formXObjectInvocations,
        vectorPaintOperatorCount: contentEvidence.vectorPaintOperatorCount,
      },
    };
  }
}
