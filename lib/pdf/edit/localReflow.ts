import type { TextShowOperator } from "./contentStream.ts";
import { buildEditPlan, type EditPlan } from "./editPlan.ts";
import type { ResolvedFont } from "./fontEncoding.ts";
import type { FontMetrics } from "./fontMetrics.ts";
import { buildMultiRunEditPlan, type MultiRunEditPlan } from "./multiRunEditPlan.ts";

const MAX_LOCAL_REFLOW_LINES = 4;
const MATRIX_EPSILON = 0.001;
const WIDTH_TOLERANCE_PT = 0.5;

export type LocalReflowBounds = {
  xPt: number;
  yPt: number;
  widthPt: number;
  heightPt: number;
};

export type LocalReflowLineInput = {
  lineId: string;
  operatorIndices: number[];
  sourceRunIndices: number[];
  boundsPt: LocalReflowBounds;
  /**
   * Horizontal room proven by the Page → Block → Line model. This may be
   * wider than the line's currently painted glyphs, but never wider than the
   * already-owned local block region.
   */
  availableWidthPt: number;
  rotationDeg: number;
  writingDirection: "ltr" | "rtl" | "vertical";
};

export type LocalReflowLinePlan =
  | {
      kind: "single";
      lineId: string;
      sourceRunIndices: number[];
      originalText: string;
      replacementText: string;
      originalWidthPt: number;
      replacementWidthPt: number;
      availableWidthPt: number;
      plan: EditPlan;
    }
  | {
      kind: "multi";
      lineId: string;
      sourceRunIndices: number[];
      originalText: string;
      replacementText: string;
      originalWidthPt: number;
      replacementWidthPt: number;
      availableWidthPt: number;
      plan: MultiRunEditPlan;
    };

export type SafeLocalReflowPlan = {
  editable: boolean;
  reason: string | null;
  pageIndex: number;
  contentStreamIndex: number;
  originalText: string;
  replacementFlowText: string;
  linePlans: LocalReflowLinePlan[];
  operatorIndices: number[];
  sourceRunIndices: number[];
};

export type BuildSafeLocalReflowPlanInput = {
  pageIndex: number;
  contentStreamIndex: number;
  pageWidthPt: number;
  pageHeightPt: number;
  lines: LocalReflowLineInput[];
  allOperators: TextShowOperator[];
  replacementFirstLineText: string;
  resolvedFont: ResolvedFont;
  fontMetrics: FontMetrics;
};

function reject(input: BuildSafeLocalReflowPlanInput, reason: string): SafeLocalReflowPlan {
  return {
    editable: false,
    reason,
    pageIndex: input.pageIndex,
    contentStreamIndex: input.contentStreamIndex,
    originalText: "",
    replacementFlowText: "",
    linePlans: [],
    operatorIndices: [],
    sourceRunIndices: [],
  };
}

function approximatelyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= MATRIX_EPSILON;
}

function simpleFlowWhitespace(text: string): boolean {
  if (text.length === 0) return true;
  return text === text.trim() && !/[\t\r\n]/u.test(text) && !/ {2,}/u.test(text);
}

function linePlanWidth(plan: EditPlan | MultiRunEditPlan): {
  originalWidthPt: number;
  replacementWidthPt: number;
} {
  if ("subPlans" in plan) {
    const first = plan.subPlans[0];
    return {
      originalWidthPt: first?.originalWidthPt ?? 0,
      replacementWidthPt: first?.replacementWidthPt ?? 0,
    };
  }
  return {
    originalWidthPt: plan.originalWidthPt,
    replacementWidthPt: plan.replacementWidthPt,
  };
}

function buildLinePlan(
  input: BuildSafeLocalReflowPlanInput,
  line: LocalReflowLineInput,
  replacementText: string,
): EditPlan | MultiRunEditPlan {
  if (line.operatorIndices.length === 1) {
    const operatorIndex = line.operatorIndices[0];
    const operator = input.allOperators[operatorIndex];
    if (!operator) throw new Error(`Text operator ${operatorIndex} no longer exists.`);
    return buildEditPlan({
      pageIndex: input.pageIndex,
      contentStreamIndex: input.contentStreamIndex,
      operatorIndex,
      operator,
      replacementText,
      resolvedFont: input.resolvedFont,
      fontMetrics: input.fontMetrics,
    });
  }

  return buildMultiRunEditPlan({
    pageIndex: input.pageIndex,
    contentStreamIndex: input.contentStreamIndex,
    allOperators: input.allOperators,
    operatorIndices: line.operatorIndices,
    replacementText,
    resolvedFont: input.resolvedFont,
    fontMetrics: input.fontMetrics,
  });
}

