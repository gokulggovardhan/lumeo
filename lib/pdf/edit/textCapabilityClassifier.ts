import type { NativeContentStreamSpan } from "./nativeTextDetection.ts";
import type {
  TextEditArbitration,
  TextSignalReconciliation,
} from "./textReconciliation.ts";

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
  nativeSpanKey: string;
  category: DocumentTextCapabilityCategory;
  safelyRewritable: boolean;
  reason: string;
};

export type PageTextCapabilityClassification = {
  category: DocumentTextCapabilityCategory;
  spanClassifications: readonly SpanTextCapabilityClassification[];
  nativeSpanCount: number;
  pdfJsRunCount: number;
  reconciledHighConfidenceCount: number;
  nativeOnlySpanCount: number;
  pdfJsOnlyRunCount: number;
  rasterImageEvidence: boolean;
  reasons: readonly string[];
};

function matrixSkewMagnitudeDeg(matrix: readonly number[]): number {
  const x = (Math.atan2(matrix[1], matrix[0]) * 180) / Math.PI;
  const y = (Math.atan2(-matrix[2], matrix[3]) * 180) / Math.PI;
  const delta = Math.abs(y - x) % 180;
  return Math.min(delta, 180 - delta);
}

export function classifyNativeTextSpan(
  span: NativeContentStreamSpan,
): SpanTextCapabilityClassification {
  const operator = span.locatedOperator.operator;
  const profile = span.fontProfile;

  if (operator.renderMode >= 4) {
    return {
      nativeSpanKey: span.key,
      category: "CLIPPED_TEXT",
      safelyRewritable: false,
      reason: "The text participates in a clipping rendering mode.",
    };
  }
  if (profile?.kind === "Type3") {
    return {
      nativeSpanKey: span.key,
      category: "TYPE3_TEXT",
      safelyRewritable: false,
      reason: "Type3 glyph programs are not yet proven safe for native rewrite.",
    };
  }
  if (profile?.resourceIdentity.writingMode === "vertical") {
    return {
      nativeSpanKey: span.key,
      category: "VERTICAL_TEXT",
      safelyRewritable: false,
      reason: "The Type0 font uses a vertical CMap; vertical native rewrite is not yet proven safe.",
    };
  }
  if (span.locatedOperator.locator.kind === "xobject") {
    return {
      nativeSpanKey: span.key,
      category: "FORM_XOBJECT_TEXT",
      safelyRewritable: span.decodeComplete && profile?.encodingSource !== "Unknown",
      reason: "The text is inside a Form XObject and retains form-local resource scope.",
    };
  }
  if (!profile || profile.encodingSource === "Unknown" || !span.decodeComplete) {
    return {
      nativeSpanKey: span.key,
      category: "NATIVE_TEXT_WITH_ENCODING_LIMITATIONS",
      safelyRewritable: false,
      reason: "The source character encoding cannot be proven completely.",
    };
  }
  if (profile.metricsSource === "Unknown") {
    return {
      nativeSpanKey: span.key,
      category: "NATIVE_TEXT_WITH_FONT_LIMITATIONS",
      safelyRewritable: false,
      reason: "The source font exists, but deterministic glyph metrics are unavailable.",
    };
  }
  if (matrixSkewMagnitudeDeg(operator.textRenderingMatrix) > 4) {
    return {
      nativeSpanKey: span.key,
      category: "COMPLEX_VECTOR_TEXT",
      safelyRewritable: false,
      reason: "The text transform is materially skewed and is kept read-only.",
    };
  }

  return {
    nativeSpanKey: span.key,
    category: "NATIVE_TEXT",
    safelyRewritable: true,
    reason: "Native text has decodable source bytes, a resolved font and deterministic metrics.",
  };
}

/**
 * Final fail-closed bridge between signal reconciliation and native PDF
 * capability evidence.
 *
 * Signal arbitration answers "did the visible run and native source agree?"
 * It does not, by itself, know whether the agreed source uses a clipping
 * render mode, Type3 glyph program, vertical writing, missing metrics, etc.
 * This function prevents those structurally unsafe classes from being
 * advertised as editable merely because identity/geometry reconciliation was
 * strong. Writers still retain their own validation; this closes the UI/edit
 * authorization layer earlier.
 */
