// lib/pdf/edit/multiRunEditPlan.ts
//
// Phase 4 of true PDF text editing: lets one logical text replacement
// span multiple content-stream operators (e.g. a selection that crosses
// a Tj/TJ boundary, or several adjacent runs the user wants replaced as
// one). Never touches PDF bytes -- purely read-only planning, exactly
// like lib/pdf/edit/editPlan.ts (single-operator plans), which this
// module builds N of internally and merges into one MultiRunEditPlan.
//
// Design: the FIRST operator in the span receives the entire replacement
// text; every OTHER operator in the span is emptied (rewritten to show
// nothing) rather than deleted from the content stream outright -- an
// emptied ' or " still performs its own text-line move, which is needed
// to keep whatever comes after the span correctly positioned (task:
// preserve untouched operators/graphics state). This mirrors how a single
// TJ operator's own rewrite already collapses multiple string operands
// into one (see applyEditPlan.ts's buildReplacementOperatorText) --
// applied here one level up, across operators instead of within one.

import type { TextShowOperator } from "./contentStream.ts";
import type { ResolvedFont } from "./fontEncoding.ts";
import type { FontMetrics, TextShowState } from "./fontMetrics.ts";
import { compareAdvance } from "./fontMetrics.ts";
import { buildEditPlan, type EditPlan } from "./editPlan.ts";

export type MultiRunEditPlan = {
  pageIndex: number;
  contentStreamIndex: number;
  /** Ascending, consecutive operator indices this plan spans (length >= 2). */
  operatorIndices: number[];
  originalText: string;
  replacementText: string;
  editable: boolean;
  reason: string | null;
  /**
   * One EditPlan per spanned operator, in the same order as
   * operatorIndices. Only the first carries the actual replacement text;
   * the rest are emptied. Apply with
   * lib/pdf/edit/applyEditPlan.ts's applyMultiRunEditPlanToDocument,
   * never by applying these individually (their byte offsets are only
   * mutually consistent when applied together, back-to-front).
   */
  subPlans: EditPlan[];
};

function rejected(
  pageIndex: number,
  contentStreamIndex: number,
  operatorIndices: number[],
  replacementText: string,
  reason: string,
): MultiRunEditPlan {
  return {
    pageIndex,
    contentStreamIndex,
    operatorIndices,
    originalText: "",
    replacementText,
    editable: false,
    reason,
    subPlans: [],
  };
}

function isConsecutiveAscending(indices: number[]): boolean {
  for (let i = 1; i < indices.length; i += 1) {
    if (indices[i] !== indices[i - 1] + 1) return false;
  }
  return true;
}

// Builds a dry-run MultiRunEditPlan for replacing a span of two or more
// consecutive text-show operators with one logical replacement. Every
// safety invariant is checked before any per-operator plan is built:
// - At least two operators (a single operator belongs to editPlan.ts's
//   buildEditPlan instead).
// - Operator indices must be consecutive and ascending -- a gap could
//   mean an untouched operator sits between the ones being edited, whose
//   own content this function was never asked to reason about.
// - Every spanned operator must reference the SAME font resource --
//   crossing fonts mid-selection is a materially different, harder
//   problem (glyph re-encoding per font) this slice doesn't attempt.
export function buildMultiRunEditPlan({
  pageIndex,
  contentStreamIndex,
  allOperators,
  operatorIndices,
  replacementText,
  resolvedFont,
  fontMetrics,
}: {
  pageIndex: number;
  contentStreamIndex: number;
  allOperators: TextShowOperator[];
  operatorIndices: number[];
  replacementText: string;
  resolvedFont: ResolvedFont;
  fontMetrics: FontMetrics;
}): MultiRunEditPlan {
  const sortedIndices = [...operatorIndices].sort((a, b) => a - b);

  if (sortedIndices.length < 2) {
    return rejected(
      pageIndex,
      contentStreamIndex,
      sortedIndices,
      replacementText,
      "A multi-run edit needs at least two operators; use buildEditPlan for a single operator.",
    );
  }
  if (!isConsecutiveAscending(sortedIndices)) {
    return rejected(
      pageIndex,
      contentStreamIndex,
      sortedIndices,
      replacementText,
      "This selection's operators are not consecutive -- discontinuous multi-run selections are not supported.",
    );
  }

  const spanOperators = sortedIndices.map((index) => allOperators[index]);
  if (spanOperators.some((operator) => operator === undefined)) {
    return rejected(
      pageIndex,
      contentStreamIndex,
      sortedIndices,
      replacementText,
      "One or more operator indices in this selection do not exist.",
    );
  }

  const firstFontResource = spanOperators[0].fontResourceName;
  if (spanOperators.some((operator) => operator.fontResourceName !== firstFontResource)) {
    return rejected(
      pageIndex,
      contentStreamIndex,
      sortedIndices,
      replacementText,
      "This selection spans more than one font resource -- mixed-font multi-run edits are not supported.",
    );
  }

  // One EditPlan per spanned operator: the first carries the full
  // replacement text, every other one is emptied.
  const subPlans: EditPlan[] = spanOperators.map((operator, position) =>
    buildEditPlan({
      pageIndex,
      contentStreamIndex,
      operatorIndex: sortedIndices[position],
      operator,
      replacementText: position === 0 ? replacementText : "",
      resolvedFont,
      fontMetrics,
    }),
  );

  const originalText = subPlans.map((plan) => plan.originalText).join("");

  const firstRejected = subPlans.find((plan) => !plan.editable);
  if (firstRejected) {
    return {
      pageIndex,
      contentStreamIndex,
      operatorIndices: sortedIndices,
      originalText,
      replacementText,
      editable: false,
      reason: firstRejected.reason,
      subPlans,
    };
  }

  // Recompute the first sub-plan's width/delta against the SPAN's true
  // combined original width (every spanned operator's own original
  // glyphs), not just the first operator's own -- otherwise the emptied
  // operators' widths would be uncounted. Reuses fontMetrics.ts's own
  // compareAdvance (the existing spacing engine), not a new calculation.
  const combinedOriginalCodes = subPlans.flatMap((plan) => plan.originalGlyphCodes);
  const firstOperator = spanOperators[0];
  const state: TextShowState = {
    fontSizePt: firstOperator.fontSizePt,
    charSpacing: firstOperator.charSpacing,
    wordSpacing: firstOperator.wordSpacing,
    horizontalScalingPct: firstOperator.horizontalScalingPct,
  };
  const comparison = compareAdvance(combinedOriginalCodes, subPlans[0].replacementGlyphCodes, fontMetrics, state);

  const mergedFirstPlan: EditPlan = {
    ...subPlans[0],
    originalWidthPt: comparison.originalAdvancePt,
    replacementWidthPt: comparison.replacementAdvancePt,
    tjSpacingDelta: comparison.tjAdjustment,
  };

  // Every OTHER spanned operator is emptied with NO compensating
  // adjustment of its own -- mergedFirstPlan above already accounts for
  // the whole span's width difference in one place; a second, separate
  // adjustment on an emptied operator would double-compensate.
  const mergedRestPlans: EditPlan[] = subPlans.slice(1).map((plan) => ({ ...plan, tjSpacingDelta: 0 }));

  return {
    pageIndex,
    contentStreamIndex,
    operatorIndices: sortedIndices,
    originalText,
    replacementText,
    editable: true,
    reason: null,
    subPlans: [mergedFirstPlan, ...mergedRestPlans],
  };
}
