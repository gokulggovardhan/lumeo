import type {
  DocumentTextCapabilityCategory,
  PageTextCapabilityClassification,
  SpanTextCapabilityClassification,
} from "./textCapabilityClassifier.ts";
import type { TextEditArbitration } from "./textReconciliation.ts";

export type TextCapabilityUserMessage = {
  title: string;
  detail: string;
};

const CATEGORY_MESSAGES: Record<
  DocumentTextCapabilityCategory,
  TextCapabilityUserMessage
> = {
  NATIVE_TEXT: {
    title: "Text source match is not fully proven",
    detail:
      "Lumeo can see native PDF text here, but direct editing stays read-only unless the visible text and its original PDF source agree strongly enough.",
  },
  SCANNED_IMAGE: {
    title: "This page appears to be a scan",
    detail:
      "The page contains image content without a proven native text layer. Direct text editing is unavailable until OCR support is added.",
  },
  HYBRID_TEXT_AND_IMAGE: {
    title: "This page mixes text and images",
    detail:
      "Lumeo edits only native text whose original PDF source is proven. Text that exists only inside an image remains read-only.",
  },
  NATIVE_TEXT_WITH_ENCODING_LIMITATIONS: {
    title: "This text uses an encoding Lumeo cannot rewrite safely",
    detail:
      "The characters are visible, but their original PDF character codes cannot be decoded completely enough to guarantee a safe replacement.",
  },
  NATIVE_TEXT_WITH_FONT_LIMITATIONS: {
    title: "This font does not provide enough placement evidence",
    detail:
      "Lumeo found the native text, but the PDF does not expose deterministic font measurements needed to keep replacement text in the same position.",
  },
  COMPLEX_VECTOR_TEXT: {
    title: "This text uses complex positioning",
    detail:
      "The text is transformed or skewed in a way that Lumeo cannot yet reproduce safely during an in-place rewrite.",
  },
  TYPE3_TEXT: {
    title: "This text uses a special PDF-drawn font",
    detail:
      "Its characters are defined as PDF drawing programs rather than a normal font resource, so Lumeo keeps this text read-only for now.",
  },
  FORM_XOBJECT_TEXT: {
    title: "This text is inside a reusable PDF object",
    detail:
      "Lumeo edits this kind of text only when the exact object instance and its local font resources can be isolated safely.",
  },
  CLIPPED_TEXT: {
    title: "This text is part of a clipping shape",
    detail:
      "Changing it could also change what other page content is allowed to appear, so Lumeo keeps the text read-only instead of risking the page layout.",
  },
  VERTICAL_TEXT: {
    title: "Vertical text is not yet safe to rewrite",
    detail:
      "Lumeo detected the vertical writing mode, but vertical glyph placement and rewrite geometry are not yet proven well enough for direct editing.",
  },
  UNKNOWN_OR_UNSAFE: {
    title: "This text cannot yet be edited safely",
    detail:
      "Lumeo does not have enough reliable source, font and geometry evidence to rewrite this text without risking a visible change to the PDF.",
  },
};

/**
 * Converts internal capability categories into stable product copy.
 *
 * Keep this separate from classifier reasons: classifier/arbitration strings
 * are engineering evidence and may mention implementation details. Product UI
 * uses these messages so a diagnostic wording change can never silently alter
 * the user-facing explanation or, more importantly, edit authorization.
 */
export function userMessageForCapabilityCategory(
  category: DocumentTextCapabilityCategory,
): TextCapabilityUserMessage {
  return CATEGORY_MESSAGES[category];
}

export function userMessageForPageCapability(
  capability: PageTextCapabilityClassification,
): TextCapabilityUserMessage {
  if (
    capability.category === "NATIVE_TEXT" &&
    (capability.pdfJsOnlyRunCount > 0 ||
      capability.nativeOnlySpanCount > 0 ||
      capability.reconciledHighConfidenceCount <
        Math.min(capability.nativeSpanCount, capability.pdfJsRunCount))
  ) {
    return {
      title: "Some text source matches are not proven",
      detail:
        "Lumeo can see the text, but some visible runs do not agree strongly enough with one original PDF source to allow direct editing. Those runs stay read-only.",
    };
  }

  return userMessageForCapabilityCategory(capability.category);
}

export function userMessageForTextRun({
  arbitration,
  nativeClassification,
}: {
  arbitration: TextEditArbitration | null;
  nativeClassification: SpanTextCapabilityClassification | null;
}): TextCapabilityUserMessage | null {
  if (arbitration?.decision === "editable") return null;

  if (nativeClassification && !nativeClassification.safelyRewritable) {
    return userMessageForCapabilityCategory(nativeClassification.category);
  }

  switch (arbitration?.source) {
    case "pdfjs-only":
      return {
        title: "Visible text has no proven PDF source",
        detail:
          "Lumeo can read this text on the page, but cannot tie it confidently to one original PDF text operation, so it stays read-only.",
      };
    case "conflict":
      return {
        title: "The visible text and PDF source do not agree enough",
        detail:
          "Lumeo found possible source text, but the text identity or placement evidence is not strong enough to authorize an in-place rewrite.",
      };
    case "unmatched":
      return {
        title: "This text source could not be proven",
        detail:
          "No single original PDF text operation cleared Lumeo's safety checks for this visible text, so direct editing is disabled.",
      };
    case "native-only-safe-synthesis":
    case "fragmented-reconstruction":
    case "reconciled":
      // These sources normally imply editable. If a future caller supplies a
      // contradictory view-only decision, fail closed with generic honest copy.
      return userMessageForCapabilityCategory("UNKNOWN_OR_UNSAFE");
    default:
      return userMessageForCapabilityCategory(
        nativeClassification?.category ?? "UNKNOWN_OR_UNSAFE",
      );
  }
}
