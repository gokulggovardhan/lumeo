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

import type { Matrix2x3, TextShowOperator } from "./contentStream.ts";
import type { EmbeddedGlyphEvidence, ResolvedFont } from "./fontEncoding.ts";
import type { FontMetrics, TextShowState } from "./fontMetrics.ts";
import type { ValidatedShapingWriteEvidence } from "./shapingWriteGuard.ts";
import {
  buildEditPlan,
  deriveValidatedEditPlanAdvance,
  isValidatedEditPlan,
  type EditPlan,
  type ValidatedEditPlan,
} from "./editPlan.ts";

class ValidatedMultiRunEditPlanProof {
  private readonly validationProof!: true;

  constructor() {
    Object.defineProperty(this, "validationProof", {
      value: true,
      enumerable: false,
      writable: false,
      configurable: false,
    });
  }

  isPlannerIssued(): boolean {
    return this.validationProof === true;
  }
}

type MultiRunEditPlanFields = {
  pageIndex: number;
  contentStreamIndex: number;
  operatorIndices: number[];
  originalText: string;
  replacementText: string;
};

export type ValidatedMultiRunEditPlan =
  Readonly<MultiRunEditPlanFields> &
  ValidatedMultiRunEditPlanProof & {
    readonly editable: true;
    readonly reason: null;
    readonly subPlans: readonly ValidatedEditPlan[];
  };

export type RejectedMultiRunEditPlan = MultiRunEditPlanFields & {
  editable: false;
  reason: string;
  subPlans: EditPlan[];
};

export type MultiRunEditPlan =
  | ValidatedMultiRunEditPlan
  | RejectedMultiRunEditPlan;

function issueValidatedMultiRunEditPlan({
  pageIndex,
  contentStreamIndex,
  operatorIndices,
  originalText,
  replacementText,
  subPlans,
}: MultiRunEditPlanFields & {
  subPlans: readonly ValidatedEditPlan[];
}): ValidatedMultiRunEditPlan {
  const plan = Object.assign(new ValidatedMultiRunEditPlanProof(), {
    pageIndex,
    contentStreamIndex,
    operatorIndices: [...operatorIndices],
    originalText,
    replacementText,
    editable: true as const,
    reason: null,
    subPlans: [...subPlans],
  }) as ValidatedMultiRunEditPlan;
  Object.freeze(plan.operatorIndices);
  Object.freeze(plan.subPlans);
  Object.freeze(plan);
  return plan;
}

export function isValidatedMultiRunEditPlan(
  plan: MultiRunEditPlan,
): plan is ValidatedMultiRunEditPlan {
  return (
    plan instanceof ValidatedMultiRunEditPlanProof &&
    plan.isPlannerIssued() &&
    plan.editable === true &&
    plan.reason === null &&
    Object.isFrozen(plan) &&
    plan.subPlans.every(isValidatedEditPlan)
  );
}

