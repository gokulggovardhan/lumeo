import type { NativeContentStreamSpan } from "./nativeTextDetection.ts";
import type {
  TextEditArbitrationSource,
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
  /** Internal engineering/diagnostic explanation. */
  reason: string;
  /** Plain-language product explanation; never used as write authority. */
  userFacingReason: string;
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
  /** Internal engineering/diagnostic explanations. */
  reasons: readonly string[];
  /** Plain-language page explanation distinct from diagnostic evidence. */
  userFacingReason: string;
};

function matrixSkewMagnitudeDeg(matrix: readonly number[]): number {
  const x = (Math.atan2(matrix[1], matrix[0]) * 180) / Math.PI;
  const y = (Math.atan2(-matrix[2], matrix[3]) * 180) / Math.PI;
  const delta = Math.abs(y - x) % 180;
  return Math.min(delta, 180 - delta);
}


const USER_FACING_CATEGORY_REASON: Readonly<
  Record<DocumentTextCapabilityCategory, string>
> = {
  NATIVE_TEXT:
    "This is native PDF text with enough source evidence for direct editing where Lumeo marks it editable.",
  SCANNED_IMAGE:
    "This page appears to contain text only as pixels in an image. Native text editing is unavailable, and OCR editing is not enabled yet.",
  HYBRID_TEXT_AND_IMAGE:
    "This page mixes native PDF text with image content. Native text may be editable, but words inside images stay read-only until OCR support is enabled.",
  NATIVE_TEXT_WITH_ENCODING_LIMITATIONS:
    "Lumeo can see this native PDF text, but the file does not provide a complete character mapping for safe replacement. The text stays read-only rather than risking the wrong characters.",
  NATIVE_TEXT_WITH_FONT_LIMITATIONS:
    "Lumeo can identify this native PDF text, but reliable glyph-width information is missing. Exact replacement spacing cannot be proven, so the text stays read-only.",
  COMPLEX_VECTOR_TEXT:
    "This text uses transformed or skewed PDF geometry. Lumeo can display it, but exact rewrite placement is not yet proven safely enough for direct editing.",
  TYPE3_TEXT:
    "This text uses custom PDF-drawn glyphs rather than a normal reusable font program. Lumeo can display it, but does not rewrite it in place yet.",
  FORM_XOBJECT_TEXT:
    "This text is stored inside a reusable PDF object. Lumeo edits it only when the selected occurrence can be isolated without changing other uses of that object.",
  CLIPPED_TEXT:
    "This text also participates in shaping or clipping page artwork. Editing it could alter other content, so Lumeo keeps it read-only.",
  VERTICAL_TEXT:
    "This text uses a vertical PDF font layout. Lumeo can detect it, but vertical rewrite geometry is not yet certified for safe direct editing.",
  UNKNOWN_OR_UNSAFE:
    "Lumeo detected text evidence but could not prove a safe native PDF source and geometry for direct editing. It stays read-only to protect the document.",
};

export function userFacingTextCapabilityReason(
  category: DocumentTextCapabilityCategory,
): string {
  return USER_FACING_CATEGORY_REASON[category];
}

export function userFacingTextArbitrationReason(
  source: TextEditArbitrationSource,
): string {
  switch (source) {
    case "pdfjs-only":
      return "Lumeo can see this text on the page, but could not prove a matching native PDF text operator. It stays read-only to avoid editing the wrong content.";
    case "conflict":
      return "Visible text and native PDF evidence do not agree closely enough on text or geometry. Lumeo keeps this text read-only rather than guessing.";
    case "unmatched":
      return "Lumeo could not prove which native PDF text source owns this visible text. It stays read-only rather than risking a change to the wrong content.";
    case "reconciled":
    case "native-only-safe-synthesis":
    case "fragmented-reconstruction":
      return USER_FACING_CATEGORY_REASON.NATIVE_TEXT;
  }
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
      userFacingReason: userFacingTextCapabilityReason("CLIPPED_TEXT"),
    };
  }
  if (profile?.kind === "Type3") {
    return {
      nativeSpanKey: span.key,
      category: "TYPE3_TEXT",
      safelyRewritable: false,
      reason: "Type3 glyph programs are not yet proven safe for native rewrite.",
      userFacingReason: userFacingTextCapabilityReason("TYPE3_TEXT"),
    };
  }
  if (profile?.resourceIdentity.writingMode === "vertical") {
    return {
      nativeSpanKey: span.key,
      category: "VERTICAL_TEXT",
      safelyRewritable: false,
      reason: "The Type0 font uses a vertical CMap; vertical native rewrite is not yet proven safe.",
      userFacingReason: userFacingTextCapabilityReason("VERTICAL_TEXT"),
    };
  }
  if (span.locatedOperator.locator.kind === "xobject") {
    return {
      nativeSpanKey: span.key,
      category: "FORM_XOBJECT_TEXT",
      safelyRewritable: span.decodeComplete && profile?.encodingSource !== "Unknown",
      reason: "The text is inside a Form XObject and retains form-local resource scope.",
      userFacingReason: userFacingTextCapabilityReason("FORM_XOBJECT_TEXT"),
    };
  }
  if (!profile || profile.encodingSource === "Unknown" || !span.decodeComplete) {
    return {
      nativeSpanKey: span.key,
      category: "NATIVE_TEXT_WITH_ENCODING_LIMITATIONS",
      safelyRewritable: false,
      reason: "The source character encoding cannot be proven completely.",
      userFacingReason: userFacingTextCapabilityReason("NATIVE_TEXT_WITH_ENCODING_LIMITATIONS"),
    };
  }
  if (profile.metricsSource === "Unknown") {
    return {
      nativeSpanKey: span.key,
      category: "NATIVE_TEXT_WITH_FONT_LIMITATIONS",
      safelyRewritable: false,
      reason: "The source font exists, but deterministic glyph metrics are unavailable.",
      userFacingReason: userFacingTextCapabilityReason("NATIVE_TEXT_WITH_FONT_LIMITATIONS"),
    };
  }
  if (matrixSkewMagnitudeDeg(operator.textRenderingMatrix) > 4) {
    return {
      nativeSpanKey: span.key,
      category: "COMPLEX_VECTOR_TEXT",
      safelyRewritable: false,
      reason: "The text transform is materially skewed and is kept read-only.",
      userFacingReason: userFacingTextCapabilityReason("COMPLEX_VECTOR_TEXT"),
    };
  }

  return {
    nativeSpanKey: span.key,
    category: "NATIVE_TEXT",
    safelyRewritable: true,
    reason: "Native text has decodable source bytes, a resolved font and deterministic metrics.",
    userFacingReason: userFacingTextCapabilityReason("NATIVE_TEXT"),
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

    const userFacingReason =
      category === "NATIVE_TEXT" &&
      (nativeOnlySpanCount > 0 || pdfJsOnlyRunCount > 0)
        ? "Some text on this page could not be independently tied to a safe native PDF source. Proven spans remain editable; the rest stay read-only."
        : userFacingTextCapabilityReason(category);

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
      userFacingReason,
    };
  }
}
