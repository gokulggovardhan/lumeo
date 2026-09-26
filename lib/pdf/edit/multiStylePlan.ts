import type { LocatedTextOperator } from "./formXObjects.ts";
import type {
  EmbeddedGlyphEvidence,
  ResolvedFont,
} from "./fontEncoding.ts";
import type { FontMetrics, TextShowState } from "./fontMetrics.ts";
import {
  buildEditPlan,
  decodeTextShowOperator,
  isValidatedEditPlan,
  type ValidatedEditPlan,
} from "./editPlan.ts";
import {
  buildNativePaintPlan,
  describeNativeFillColorCapability,
  paintColorFromCssHex,
  type NativePaintPlan,
} from "./nativePaint.ts";

export type NativeTextStyleBatchPatch = Partial<TextShowState> & {
  /**
   * Undefined means preserve each span's own native fill.
   * A supplied value must be a full CSS #rrggbb colour and is still
   * independently proven safe against every changed PDF operator.
   */
  fillColorHex?: string;
};

export type NativeTextStyleBatchInput = {
  spanId: string;
  locatedOperator: LocatedTextOperator;
  resolvedFont: ResolvedFont;
  fontMetrics: FontMetrics;
  embeddedGlyphEvidence?: EmbeddedGlyphEvidence | null;
  /**
   * A visual run reconstructed from several PDF text-show operators cannot be
   * represented by this one-entry style plan without changing its provenance.
   * Keep it fail-closed until fragmented style planning is explicit.
   */
  fragmented?: boolean;
};

export type NativeTextStyleBatchEntry = {
  spanId: string;
  plan: ValidatedEditPlan;
  bytesPerCode: 1 | 2;
  nativePaintPlan: Extract<NativePaintPlan, { editable: true }> | null;
};

const validatedNativeTextStyleBatchBrand = Symbol(
  "lumeo.edit.validated-native-style-batch",
);

export type ValidatedNativeTextStyleBatchPlan = {
  editable: true;
  pageIndex: number;
  contentStreamIndex: number;
  entries: NativeTextStyleBatchEntry[];
  reason: null;
  readonly [validatedNativeTextStyleBatchBrand]: true;
};

export type RejectedNativeTextStyleBatchPlan = {
  editable: false;
  pageIndex: number;
  contentStreamIndex: number | null;
  entries: NativeTextStyleBatchEntry[];
  reason: string;
  readonly [validatedNativeTextStyleBatchBrand]?: never;
};

export type NativeTextStyleBatchPlan =
  | ValidatedNativeTextStyleBatchPlan
  | RejectedNativeTextStyleBatchPlan;

export function isValidatedNativeTextStyleBatchPlan(
  plan: NativeTextStyleBatchPlan,
): plan is ValidatedNativeTextStyleBatchPlan {
  return (
    plan.editable === true &&
    plan.reason === null &&
    validatedNativeTextStyleBatchBrand in plan &&
    plan[validatedNativeTextStyleBatchBrand] === true &&
    plan.entries.every((entry) => isValidatedEditPlan(entry.plan))
  );
}

function rejected(
  pageIndex: number,
  contentStreamIndex: number | null,
  reason: string,
  entries: NativeTextStyleBatchEntry[] = [],
): RejectedNativeTextStyleBatchPlan {
  return {
    editable: false,
    pageIndex,
    contentStreamIndex,
    entries,
    reason,
  };
}

function requestedTextState(
  patch: NativeTextStyleBatchPatch,
): Partial<TextShowState> | null {
  const state: Partial<TextShowState> = {};
  if (patch.fontSizePt !== undefined) state.fontSizePt = patch.fontSizePt;
  if (patch.charSpacing !== undefined) state.charSpacing = patch.charSpacing;
  if (patch.wordSpacing !== undefined) state.wordSpacing = patch.wordSpacing;
  if (patch.horizontalScalingPct !== undefined) {
    state.horizontalScalingPct = patch.horizontalScalingPct;
  }
  return Object.keys(state).length > 0 ? state : null;
}

/**
 * Dry-runs one uniform direct-formatting request across a logical multi-span
 * selection. No PDF bytes are touched here.
 *
 * Deliberately conservative first slice:
 * - every visual span must map to exactly one direct page-stream Tj operator;
 * - all changed operators must live in the same page content stream;
 * - each span keeps its own font resource/encoding/metrics;
 * - every span is independently validated through the existing EditPlan and
 *   native-paint planners before the batch can become editable;
 * - spans already matching the request are omitted, so the writer never
 *   normalizes/re-encodes text that does not need changing.
 *
 * TJ/quote/Form/fragmented cases stay blocked rather than risking a formatting
 * operation that subtly changes kerning, line movement or shared XObject
 * semantics.
 */