function rejected(
  pageIndex: number,
  contentStreamIndex: number,
  operatorIndices: number[],
  replacementText: string,
  reason: string,
): RejectedMultiRunEditPlan {
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

function sameMatrix(a: Matrix2x3 | undefined, b: Matrix2x3 | undefined): boolean {
  if (!a || !b) return false;
  return a.every((value, index) => Math.abs(value - b[index]) <= 1e-9);
}

function trailingTjAdjustmentForTargetAdvance(
  targetAdvancePt: number,
  replacementAdvancePt: number,
  state: TextShowState,
): number {
  const scalePt = state.fontSizePt * (state.horizontalScalingPct / 100);
  return scalePt === 0
    ? 0
    : ((replacementAdvancePt - targetAdvancePt) / scalePt) * 1000;
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
  embeddedGlyphEvidence = null,
  embeddedProgramSha256 = null,
  shapingWriteEvidence = null,
}: {
  pageIndex: number;
  contentStreamIndex: number;
  allOperators: TextShowOperator[];
  operatorIndices: number[];
  replacementText: string;
  resolvedFont: ResolvedFont;
  fontMetrics: FontMetrics;
  embeddedGlyphEvidence?: EmbeddedGlyphEvidence | null;
  embeddedProgramSha256?: string | null;
  shapingWriteEvidence?: ValidatedShapingWriteEvidence | null;
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

  const firstTextObjectIndex = spanOperators[0].textObjectIndex;
  if (
    firstTextObjectIndex === null ||
    firstTextObjectIndex === undefined ||
    spanOperators.some(
      (operator) => operator.textObjectIndex !== firstTextObjectIndex,
    )
  ) {
    return rejected(
      pageIndex,
      contentStreamIndex,
      sortedIndices,
      replacementText,
      "These text pieces belong to separate native text groups, so one in-place replacement cannot preserve their formatting and position safely.",
    );
  }

  const firstLineMatrix = spanOperators[0].textLineMatrix;
  const firstCtm = spanOperators[0].ctm;
  if (
    !firstLineMatrix ||
    !firstCtm ||
    spanOperators.some(
      (operator) =>
        !sameMatrix(operator.textLineMatrix, firstLineMatrix) ||
        !sameMatrix(operator.ctm, firstCtm),
    )
  ) {
    return rejected(
      pageIndex,
      contentStreamIndex,
      sortedIndices,
      replacementText,
      "These text pieces are positioned independently or cross a line break, so editing them as one range could move surrounding text. Edit one line at a time.",
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
      embeddedGlyphEvidence,
      embeddedProgramSha256: position === 0 ? embeddedProgramSha256 : null,
      shapingWriteEvidence: position === 0 ? shapingWriteEvidence : null,
    }),
  );

  const originalText = subPlans.map((plan) => plan.originalText).join("");

  const validatedSubPlans: ValidatedEditPlan[] = [];
  for (const subPlan of subPlans) {
    if (!isValidatedEditPlan(subPlan)) {
      return {
        pageIndex,
        contentStreamIndex,
        operatorIndices: sortedIndices,
        originalText,
        replacementText,
        editable: false,
        reason: subPlan.reason,
        subPlans,
      };
    }
    validatedSubPlans.push(subPlan);
  }

  // Preserve the SPAN's proven effective advance using each operator's OWN
  // validated text state. The old implementation concatenated all original
  // glyph codes and remeasured them with the FIRST operator's font
  // size/spacing/scaling; that is wrong when a valid same-font selection
  // crosses a text-state change. Every sub-plan has already measured its
  // effective original endpoint (including original TJ adjustments), so the
  // combined target is the sum of those independently proven advances.
  const combinedOriginalAdvancePt = validatedSubPlans.reduce(
    (sum, plan) => sum + plan.originalWidthPt,
    0,
  );
  const firstOperator = spanOperators[0];
  const firstState: TextShowState = {
    fontSizePt: firstOperator.fontSizePt,
    charSpacing: firstOperator.charSpacing,
    wordSpacing: firstOperator.wordSpacing,
    horizontalScalingPct: firstOperator.horizontalScalingPct,
  };
  const replacementAdvancePt = validatedSubPlans[0].replacementWidthPt;
  const tjSpacingDelta = trailingTjAdjustmentForTargetAdvance(
    combinedOriginalAdvancePt,
    replacementAdvancePt,
    firstState,
  );

  const mergedFirstPlan = deriveValidatedEditPlanAdvance(
    validatedSubPlans[0],
    {
      originalWidthPt: combinedOriginalAdvancePt,
      replacementWidthPt: replacementAdvancePt,
      tjSpacingDelta,
    },
  );

  // Every OTHER spanned operator is emptied with NO compensating
  // adjustment of its own -- mergedFirstPlan above already accounts for
  // the whole span's width difference in one place; a second, separate
  // adjustment on an emptied operator would double-compensate.
  const mergedRestPlans = validatedSubPlans.slice(1).map((plan) =>
    deriveValidatedEditPlanAdvance(plan, {
      originalWidthPt: plan.originalWidthPt,
      replacementWidthPt: plan.replacementWidthPt,
      tjSpacingDelta: 0,
    }),
  );

  return issueValidatedMultiRunEditPlan({
    pageIndex,
    contentStreamIndex,
    operatorIndices: sortedIndices,
    originalText,
    replacementText,
    subPlans: [mergedFirstPlan, ...mergedRestPlans],
  });
}
