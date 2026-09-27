import type { PDFDocument } from "pdf-lib";
import type { Matrix2x3, TextShowOperator } from "./contentStream.ts";
import type { EmbeddedGlyphEvidence, ResolvedFont } from "./fontEncoding.ts";
import type { FontMetrics } from "./fontMetrics.ts";
import {
  buildEditPlan,
  isValidatedEditPlan,
  type EditPlan,
  type ValidatedEditPlan,
} from "./editPlan.ts";
import {
  applyValidatedEditPlanBatchToDocument,
  EditPlanRejectedError,
} from "./applyEditPlan.ts";

class ValidatedParagraphEditPlanProof {
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

type ParagraphEditPlanFields = {
  pageIndex: number;
  contentStreamIndex: number;
  operatorIndices: number[];
  originalText: string;
  replacementText: string;
  originalLines: string[];
  replacementLines: string[];
};

export type ValidatedParagraphEditPlan =
  Readonly<ParagraphEditPlanFields> &
  ValidatedParagraphEditPlanProof & {
    readonly editable: true;
    readonly reason: null;
    readonly subPlans: readonly ValidatedEditPlan[];
    readonly bytesPerCode: 1 | 2;
  };

export type RejectedParagraphEditPlan = ParagraphEditPlanFields & {
  editable: false;
  reason: string;
  subPlans: EditPlan[];
  bytesPerCode: 1 | 2;
};

export type ParagraphEditPlan =
  | ValidatedParagraphEditPlan
  | RejectedParagraphEditPlan;

const MATRIX_EPSILON = 1e-9;

function sameMatrix(a: Matrix2x3 | undefined, b: Matrix2x3 | undefined): boolean {
  if (!a || !b) return false;
  return a.every((value, index) => Math.abs(value - b[index]) <= MATRIX_EPSILON);
}

function sameLineOrientation(
  a: Matrix2x3 | undefined,
  b: Matrix2x3 | undefined,
): boolean {
  if (!a || !b) return false;
  return [0, 1, 2, 3].every(
    (index) => Math.abs(a[index] - b[index]) <= MATRIX_EPSILON,
  );
}

function hasDistinctTextSpaceBaseline(
  a: Matrix2x3 | undefined,
  b: Matrix2x3 | undefined,
): boolean {
  if (!a || !b) return false;
  // The text-line matrix is expressed in text space before the page CTM.
  // A horizontal Td may change only x/e while keeping the same baseline.
  // The first paragraph slice therefore requires a real text-space y/f
  // change between adjacent lines; arbitrary same-baseline repositioning
  // remains owned by the same-line planner/read-only paths.
  return Math.abs(a[5] - b[5]) > MATRIX_EPSILON;
}

function normalizedReplacementLines(text: string): string[] {
  return text.replace(/\r\n?/g, "\n").split("\n");
}

function rejected({
  pageIndex,
  contentStreamIndex,
  operatorIndices,
  replacementText,
  replacementLines,
  resolvedFont,
  reason,
  originalLines = [],
  subPlans = [],
}: {
  pageIndex: number;
  contentStreamIndex: number;
  operatorIndices: number[];
  replacementText: string;
  replacementLines: string[];
  resolvedFont: ResolvedFont;
  reason: string;
  originalLines?: string[];
  subPlans?: EditPlan[];
}): RejectedParagraphEditPlan {
  return {
    pageIndex,
    contentStreamIndex,
    operatorIndices,
    originalText: originalLines.join("\n"),
    replacementText,
    originalLines,
    replacementLines,
    editable: false,
    reason,
    subPlans,
    bytesPerCode: resolvedFont.bytesPerCode,
  };
}

function issueValidatedParagraphEditPlan({
  pageIndex,
  contentStreamIndex,
  operatorIndices,
  originalLines,
  replacementText,
  replacementLines,
  subPlans,
  bytesPerCode,
}: {
  pageIndex: number;
  contentStreamIndex: number;
  operatorIndices: number[];
  originalLines: string[];
  replacementText: string;
  replacementLines: string[];
  subPlans: readonly ValidatedEditPlan[];
  bytesPerCode: 1 | 2;
}): ValidatedParagraphEditPlan {
  const plan = Object.assign(new ValidatedParagraphEditPlanProof(), {
    pageIndex,
    contentStreamIndex,
    operatorIndices: [...operatorIndices],
    originalText: originalLines.join("\n"),
    replacementText,
    originalLines: [...originalLines],
    replacementLines: [...replacementLines],
    editable: true as const,
    reason: null,
    subPlans: [...subPlans],
    bytesPerCode,
  }) as ValidatedParagraphEditPlan;

  Object.freeze(plan.operatorIndices);
  Object.freeze(plan.originalLines);
  Object.freeze(plan.replacementLines);
  Object.freeze(plan.subPlans);
  Object.freeze(plan);
  return plan;
}

export function isValidatedParagraphEditPlan(
  plan: ParagraphEditPlan,
): plan is ValidatedParagraphEditPlan {
  return (
    plan instanceof ValidatedParagraphEditPlanProof &&
    plan.isPlannerIssued() &&
    plan.editable === true &&
    plan.reason === null &&
    Object.isFrozen(plan) &&
    plan.subPlans.length >= 2 &&
    plan.subPlans.every(isValidatedEditPlan)
  );
}

/**
 * Builds the first bounded cross-line native paragraph edit.
 *
 * This does NOT perform reflow. Each selected native PDF text-show operator
 * already owns one proven line/baseline. The replacement must contain exactly
 * the same number of explicit lines; every existing operator is rewritten with
 * exactly one corresponding replacement line, so its own line matrix, text
 * state and surrounding positioning operators remain untouched.
 *
 * Deliberately rejected:
 * - one-line selections (ordinary editPlan/multiRunEditPlan own those);
 * - discontinuous operator sets;
 * - separate BT/ET text objects;
 * - different CTMs or font resources;
 * - two selected operators on the same line (use multiRunEditPlan);
 * - horizontal-only repositioning that changes x but not the text-space baseline;
 * - changed line orientation or repeated/unknown line matrices;
 * - replacement line-count changes;
 * - any per-line replacement buildEditPlan cannot independently validate.
 */
export function buildParagraphEditPlan({
  pageIndex,
  contentStreamIndex,
  allOperators,
  operatorIndices,
  replacementText,
  resolvedFont,
  fontMetrics,
  embeddedGlyphEvidence = null,
}: {
  pageIndex: number;
  contentStreamIndex: number;
  allOperators: TextShowOperator[];
  operatorIndices: number[];
  replacementText: string;
  resolvedFont: ResolvedFont;
  fontMetrics: FontMetrics;
  embeddedGlyphEvidence?: EmbeddedGlyphEvidence | null;
}): ParagraphEditPlan {
  const sortedIndices = [...operatorIndices].sort((a, b) => a - b);
  const replacementLines = normalizedReplacementLines(replacementText);

  if (sortedIndices.length < 2) {
    return rejected({
      pageIndex,
      contentStreamIndex,
      operatorIndices: sortedIndices,
      replacementText,
      replacementLines,
      resolvedFont,
      reason:
        "A paragraph edit needs at least two existing native lines. Edit this line with the normal text editor.",
    });
  }

  for (let index = 1; index < sortedIndices.length; index += 1) {
    if (sortedIndices[index] !== sortedIndices[index - 1] + 1) {
      return rejected({
        pageIndex,
        contentStreamIndex,
        operatorIndices: sortedIndices,
        replacementText,
        replacementLines,
        resolvedFont,
        reason:
          "This paragraph selection is discontinuous. Select consecutive native lines with nothing unselected between them.",
      });
    }
  }

  const selected = sortedIndices.map((index) => allOperators[index]);
  if (selected.some((operator) => operator === undefined)) {
    return rejected({
      pageIndex,
      contentStreamIndex,
      operatorIndices: sortedIndices,
      replacementText,
      replacementLines,
      resolvedFont,
      reason: "One or more selected native text operators no longer exist.",
    });
  }

  const first = selected[0];
  const firstTextObjectIndex = first.textObjectIndex;
  if (
    firstTextObjectIndex === null ||
    firstTextObjectIndex === undefined ||
    selected.some((operator) => operator.textObjectIndex !== firstTextObjectIndex)
  ) {
    return rejected({
      pageIndex,
      contentStreamIndex,
      operatorIndices: sortedIndices,
      replacementText,
      replacementLines,
      resolvedFont,
      reason:
        "These lines belong to separate native text objects, so Lumeo cannot prove one safe paragraph transaction for them.",
    });
  }

  const fontResourceName = first.fontResourceName;
  if (
    !fontResourceName ||
    selected.some((operator) => operator.fontResourceName !== fontResourceName)
  ) {
    return rejected({
      pageIndex,
      contentStreamIndex,
      operatorIndices: sortedIndices,
      replacementText,
      replacementLines,
      resolvedFont,
      reason:
        "These lines do not share one proven PDF font resource. Edit them separately.",
    });
  }

  const firstCtm = first.ctm;
  if (!firstCtm || selected.some((operator) => !sameMatrix(operator.ctm, firstCtm))) {
    return rejected({
      pageIndex,
      contentStreamIndex,
      operatorIndices: sortedIndices,
      replacementText,
      replacementLines,
      resolvedFont,
      reason:
        "These lines use different page transforms, so editing them as one paragraph is not proven safe.",
    });
  }

  const lineMatrices = selected.map((operator) => operator.textLineMatrix);
  if (lineMatrices.some((matrix) => !matrix)) {
    return rejected({
      pageIndex,
      contentStreamIndex,
      operatorIndices: sortedIndices,
      replacementText,
      replacementLines,
      resolvedFont,
      reason:
        "One or more paragraph baselines could not be proven from the PDF text state.",
    });
  }

  for (let index = 1; index < lineMatrices.length; index += 1) {
    const previous = lineMatrices[index - 1];
    const current = lineMatrices[index];
    if (
      !sameLineOrientation(previous, current) ||
      !hasDistinctTextSpaceBaseline(previous, current)
    ) {
      return rejected({
        pageIndex,
        contentStreamIndex,
        operatorIndices: sortedIndices,
        replacementText,
        replacementLines,
        resolvedFont,
        reason:
          "These operators are not proven as separate native text lines with one stable line orientation and distinct baselines. Edit them separately.",
      });
    }
  }

  if (replacementLines.length !== selected.length) {
    return rejected({
      pageIndex,
      contentStreamIndex,
      operatorIndices: sortedIndices,
      replacementText,
      replacementLines,
      resolvedFont,
      reason:
        `This safe paragraph mode preserves the existing ${selected.length} native lines. Enter exactly ${selected.length} lines instead of changing the line count.`,
    });
  }

  const subPlans = selected.map((operator, position) =>
    buildEditPlan({
      pageIndex,
      contentStreamIndex,
      operatorIndex: sortedIndices[position],
      operator,
      replacementText: replacementLines[position],
      resolvedFont,
      fontMetrics,
      embeddedGlyphEvidence,
    }),
  );
  const originalLines = subPlans.map((plan) => plan.originalText);

  const validatedSubPlans: ValidatedEditPlan[] = [];
  for (const subPlan of subPlans) {
    if (!isValidatedEditPlan(subPlan)) {
      return rejected({
        pageIndex,
        contentStreamIndex,
        operatorIndices: sortedIndices,
        replacementText,
        replacementLines,
        resolvedFont,
        originalLines,
        subPlans,
        reason:
          subPlan.reason ||
          "At least one paragraph line could not be validated for native PDF rewriting.",
      });
    }
    validatedSubPlans.push(subPlan);
  }

  return issueValidatedParagraphEditPlan({
    pageIndex,
    contentStreamIndex,
    operatorIndices: sortedIndices,
    originalLines,
    replacementText: replacementLines.join("\n"),
    replacementLines,
    subPlans: validatedSubPlans,
    bytesPerCode: resolvedFont.bytesPerCode,
  });
}

/**
 * Writer boundary for the bounded paragraph plan. The aggregate planner-issued
 * proof is mandatory; each line is then passed through the existing validated
 * native batch writer, which revalidates every original byte target before the
 * stream is published.
 */
export async function applyParagraphEditPlanToDocument(
  doc: PDFDocument,
  plan: ParagraphEditPlan,
): Promise<void> {
  if (!isValidatedParagraphEditPlan(plan)) {
    throw new EditPlanRejectedError(
      plan.reason ||
        "Only a planner-issued validated paragraph edit plan may reach the native writer.",
    );
  }

  await applyValidatedEditPlanBatchToDocument(
    doc,
    plan.subPlans.map((subPlan) => ({
      plan: subPlan,
      bytesPerCode: plan.bytesPerCode,
    })),
  );
}
