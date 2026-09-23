// lib/pdf/edit/multiRunEditPlan.ts
//
// Plans one logical replacement across several consecutive PDF text-show
// operators. The established default remains: replacement text is written to
// the first operator and the rest are emptied, with one combined advance
// compensation. A conservative local-reflow path is now added for a proven
// multi-line selection when that default would overflow but the replacement
// fits inside the already-existing paragraph width.

import type { TextShowOperator } from "./contentStream.ts";
import { buildEditPlan, type EditPlan } from "./editPlan.ts";
import type { ResolvedFont } from "./fontEncoding.ts";
import { compareAdvance, type FontMetrics, type TextShowState } from "./fontMetrics.ts";
import { allocateLocalReflowText } from "./localReflowAllocation.ts";

const REFLOW_EPSILON = 0.001;
const REFLOW_WIDTH_TOLERANCE_PT = 0.5;
const MAX_REFLOW_LINES = 4;

type LocalReflowMetadata = {
  lineTexts: string[];
  lineOperatorIndices: number[][];
  capacityPt: number;
  replacementWidthPt: number;
};

export type MultiRunEditPlan = {
  pageIndex: number;
  contentStreamIndex: number;
  /** Ascending, consecutive operator indices this plan spans (length >= 2). */
  operatorIndices: number[];
  originalText: string;
  replacementText: string;
  editable: boolean;
  reason: string | null;
  subPlans: EditPlan[];
  /** Present only when text was safely redistributed across existing lines. */
  localReflow?: LocalReflowMetadata;
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

function sameNumber(a: number, b: number): boolean {
  return Math.abs(a - b) <= REFLOW_EPSILON;
}

function textState(operator: TextShowOperator): TextShowState {
  return {
    fontSizePt: operator.fontSizePt,
    charSpacing: operator.charSpacing,
    wordSpacing: operator.wordSpacing,
    horizontalScalingPct: operator.horizontalScalingPct,
  };
}

function sameReflowTextState(a: TextShowOperator, b: TextShowOperator): boolean {
  return (
    a.fontResourceName === b.fontResourceName &&
    sameNumber(a.fontSizePt, b.fontSizePt) &&
    sameNumber(a.charSpacing, b.charSpacing) &&
    sameNumber(a.wordSpacing, b.wordSpacing) &&
    sameNumber(a.horizontalScalingPct, b.horizontalScalingPct) &&
    sameNumber(a.textRise, b.textRise) &&
    a.renderMode === b.renderMode &&
    sameNumber(a.textRenderingMatrix[0], b.textRenderingMatrix[0]) &&
    sameNumber(a.textRenderingMatrix[1], b.textRenderingMatrix[1]) &&
    sameNumber(a.textRenderingMatrix[2], b.textRenderingMatrix[2]) &&
    sameNumber(a.textRenderingMatrix[3], b.textRenderingMatrix[3])
  );
}

function simpleFlowWhitespace(text: string): boolean {
  if (text.length === 0) return true;
  return text === text.trim() && !/[\t\r\n]/u.test(text) && !/ {2,}/u.test(text);
}

function buildSubPlansForOperatorGroup({
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
}): EditPlan[] | null {
  const operators = operatorIndices.map((index) => allOperators[index]);
  if (operators.some((operator) => !operator)) return null;

  const plans = operators.map((operator, position) =>
    buildEditPlan({
      pageIndex,
      contentStreamIndex,
      operatorIndex: operatorIndices[position],
      operator,
      replacementText: position === 0 ? replacementText : "",
      resolvedFont,
      fontMetrics,
    }),
  );
  if (plans.some((plan) => !plan.editable)) return null;

  const combinedOriginalCodes = plans.flatMap((plan) => plan.originalGlyphCodes);
  const comparison = compareAdvance(
    combinedOriginalCodes,
    plans[0].replacementGlyphCodes,
    fontMetrics,
    textState(operators[0]),
  );
  const first: EditPlan = {
    ...plans[0],
    originalWidthPt: comparison.originalAdvancePt,
    replacementWidthPt: comparison.replacementAdvancePt,
    tjSpacingDelta: comparison.tjAdjustment,
  };
  return [first, ...plans.slice(1).map((plan) => ({ ...plan, tjSpacingDelta: 0 }))];
}

function lineGroupsForSafeReflow(
  operators: TextShowOperator[],
  indices: number[],
): number[][] | null {
  const first = operators[0];
  if (!first || first.kind === "'" || first.kind === '"' || first.renderMode >= 4) return null;
  if (Math.abs(first.textRenderingMatrix[1]) > REFLOW_EPSILON || Math.abs(first.textRenderingMatrix[2]) > REFLOW_EPSILON) {
    return null;
  }

  for (const operator of operators) {
    if (
      (operator.kind !== "Tj" && operator.kind !== "TJ") ||
      operator.renderMode >= 4 ||
      !sameReflowTextState(first, operator) ||
      Math.abs(operator.textRenderingMatrix[1]) > REFLOW_EPSILON ||
      Math.abs(operator.textRenderingMatrix[2]) > REFLOW_EPSILON
    ) {
      return null;
    }
  }

  const yTolerance = Math.max(1, first.fontSizePt * 0.35);
  const groups: number[][] = [];
  let current: number[] = [];
  let currentY: number | null = null;
  for (let position = 0; position < operators.length; position += 1) {
    const y = operators[position].textRenderingMatrix[5];
    if (currentY === null || Math.abs(y - currentY) <= yTolerance) {
      current.push(indices[position]);
      if (currentY === null) currentY = y;
    } else {
      groups.push(current);
      current = [indices[position]];
      currentY = y;
    }
  }
  if (current.length > 0) groups.push(current);
  if (groups.length < 2 || groups.length > MAX_REFLOW_LINES) return null;

  // The widest existing selected line defines the owned paragraph width only
  // when every line starts at the same proven text origin. Otherwise this may
  // be columns/indentation and is intentionally not reflowed.
  const firstXs = groups.map((group) => allOperatorForIndex(operators, indices, group[0]).textRenderingMatrix[4]);
  const xTolerance = Math.max(1, first.fontSizePt * 0.5);
  if (firstXs.some((x) => Math.abs(x - firstXs[0]) > xTolerance)) return null;
  return groups;
}

function allOperatorForIndex(
  operators: TextShowOperator[],
  indices: number[],
  operatorIndex: number,
): TextShowOperator {
  const position = indices.indexOf(operatorIndex);
  return operators[position];
}

function tryBuildLocalReflow({
  pageIndex,
  contentStreamIndex,
  allOperators,
  sortedIndices,
  spanOperators,
  replacementText,
  resolvedFont,
  fontMetrics,
  combinedOriginalWidthPt,
  replacementWidthPt,
}: {
  pageIndex: number;
  contentStreamIndex: number;
  allOperators: TextShowOperator[];
  sortedIndices: number[];
  spanOperators: TextShowOperator[];
  replacementText: string;
  resolvedFont: ResolvedFont;
  fontMetrics: FontMetrics;
  combinedOriginalWidthPt: number;
  replacementWidthPt: number;
}): { subPlans: EditPlan[]; metadata: LocalReflowMetadata } | null {
  if (!simpleFlowWhitespace(replacementText)) return null;
  if (replacementWidthPt <= combinedOriginalWidthPt + REFLOW_WIDTH_TOLERANCE_PT) return null;

  const groups = lineGroupsForSafeReflow(spanOperators, sortedIndices);
  if (!groups) return null;

  const baseGroupPlans = groups.map((group) =>
    buildSubPlansForOperatorGroup({
      pageIndex,
      contentStreamIndex,
      allOperators,
      operatorIndices: group,
      replacementText: "",
      resolvedFont,
      fontMetrics,
    }),
  );
  if (baseGroupPlans.some((plans) => !plans)) return null;

  const lineWidths = (baseGroupPlans as EditPlan[][]).map((plans) => plans[0].originalWidthPt);
  const blockWidth = Math.max(...lineWidths);
  const totalCapacity = blockWidth * groups.length;
  if (replacementWidthPt > totalCapacity + REFLOW_WIDTH_TOLERANCE_PT) return null;

  const allocation = allocateLocalReflowText({
    text: replacementText,
    capacitiesPt: groups.map(() => blockWidth),
    measure: (lineIndex, text) => {
      const plans = buildSubPlansForOperatorGroup({
        pageIndex,
        contentStreamIndex,
        allOperators,
        operatorIndices: groups[lineIndex],
        replacementText: text,
        resolvedFont,
        fontMetrics,
      });
      return plans?.[0].replacementWidthPt ?? null;
    },
    tolerancePt: REFLOW_WIDTH_TOLERANCE_PT,
  });
  if (!allocation) return null;

  const reflowPlans: EditPlan[] = [];
  for (let lineIndex = 0; lineIndex < groups.length; lineIndex += 1) {
    const plans = buildSubPlansForOperatorGroup({
      pageIndex,
      contentStreamIndex,
      allOperators,
      operatorIndices: groups[lineIndex],
      replacementText: allocation.lineTexts[lineIndex],
      resolvedFont,
      fontMetrics,
    });
    if (!plans) return null;
    if (plans[0].replacementWidthPt > blockWidth + REFLOW_WIDTH_TOLERANCE_PT) return null;
    reflowPlans.push(...plans);
  }

  // Runtime-only metadata consumed by replacementLayout.ts. The writer uses
  // only the ordinary EditPlan fields, keeping the proven mutation boundary
  // unchanged.
  const first = reflowPlans[0] as EditPlan & {
    __localReflowLayout?: { capacityPt: number; replacementWidthPt: number };
  };
  first.__localReflowLayout = { capacityPt: totalCapacity, replacementWidthPt };

  return {
    subPlans: reflowPlans,
    metadata: {
      lineTexts: allocation.lineTexts,
      lineOperatorIndices: groups,
      capacityPt: totalCapacity,
      replacementWidthPt,
    },
  };
}

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

  const defaultSubPlans = spanOperators.map((operator, position) =>
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
  const originalText = defaultSubPlans.map((plan) => plan.originalText).join("");
  const firstRejected = defaultSubPlans.find((plan) => !plan.editable);
  if (firstRejected) {
    return {
      pageIndex,
      contentStreamIndex,
      operatorIndices: sortedIndices,
      originalText,
      replacementText,
      editable: false,
      reason: firstRejected.reason,
      subPlans: defaultSubPlans,
    };
  }

  const combinedOriginalCodes = defaultSubPlans.flatMap((plan) => plan.originalGlyphCodes);
  const comparison = compareAdvance(
    combinedOriginalCodes,
    defaultSubPlans[0].replacementGlyphCodes,
    fontMetrics,
    textState(spanOperators[0]),
  );

  const localReflow = tryBuildLocalReflow({
    pageIndex,
    contentStreamIndex,
    allOperators,
    sortedIndices,
    spanOperators,
    replacementText,
    resolvedFont,
    fontMetrics,
    combinedOriginalWidthPt: comparison.originalAdvancePt,
    replacementWidthPt: comparison.replacementAdvancePt,
  });
  if (localReflow) {
    return {
      pageIndex,
      contentStreamIndex,
      operatorIndices: sortedIndices,
      originalText,
      replacementText,
      editable: true,
      reason: null,
      subPlans: localReflow.subPlans,
      localReflow: localReflow.metadata,
    };
  }

  const mergedFirstPlan: EditPlan = {
    ...defaultSubPlans[0],
    originalWidthPt: comparison.originalAdvancePt,
    replacementWidthPt: comparison.replacementAdvancePt,
    tjSpacingDelta: comparison.tjAdjustment,
  };
  const mergedRestPlans: EditPlan[] = defaultSubPlans
    .slice(1)
    .map((plan) => ({ ...plan, tjSpacingDelta: 0 }));

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