function materializeLinePlan(
  input: BuildSafeLocalReflowPlanInput,
  line: LocalReflowLineInput,
  replacementText: string,
): LocalReflowLinePlan | null {
  const plan = buildLinePlan(input, line, replacementText);
  if (!plan.editable) return null;
  const widths = linePlanWidth(plan);
  const common = {
    lineId: line.lineId,
    sourceRunIndices: [...line.sourceRunIndices],
    originalText: plan.originalText,
    replacementText,
    originalWidthPt: widths.originalWidthPt,
    replacementWidthPt: widths.replacementWidthPt,
    availableWidthPt: line.availableWidthPt,
  };
  return "subPlans" in plan
    ? { kind: "multi", ...common, plan }
    : { kind: "single", ...common, plan };
}

function withinPage(bounds: LocalReflowBounds, widthPt: number, heightPt: number): boolean {
  return (
    Number.isFinite(bounds.xPt) &&
    Number.isFinite(bounds.yPt) &&
    Number.isFinite(bounds.widthPt) &&
    Number.isFinite(bounds.heightPt) &&
    bounds.widthPt > 0 &&
    bounds.heightPt > 0 &&
    bounds.xPt >= -WIDTH_TOLERANCE_PT &&
    bounds.yPt >= -WIDTH_TOLERANCE_PT &&
    bounds.xPt + bounds.widthPt <= widthPt + WIDTH_TOLERANCE_PT &&
    bounds.yPt + bounds.heightPt <= heightPt + WIDTH_TOLERANCE_PT
  );
}

/**
 * Reflows text only inside already-existing native text line slots.
 *
 * The line origins/matrices never move. A line may use empty horizontal room
 * already proven to belong to the same text block, but it may not exceed that
 * block-owned width. Every operator's post-show advance is still restored by
 * the existing TJ compensation engine, so following PDF content is not pushed.
 * No new line, Form edit, rotation, skew, font or graphics state is invented.
 */