export function buildNativeTextStyleBatchPlan({
  pageIndex,
  inputs,
  patch,
}: {
  pageIndex: number;
  inputs: readonly NativeTextStyleBatchInput[];
  patch: NativeTextStyleBatchPatch;
}): NativeTextStyleBatchPlan {
  if (inputs.length < 2) {
    return rejected(
      pageIndex,
      null,
      "Uniform multi-span formatting needs at least two selected native text spans.",
    );
  }

  const textState = requestedTextState(patch);
  const requestedFill =
    patch.fillColorHex === undefined
      ? null
      : paintColorFromCssHex(patch.fillColorHex);

  if (patch.fillColorHex !== undefined && !requestedFill) {
    return rejected(
      pageIndex,
      null,
      "Fill colour must be a full hexadecimal colour such as #3366cc.",
    );
  }

  if (!textState && !requestedFill) {
    return rejected(pageIndex, null, "No uniform native formatting change was requested.");
  }

  let streamIndex: number | null = null;
  const entries: NativeTextStyleBatchEntry[] = [];
  const occupiedRanges: Array<{ start: number; end: number }> = [];

  for (const input of inputs) {
    const { locatedOperator, resolvedFont, fontMetrics } = input;
    const operator = locatedOperator.operator;

    if (input.fragmented) {
      return rejected(
        pageIndex,
        streamIndex,
        "This selection contains text reconstructed from multiple PDF operators. Format that text one span at a time for now.",
        entries,
      );
    }

    if (locatedOperator.locator.kind !== "page") {
      return rejected(
        pageIndex,
        streamIndex,
        "Uniform multi-span formatting inside Form XObjects is not supported yet. Format those spans one at a time.",
        entries,
      );
    }

    if (operator.kind !== "Tj") {
      return rejected(
        pageIndex,
        streamIndex,
        "Uniform multi-span formatting is currently limited to simple Tj text runs so Lumeo does not disturb TJ kerning or quote-operator line movement.",
        entries,
      );
    }

    if (streamIndex === null) {
      streamIndex = locatedOperator.locator.contentStreamIndex;
    } else if (locatedOperator.locator.contentStreamIndex !== streamIndex) {
      return rejected(
        pageIndex,
        streamIndex,
        "The selected text is split across multiple PDF content streams. Format one stream at a time for now.",
        entries,
      );
    }

    const decoded = decodeTextShowOperator(operator, resolvedFont);
    if (!decoded.allDecoded) {
      return rejected(
        pageIndex,
        streamIndex,
        "One selected span cannot be decoded completely in its own PDF font, so the formatting transaction was blocked.",
        entries,
      );
    }

    const plan = buildEditPlan({
      pageIndex,
      contentStreamIndex: locatedOperator.locator.contentStreamIndex,
      operatorIndex: locatedOperator.operatorIndex,
      operator,
      replacementText: decoded.text,
      resolvedFont,
      fontMetrics,
      embeddedGlyphEvidence: input.embeddedGlyphEvidence ?? null,
      replacementTextState: textState,
    });

    if (!isValidatedEditPlan(plan)) {
      return rejected(
        pageIndex,
        streamIndex,
        plan.reason,
        entries,
      );
    }
    if (plan.fallbackFont) {
      return rejected(
        pageIndex,
        streamIndex,
        "Uniform native formatting never substitutes fonts. Format this span separately if a fallback font is required.",
        entries,
      );
    }

    let nativePaintPlan: Extract<NativePaintPlan, { editable: true }> | null = null;
    if (requestedFill) {
      const sourceHex = operator.fillColor?.cssHex?.toLowerCase() ?? null;
      if (sourceHex !== requestedFill.cssHex?.toLowerCase()) {
        const capability = describeNativeFillColorCapability(operator);
        if (!capability.editable) {
          return rejected(
            pageIndex,
            streamIndex,
            capability.reason ??
              "One selected span does not expose a safely editable native fill colour.",
            entries,
          );
        }
        const paint = buildNativePaintPlan(operator, { fillColor: requestedFill });
        if (!paint.editable) {
          return rejected(pageIndex, streamIndex, paint.reason, entries);
        }
        nativePaintPlan = paint;
      }
    }

    const changesTextState = plan.replacementTextState !== null;
    if (!changesTextState && !nativePaintPlan) {
      continue;
    }

    const start = plan.byteOffset;
    const end = start + plan.byteLength;
    if (occupiedRanges.some((range) => start < range.end && end > range.start)) {
      return rejected(
        pageIndex,
        streamIndex,
        "Two selected spans resolve to overlapping PDF byte ranges, so the batch cannot be applied safely.",
        entries,
      );
    }
    occupiedRanges.push({ start, end });

    entries.push({
      spanId: input.spanId,
      plan,
      bytesPerCode: resolvedFont.bytesPerCode,
      nativePaintPlan,
    });
  }

  if (streamIndex === null) {
    return rejected(
      pageIndex,
      null,
      "The selected text could not be resolved to a direct page content stream.",
    );
  }

  if (entries.length === 0) {
    return rejected(
      pageIndex,
      streamIndex,
      "The selected spans already match the requested native formatting.",
    );
  }

  return {
    editable: true,
    pageIndex,
    contentStreamIndex: streamIndex,
    entries,
    reason: null,
    [validatedNativeTextStyleBatchBrand]: true,
  };
}
