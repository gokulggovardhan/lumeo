import type { EditPlan } from "./editPlan.ts";

export type ReplacementLayoutStrategy =
  | "natural"
  | "advance-compensation"
  | "letter-spacing"
  | "horizontal-scale"
  | "local-reflow"
  | "blocked";

export type ReplacementLayoutDecision = {
  strategy: ReplacementLayoutStrategy;
  safeToApplyWithCurrentWriter: boolean;
  widthRatio: number;
  overflowPt: number;
  suggestedCharSpacingDeltaPt: number | null;
  suggestedHorizontalScaleFactor: number | null;
  reason: string | null;
};

export type ReplacementLayoutPolicy = {
  naturalTolerancePt: number;
  naturalToleranceRatio: number;
  maxCurrentWriterOverflowRatio: number;
  maxLetterSpacingDeltaEm: number;
  minHorizontalScaleFactor: number;
  allowLocalReflow: boolean;
};

export const DEFAULT_REPLACEMENT_LAYOUT_POLICY: ReplacementLayoutPolicy = {
  naturalTolerancePt: 0.75,
  naturalToleranceRatio: 0.03,
  // The current low-level writer preserves the following text position with
  // TJ compensation but does not yet reshape the replacement itself. Keep a
  // small bounded overflow window while the premium scaling/reflow writer is
  // introduced incrementally.
  maxCurrentWriterOverflowRatio: 0.08,
  maxLetterSpacingDeltaEm: 0.045,
  minHorizontalScaleFactor: 0.88,
  allowLocalReflow: false,
};

export function decideReplacementLayout(
  plan: Pick<
    EditPlan,
    "editable" | "reason" | "originalWidthPt" | "replacementWidthPt" | "fontSizePt" | "replacementGlyphCodes"
  >,
  policy: ReplacementLayoutPolicy = DEFAULT_REPLACEMENT_LAYOUT_POLICY,
): ReplacementLayoutDecision {
  if (!plan.editable) {
    return {
      strategy: "blocked",
      safeToApplyWithCurrentWriter: false,
      widthRatio: 1,
      overflowPt: 0,
      suggestedCharSpacingDeltaPt: null,
      suggestedHorizontalScaleFactor: null,
      reason: plan.reason ?? "This replacement is not editable.",
    };
  }

  const original = Math.max(0, plan.originalWidthPt);
  const replacement = Math.max(0, plan.replacementWidthPt);

  if (replacement === 0 || original === 0) {
    return {
      strategy: "natural",
      safeToApplyWithCurrentWriter: true,
      widthRatio: original === 0 ? 1 : 0,
      overflowPt: Math.max(0, replacement - original),
      suggestedCharSpacingDeltaPt: null,
      suggestedHorizontalScaleFactor: null,
      reason: null,
    };
  }

  const widthRatio = replacement / original;
  const overflowPt = Math.max(0, replacement - original);
  const naturalTolerance = Math.max(
    policy.naturalTolerancePt,
    original * policy.naturalToleranceRatio,
  );

  if (Math.abs(replacement - original) <= naturalTolerance) {
    return {
      strategy: "natural",
      safeToApplyWithCurrentWriter: true,
      widthRatio,
      overflowPt,
      suggestedCharSpacingDeltaPt: null,
      suggestedHorizontalScaleFactor: null,
      reason: null,
    };
  }

  if (replacement < original) {
    return {
      strategy: "advance-compensation",
      safeToApplyWithCurrentWriter: true,
      widthRatio,
      overflowPt: 0,
      suggestedCharSpacingDeltaPt: null,
      suggestedHorizontalScaleFactor: null,
      reason: null,
    };
  }

  if (widthRatio <= 1 + policy.maxCurrentWriterOverflowRatio) {
    return {
      strategy: "advance-compensation",
      safeToApplyWithCurrentWriter: true,
      widthRatio,
      overflowPt,
      suggestedCharSpacingDeltaPt: null,
      suggestedHorizontalScaleFactor: null,
      reason: null,
    };
  }

  const glyphCount = plan.replacementGlyphCodes.length;
  const charSpacingDelta =
    glyphCount > 0 ? (original - replacement) / glyphCount : Number.NEGATIVE_INFINITY;
  const maxCharSpacingDelta = Math.max(0, plan.fontSizePt * policy.maxLetterSpacingDeltaEm);

  if (
    Number.isFinite(charSpacingDelta) &&
    Math.abs(charSpacingDelta) <= maxCharSpacingDelta
  ) {
    return {
      strategy: "letter-spacing",
      safeToApplyWithCurrentWriter: false,
      widthRatio,
      overflowPt,
      suggestedCharSpacingDeltaPt: charSpacingDelta,
      suggestedHorizontalScaleFactor: null,
      reason:
        "This replacement needs a bounded character-spacing adjustment to preserve the original text box. That transformation is not applied automatically yet.",
    };
  }

  const horizontalScaleFactor = original / replacement;
  if (horizontalScaleFactor >= policy.minHorizontalScaleFactor) {
    return {
      strategy: "horizontal-scale",
      safeToApplyWithCurrentWriter: false,
      widthRatio,
      overflowPt,
      suggestedCharSpacingDeltaPt: null,
      suggestedHorizontalScaleFactor: horizontalScaleFactor,
      reason:
        "This replacement needs bounded horizontal scaling to stay inside the original text box. Apply is paused until that transformation can be written safely.",
    };
  }

  if (policy.allowLocalReflow) {
    return {
      strategy: "local-reflow",
      safeToApplyWithCurrentWriter: false,
      widthRatio,
      overflowPt,
      suggestedCharSpacingDeltaPt: null,
      suggestedHorizontalScaleFactor: horizontalScaleFactor,
      reason:
        "This replacement no longer fits the original line and needs local reflow.",
    };
  }

  return {
    strategy: "blocked",
    safeToApplyWithCurrentWriter: false,
    widthRatio,
    overflowPt,
    suggestedCharSpacingDeltaPt: null,
    suggestedHorizontalScaleFactor: horizontalScaleFactor,
    reason:
      "The replacement is substantially wider than the original text box. Lumeo will not silently overlap neighboring PDF content; shorten the text or use a restyled text box.",
  };
}