export function buildSafeLocalReflowPlan(
  input: BuildSafeLocalReflowPlanInput,
): SafeLocalReflowPlan {
  if (input.lines.length < 2) {
    return reject(input, "Local reflow needs at least two proven text lines in the same block.");
  }
  if (input.lines.length > MAX_LOCAL_REFLOW_LINES) {
    return reject(input, `Local reflow is limited to ${MAX_LOCAL_REFLOW_LINES} nearby lines at a time.`);
  }
  if (!simpleFlowWhitespace(input.replacementFirstLineText)) {
    return reject(input, "Local reflow currently supports ordinary single-space text only; explicit or repeated whitespace is preserved by leaving this edit unchanged.");
  }

  const flattenedIndices = input.lines.flatMap((line) => line.operatorIndices);
  const uniqueIndices = new Set(flattenedIndices);
  if (flattenedIndices.length === 0 || uniqueIndices.size !== flattenedIndices.length) {
    return reject(input, "The selected text has ambiguous operator ownership, so local reflow is not safe.");
  }
  const sortedIndices = [...uniqueIndices].sort((a, b) => a - b);
  for (let index = 1; index < sortedIndices.length; index += 1) {
    if (sortedIndices[index] !== sortedIndices[index - 1] + 1) {
      return reject(input, "Unrelated PDF text operators sit inside this local region, so Lumeo will not reflow across it.");
    }
  }

  let referenceOperator: TextShowOperator | null = null;
  for (const line of input.lines) {
    if (line.writingDirection !== "ltr") {
      return reject(input, "Local reflow is currently limited to proven left-to-right text blocks.");
    }
    if (Math.abs(line.rotationDeg) > 0.5) {
      return reject(input, "Rotated text keeps its original layout; local reflow is not applied to rotated lines.");
    }
    if (!withinPage(line.boundsPt, input.pageWidthPt, input.pageHeightPt)) {
      return reject(input, "This text region touches or exceeds the page boundary, so local reflow is not safe.");
    }
    if (
      !Number.isFinite(line.availableWidthPt) ||
      line.availableWidthPt + WIDTH_TOLERANCE_PT < line.boundsPt.widthPt ||
      line.boundsPt.xPt + line.availableWidthPt > input.pageWidthPt + WIDTH_TOLERANCE_PT
    ) {
      return reject(input, "The available local line width is not proven inside the page/block geometry.");
    }
    if (line.operatorIndices.length === 0) {
      return reject(input, "A line has no uniquely owned text-show operator.");
    }

    for (const operatorIndex of line.operatorIndices) {
      const operator = input.allOperators[operatorIndex];
      if (!operator) return reject(input, `Text operator ${operatorIndex} no longer exists.`);
      if (operator.kind !== "Tj" && operator.kind !== "TJ") {
        return reject(input, "Quote text operators combine line movement with painting and are not reflowed automatically.");
      }
      if (operator.renderMode >= 4) {
        return reject(input, "Clipping text cannot be reflowed without changing the page clipping path.");
      }
      if (!operator.fontResourceName) {
        return reject(input, "The PDF font resource is not known for every line in this region.");
      }
      const matrix = operator.textRenderingMatrix;
      if (Math.abs(matrix[1]) > MATRIX_EPSILON || Math.abs(matrix[2]) > MATRIX_EPSILON) {
        return reject(input, "Skewed or transformed text is kept fixed because its local reflow geometry cannot be proven safe.");
      }

      if (!referenceOperator) {
        referenceOperator = operator;
      } else if (
        operator.fontResourceName !== referenceOperator.fontResourceName ||
        operator.fontSizePt !== referenceOperator.fontSizePt ||
        operator.charSpacing !== referenceOperator.charSpacing ||
        operator.wordSpacing !== referenceOperator.wordSpacing ||
        operator.horizontalScalingPct !== referenceOperator.horizontalScalingPct ||
        !approximatelyEqual(matrix[0], referenceOperator.textRenderingMatrix[0]) ||
        !approximatelyEqual(matrix[3], referenceOperator.textRenderingMatrix[3])
      ) {
        return reject(input, "This local region mixes fonts, text state, or transforms; automatic reflow stays disabled.");
      }
    }
  }

  const baseLinePlans: LocalReflowLinePlan[] = [];
  for (const line of input.lines) {
    const base = materializeLinePlan(input, line, "");
    if (!base) {
      return reject(input, "One or more lines cannot be decoded and rewritten safely with their original font.");
    }
    if (!simpleFlowWhitespace(base.originalText)) {
      return reject(input, "This local region contains significant tabs, line breaks, or repeated spaces, so Lumeo will not normalize it during reflow.");
    }
    baseLinePlans.push(base);
  }

  const followingText = baseLinePlans.slice(1).map((line) => line.originalText).filter(Boolean);
  const flowParts = [input.replacementFirstLineText, ...followingText].filter(Boolean);
  const replacementFlowText = flowParts.join(" ");
  if (!simpleFlowWhitespace(replacementFlowText)) {
    return reject(input, "The replacement cannot be represented without changing significant whitespace.");
  }
  const words = replacementFlowText ? replacementFlowText.split(" ") : [];

  const allocated: string[] = Array(input.lines.length).fill("");
  let wordIndex = 0;
  for (let lineIndex = 0; lineIndex < input.lines.length; lineIndex += 1) {
    let current = "";
    while (wordIndex < words.length) {
      const candidate = current ? `${current} ${words[wordIndex]}` : words[wordIndex];
      const candidatePlan = materializeLinePlan(input, input.lines[lineIndex], candidate);
      if (!candidatePlan) {
        return reject(input, `The text cannot be encoded safely in line ${lineIndex + 1}'s verified PDF font.`);
      }
      if (candidatePlan.replacementWidthPt <= input.lines[lineIndex].availableWidthPt + WIDTH_TOLERANCE_PT) {
        current = candidate;
        wordIndex += 1;
        continue;
      }
      if (!current) {
        return reject(input, `A word is wider than line ${lineIndex + 1}'s proven local region; Lumeo will not squeeze or overlap it silently.`);
      }
      break;
    }
    allocated[lineIndex] = current;
    if (wordIndex >= words.length) break;
  }

  if (wordIndex < words.length) {
    return reject(input, "The replacement needs more lines than this proven local text region provides.");
  }

  const linePlans: LocalReflowLinePlan[] = [];
  for (let lineIndex = 0; lineIndex < input.lines.length; lineIndex += 1) {
    const planned = materializeLinePlan(input, input.lines[lineIndex], allocated[lineIndex]);
    if (!planned) {
      return reject(input, `Line ${lineIndex + 1} could not be rebuilt safely after reflow.`);
    }
    if (planned.replacementWidthPt > input.lines[lineIndex].availableWidthPt + WIDTH_TOLERANCE_PT) {
      return reject(input, `Line ${lineIndex + 1} would exceed its proven local region after reflow.`);
    }
    if (planned.originalText !== planned.replacementText) linePlans.push(planned);
  }

  if (linePlans.length === 0) return reject(input, "The reflow would not change any text.");

  return {
    editable: true,
    reason: null,
    pageIndex: input.pageIndex,
    contentStreamIndex: input.contentStreamIndex,
    originalText: baseLinePlans.map((line) => line.originalText).join("\n"),
    replacementFlowText,
    linePlans,
    operatorIndices: sortedIndices,
    sourceRunIndices: input.lines.flatMap((line) => line.sourceRunIndices),
  };
}

export function flattenLocalReflowEditPlans(plan: SafeLocalReflowPlan): EditPlan[] {
  if (!plan.editable) return [];
  return plan.linePlans.flatMap((line) =>
    line.kind === "single" ? [line.plan] : line.plan.subPlans,
  );
}