export function enforceSpanCapabilityOnArbitration({
  arbitration,
  spanClassification,
}: {
  arbitration: TextEditArbitration;
  spanClassification: SpanTextCapabilityClassification | null;
}): TextEditArbitration {
  if (
    arbitration.decision !== "editable" ||
    !spanClassification ||
    spanClassification.safelyRewritable
  ) {
    return arbitration;
  }

  return {
    ...arbitration,
    decision: "view-only",
    source: "conflict",
    reason:
      `Native capability classification blocks direct rewrite: ${spanClassification.reason}`,
  };
}

export class DocumentTextCapabilityClassifier {
  classifyPage({
    nativeSpans,
    pdfJsRunCount,
    reconciliations,
    rasterImageEvidence = false,
  }: {
    nativeSpans: readonly NativeContentStreamSpan[];
    pdfJsRunCount: number;
    reconciliations: readonly TextSignalReconciliation[];
    rasterImageEvidence?: boolean;
  }): PageTextCapabilityClassification {
    const spanClassifications = nativeSpans.map(classifyNativeTextSpan);
    const high = reconciliations.filter((item) => item.confidence === "high").length;
    const matchedNativeKeys = new Set(
      reconciliations
        .filter((item) => item.confidence === "high" && item.nativeSpanKey)
        .map((item) => item.nativeSpanKey as string),
    );
    const nativeOnlySpanCount = nativeSpans.filter((span) => !matchedNativeKeys.has(span.key)).length;
    const pdfJsOnlyRunCount = reconciliations.filter((item) => item.confidence === "unmatched").length;
    const reasons: string[] = [];

    let category: DocumentTextCapabilityCategory = "UNKNOWN_OR_UNSAFE";

    if (nativeSpans.length === 0 && pdfJsRunCount === 0) {
      category = rasterImageEvidence ? "SCANNED_IMAGE" : "UNKNOWN_OR_UNSAFE";
      reasons.push(
        rasterImageEvidence
          ? "No native text operators were found and raster image evidence is present."
          : "Neither native text nor PDF.js text extraction produced usable text evidence.",
      );
    } else if (nativeSpans.length > 0 && rasterImageEvidence) {
      category = "HYBRID_TEXT_AND_IMAGE";
      reasons.push("The page contains native text plus raster image content.");
    } else {
      const categories = new Set(spanClassifications.map((item) => item.category));
      const priority: DocumentTextCapabilityCategory[] = [
        "CLIPPED_TEXT",
        "TYPE3_TEXT",
        "NATIVE_TEXT_WITH_ENCODING_LIMITATIONS",
        "NATIVE_TEXT_WITH_FONT_LIMITATIONS",
        "COMPLEX_VECTOR_TEXT",
        "FORM_XOBJECT_TEXT",
        "VERTICAL_TEXT",
        "NATIVE_TEXT",
      ];
      category = priority.find((item) => categories.has(item)) ?? "UNKNOWN_OR_UNSAFE";
      if (nativeOnlySpanCount > 0) {
        reasons.push(
          `${nativeOnlySpanCount} native text span(s) were not independently confirmed by PDF.js.`,
        );
      }
      if (pdfJsOnlyRunCount > 0) {
        reasons.push(
          `${pdfJsOnlyRunCount} PDF.js text run(s) could not be mapped to native source operators.`,
        );
      }
      if (high > 0) {
        reasons.push(`${high} text run(s) have high-confidence native/PDF.js agreement.`);
      }
    }

    return {
      category,
      spanClassifications,
      nativeSpanCount: nativeSpans.length,
      pdfJsRunCount,
      reconciledHighConfidenceCount: high,
      nativeOnlySpanCount,
      pdfJsOnlyRunCount,
      rasterImageEvidence,
      reasons,
    };
  }
}
