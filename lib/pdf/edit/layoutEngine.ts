import type { EditPlan } from "./editPlan.ts";

export type PdfTextLayoutStrategy =
  | "natural"
  | "distributed-char-spacing"
  | "horizontal-scale"
  | "local-reflow"
  | "blocked";

export type PdfTextLayoutDecision = {
  strategy: PdfTextLayoutStrategy;
  supported: boolean;
  reason: string | null;
  originalWidthPt: number;
  replacementWidthPt: number;
  deltaPt: number;
  targetCharSpacingPt: number | null;
  targetHorizontalScalingPct: number | null;
  tailTjAdjustment: number;
};

export type PdfTextLayoutInput = {
  operatorType: EditPlan["operatorType"];
  originalWidthPt: number;
  replacementWidthPt: number;
  glyphCount: number;
  fontSizePt: number;
  originalCharSpacingPt: number;
  originalHorizontalScalingPct: number;
  existingTjAdjustment: number;
  safeReflowWidthPt?: number | null;
};

export type PdfTextLayoutLimits = {
  naturalTolerancePt: number;
  naturalToleranceRatio: number;
  maxCharSpacingDeltaPt: number;
  maxCharSpacingFontRatio: number;
  minHorizontalScalePct: number;
  maxHorizontalScalePct: number;
};

export const DEFAULT_TEXT_LAYOUT_LIMITS: PdfTextLayoutLimits = {
  naturalTolerancePt: 0.2,
  naturalToleranceRatio: 0.015,
  maxCharSpacingDeltaPt: 0.6,
  maxCharSpacingFontRatio: 0.06,
  minHorizontalScalePct: 88,
  maxHorizontalScalePct: 112,
};

function naturalTolerance(widthPt: number, limits: PdfTextLayoutLimits): number {
  return Math.max(limits.naturalTolerancePt, Math.abs(widthPt) * limits.naturalToleranceRatio);
}

function decisionBase(input: PdfTextLayoutInput) {
  return {
    originalWidthPt: input.originalWidthPt,
    replacementWidthPt: input.replacementWidthPt,
    deltaPt: input.replacementWidthPt - input.originalWidthPt,
  };
}

/**
 * Deterministic fit policy for one already-validated EditPlan.
 *
 * The low-level writer remains the byte-mutation authority. This function
 * only decides how aggressively Lumeo may alter spacing/scaling before it
 * must stop and disclose that layout preservation is unsafe.
 */
export function decideTextReplacementLayout(
  input: PdfTextLayoutInput,
  limits: PdfTextLayoutLimits = DEFAULT_TEXT_LAYOUT_LIMITS,
): PdfTextLayoutDecision {
  const base = decisionBase(input);

  if (input.glyphCount === 0) {
    return {
      ...base,
      strategy: "natural",
      supported: true,
      reason: null,
      targetCharSpacingPt: null,
      targetHorizontalScalingPct: null,
      tailTjAdjustment: 0,
    };
  }

  const absDelta = Math.abs(base.deltaPt);
  if (absDelta <= naturalTolerance(input.originalWidthPt, limits)) {
    return {
      ...base,
      strategy: "natural",
      supported: true,
      reason: null,
      targetCharSpacingPt: null,
      targetHorizontalScalingPct: null,
      tailTjAdjustment:
        input.operatorType === "Tj" || input.operatorType === "TJ"
          ? input.existingTjAdjustment
          : 0,
    };
  }

  const scale = input.originalHorizontalScalingPct / 100;
  if (input.glyphCount > 1 && scale > 0) {
    // PDF Tc contributes once per shown glyph in the displacement equation.
    const charSpacingDelta = (input.originalWidthPt - input.replacementWidthPt) /
      (input.glyphCount * scale);
    const maxSpacingDelta = Math.min(
      limits.maxCharSpacingDeltaPt,
      Math.max(0.05, input.fontSizePt * limits.maxCharSpacingFontRatio),
    );
    if (Math.abs(charSpacingDelta) <= maxSpacingDelta) {
      return {
        ...base,
        strategy: "distributed-char-spacing",
        supported: true,
        reason: null,
        targetCharSpacingPt: input.originalCharSpacingPt + charSpacingDelta,
        targetHorizontalScalingPct: null,
        tailTjAdjustment: 0,
      };
    }
  }

  if (input.replacementWidthPt > 0 && input.originalHorizontalScalingPct > 0) {
    const targetScale =
      input.originalHorizontalScalingPct * (input.originalWidthPt / input.replacementWidthPt);
    if (
      targetScale >= limits.minHorizontalScalePct &&
      targetScale <= limits.maxHorizontalScalePct
    ) {
      return {
        ...base,
        strategy: "horizontal-scale",
        supported: true,
        reason: null,
        targetCharSpacingPt: null,
        targetHorizontalScalingPct: targetScale,
        tailTjAdjustment: 0,
      };
    }
  }

  if (
    input.safeReflowWidthPt != null &&
    input.safeReflowWidthPt > 0 &&
    input.replacementWidthPt <= input.safeReflowWidthPt
  ) {
    return {
      ...base,
      strategy: "local-reflow",
      supported: false,
      reason:
        "This replacement needs local line reflow. Lumeo will not move neighbouring PDF content until that block can be reflowed without ambiguity.",
      targetCharSpacingPt: null,
      targetHorizontalScalingPct: null,
      tailTjAdjustment: 0,
    };
  }

  return {
    ...base,
    strategy: "blocked",
    supported: false,
    reason:
      "The replacement is too different in width to preserve this layout safely with bounded spacing or scaling. Shorten the text or use a controlled restyle.",
    targetCharSpacingPt: null,
    targetHorizontalScalingPct: null,
    tailTjAdjustment: 0,
  };
}

export function decideEditPlanLayout(
  plan: EditPlan,
  options: { safeReflowWidthPt?: number | null } = {},
  limits: PdfTextLayoutLimits = DEFAULT_TEXT_LAYOUT_LIMITS,
): PdfTextLayoutDecision {
  return decideTextReplacementLayout(
    {
      operatorType: plan.operatorType,
      originalWidthPt: plan.originalWidthPt,
      replacementWidthPt: plan.replacementWidthPt,
      glyphCount: plan.replacementGlyphCodes.length,
      fontSizePt: plan.fontSizePt,
      originalCharSpacingPt: plan.charSpacing,
      originalHorizontalScalingPct: 100,
      existingTjAdjustment: plan.tjSpacingDelta,
      safeReflowWidthPt: options.safeReflowWidthPt,
    },
    limits,
  );
}
