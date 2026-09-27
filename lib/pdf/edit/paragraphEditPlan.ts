import type { Matrix2x3, TextShowOperator } from "./contentStream.ts";
import {
  buildEditPlan,
  isValidatedEditPlan,
  type ValidatedEditPlan,
} from "./editPlan.ts";
import type { EmbeddedGlyphEvidence, ResolvedFont } from "./fontEncoding.ts";
import type { FontMetrics } from "./fontMetrics.ts";
import {
  buildMultiRunEditPlan,
  isValidatedMultiRunEditPlan,
} from "./multiRunEditPlan.ts";
import { detectComplexShapingRequirement } from "./shapingWriteGuard.ts";

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

export type ParagraphEditLine = Readonly<{
  lineIndex: number;
  operatorIndices: readonly number[];
  textLineMatrix: Matrix2x3;
  originalText: string;
  replacementText: string;
  subPlans: readonly ValidatedEditPlan[];
}>;

export type ValidatedParagraphEditPlan =
  Readonly<{
    pageIndex: number;
    contentStreamIndex: number;
    operatorIndices: readonly number[];
    originalText: string;
    replacementText: string;
    lines: readonly ParagraphEditLine[];
    editable: true;
    reason: null;
  }> &
  ValidatedParagraphEditPlanProof;

export type RejectedParagraphEditPlan = Readonly<{
  pageIndex: number;
  contentStreamIndex: number;
  operatorIndices: readonly number[];
  originalText: string;
  replacementText: string;
  lines: readonly ParagraphEditLine[];
  paragraphCandidate: boolean;
  editable: false;
  reason: string;
}>;

export type ParagraphEditPlan =
  | ValidatedParagraphEditPlan
  | RejectedParagraphEditPlan;

function sameMatrix(
  a: Matrix2x3 | undefined,
  b: Matrix2x3 | undefined,
): boolean {
  if (!a || !b) return false;
  return a.every((value, index) => Math.abs(value - b[index]) <= 1e-9);
}

function consecutive(indices: readonly number[]): boolean {
  for (let index = 1; index < indices.length; index += 1) {
    if (indices[index] !== indices[index - 1] + 1) return false;
  }
  return true;
}

function normalizedLines(text: string): string[] {
  return text.replace(/\r\n?/g, "\n").split("\n");
}

function rejected({
  pageIndex,
  contentStreamIndex,
  operatorIndices,
  replacementText,
  reason,
  originalText = "",
  lines = [],
  paragraphCandidate = false,
}: {
  pageIndex: number;
  contentStreamIndex: number;
  operatorIndices: readonly number[];
  replacementText: string;
  reason: string;
  originalText?: string;
  lines?: readonly ParagraphEditLine[];
  paragraphCandidate?: boolean;
}): RejectedParagraphEditPlan {
  return Object.freeze({
    pageIndex,
    contentStreamIndex,
    operatorIndices: Object.freeze([...operatorIndices]),
    originalText,
    replacementText,
    lines: Object.freeze([...lines]),
    paragraphCandidate,
    editable: false as const,
    reason,
  });
}

function issueValidated({
  pageIndex,
  contentStreamIndex,
  operatorIndices,
  replacementText,
  lines,
}: {
  pageIndex: number;
  contentStreamIndex: number;
  operatorIndices: readonly number[];
  replacementText: string;
  lines: readonly ParagraphEditLine[];
}): ValidatedParagraphEditPlan {
  const originalText = lines.map((line) => line.originalText).join("\n");
  const plan = Object.assign(new ValidatedParagraphEditPlanProof(), {
    pageIndex,
    contentStreamIndex,
    operatorIndices: Object.freeze([...operatorIndices]),
    originalText,
    replacementText,
    lines: Object.freeze([...lines]),
    editable: true as const,
    reason: null,
  }) as ValidatedParagraphEditPlan;
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
    plan.lines.length >= 2 &&
    plan.lines.every(
      (line) =>
        Object.isFrozen(line) &&
        line.subPlans.length >= 1 &&
        line.subPlans.every(isValidatedEditPlan),
    )
  );
}

/**
 * Builds the first bounded paragraph/cross-line native edit plan.
 *
 * This is intentionally line-preserving, not a reflow engine:
 * - one page content stream only;
 * - consecutive text-show operators only;
 * - one native text object and one CTM;
 * - one PDF font resource;
 * - at least two already-existing line matrices;
 * - replacement text must contain exactly one explicit line per existing line;
 * - no complex shaping, fallback-font insertion, Form XObjects, inferred
 *   wrapping, new baselines, or cross-object reflow.
 *
 * Every existing PDF line keeps its own textLineMatrix and text-show operator
 * locations. Same-line fragments are delegated to the already-certified
 * MultiRunEditPlan so their effective endpoint is preserved independently.
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
  allOperators: readonly TextShowOperator[];
  operatorIndices: readonly number[];
  replacementText: string;
  resolvedFont: ResolvedFont;
  fontMetrics: FontMetrics;
  embeddedGlyphEvidence?: EmbeddedGlyphEvidence | null;
}): ParagraphEditPlan {
  const sortedIndices = [...operatorIndices].sort((a, b) => a - b);

  if (sortedIndices.length < 2) {
    return rejected({
      pageIndex,
      contentStreamIndex,
      operatorIndices: sortedIndices,
      replacementText,
      reason:
        "A paragraph edit needs at least two native text operators; use the ordinary editor for one operator.",
    });
  }
  if (!consecutive(sortedIndices)) {
    return rejected({
      pageIndex,
      contentStreamIndex,
      operatorIndices: sortedIndices,
      replacementText,
      reason:
        "This paragraph selection is discontinuous, so Lumeo cannot preserve untouched text between the selected operators.",
    });
  }

  const selected = sortedIndices.map((index) => allOperators[index]);
  if (selected.some((operator) => operator === undefined)) {
    return rejected({
      pageIndex,
      contentStreamIndex,
      operatorIndices: sortedIndices,
      replacementText,
      reason: "One or more paragraph operators no longer exist.",
    });
  }

  const first = selected[0]!;
  const resourceName = first.fontResourceName;
  if (
    !resourceName ||
    selected.some((operator) => operator!.fontResourceName !== resourceName)
  ) {
    return rejected({
      pageIndex,
      contentStreamIndex,
      operatorIndices: sortedIndices,
      replacementText,
      reason:
        "This paragraph crosses PDF font resources. Edit those lines separately so each font keeps its own native encoding.",
    });
  }

  const textObjectIndex = first.textObjectIndex;
  if (
    textObjectIndex === null ||
    textObjectIndex === undefined ||
    selected.some((operator) => operator!.textObjectIndex !== textObjectIndex)
  ) {
    return rejected({
      pageIndex,
      contentStreamIndex,
      operatorIndices: sortedIndices,
      replacementText,
      reason:
        "This paragraph crosses separate native PDF text objects, so one safe line-preserving edit cannot be proven.",
    });
  }

  const ctm = first.ctm;
  if (!ctm || selected.some((operator) => !sameMatrix(operator!.ctm, ctm))) {
    return rejected({
      pageIndex,
      contentStreamIndex,
      operatorIndices: sortedIndices,
      replacementText,
      reason:
        "This paragraph crosses incompatible PDF transforms. Edit each transformed region separately.",
    });
  }

  type Group = {
    matrix: Matrix2x3;
    operatorIndices: number[];
  };
  const groups: Group[] = [];
  for (const operatorIndex of sortedIndices) {
    const operator = allOperators[operatorIndex]!;
    if (!operator.textLineMatrix) {
      return rejected({
        pageIndex,
        contentStreamIndex,
        operatorIndices: sortedIndices,
        replacementText,
        reason:
          "One selected line has no proven native line matrix, so its baseline cannot be preserved safely.",
      });
    }
    const previous = groups[groups.length - 1];
    if (previous && sameMatrix(previous.matrix, operator.textLineMatrix)) {
      previous.operatorIndices.push(operatorIndex);
    } else {
      groups.push({
        matrix: [...operator.textLineMatrix] as Matrix2x3,
        operatorIndices: [operatorIndex],
      });
    }
  }

  if (groups.length < 2) {
    return rejected({
      pageIndex,
      contentStreamIndex,
      operatorIndices: sortedIndices,
      replacementText,
      reason:
        "These operators are on one native PDF line; use the existing multi-run editor for this selection.",
    });
  }

  const replacementLines = normalizedLines(replacementText);
  if (replacementLines.length !== groups.length) {
    return rejected({
      pageIndex,
      contentStreamIndex,
      operatorIndices: sortedIndices,
      replacementText,
      reason:
        `This selection contains ${groups.length} proven PDF lines. Enter exactly ${groups.length} replacement lines so Lumeo can preserve every existing baseline without inventing reflow.`,
      paragraphCandidate: true,
    });
  }

  const lines: ParagraphEditLine[] = [];
  for (let lineIndex = 0; lineIndex < groups.length; lineIndex += 1) {
    const group = groups[lineIndex]!;
    const lineReplacement = replacementLines[lineIndex] ?? "";

    const shaping = detectComplexShapingRequirement(lineReplacement);
    if (shaping.required) {
      return rejected({
        pageIndex,
        contentStreamIndex,
        operatorIndices: sortedIndices,
        replacementText,
        reason:
          "This multi-line replacement requires complex shaping. Edit that line individually so the shaped-glyph writer can prove it separately.",
        lines,
        paragraphCandidate: true,
      });
    }

    let lineOriginalText = "";
    let subPlans: ValidatedEditPlan[] = [];

    if (group.operatorIndices.length === 1) {
      const operatorIndex = group.operatorIndices[0]!;
      const operator = allOperators[operatorIndex]!;
      const plan = buildEditPlan({
        pageIndex,
        contentStreamIndex,
        operatorIndex,
        operator,
        replacementText: lineReplacement,
        resolvedFont,
        fontMetrics,
        embeddedGlyphEvidence,
      });
      if (!isValidatedEditPlan(plan)) {
        return rejected({
          pageIndex,
          contentStreamIndex,
          operatorIndices: sortedIndices,
          replacementText,
          reason: plan.reason,
          lines,
          paragraphCandidate: true,
        });
      }
      if (plan.fallbackFont) {
        return rejected({
          pageIndex,
          contentStreamIndex,
          operatorIndices: sortedIndices,
          replacementText,
          reason:
            "This paragraph line would require a substitute font. Edit that line individually instead of changing paragraph font resources implicitly.",
          lines,
          paragraphCandidate: true,
        });
      }
      lineOriginalText = plan.originalText;
      subPlans = [plan];
    } else {
      const multi = buildMultiRunEditPlan({
        pageIndex,
        contentStreamIndex,
        allOperators: [...allOperators],
        operatorIndices: group.operatorIndices,
        replacementText: lineReplacement,
        resolvedFont,
        fontMetrics,
        embeddedGlyphEvidence,
      });
      if (!isValidatedMultiRunEditPlan(multi)) {
        return rejected({
          pageIndex,
          contentStreamIndex,
          operatorIndices: sortedIndices,
          replacementText,
          reason: multi.reason,
          lines,
          paragraphCandidate: true,
        });
      }
      if (multi.subPlans.some((plan) => plan.fallbackFont)) {
        return rejected({
          pageIndex,
          contentStreamIndex,
          operatorIndices: sortedIndices,
          replacementText,
          reason:
            "This paragraph line would require a substitute font. Edit that line individually instead of changing paragraph font resources implicitly.",
          lines,
          paragraphCandidate: true,
        });
      }
      lineOriginalText = multi.originalText;
      subPlans = [...multi.subPlans];
    }

    const line: ParagraphEditLine = Object.freeze({
      lineIndex,
      operatorIndices: Object.freeze([...group.operatorIndices]),
      textLineMatrix: Object.freeze([...group.matrix]) as Matrix2x3,
      originalText: lineOriginalText,
      replacementText: lineReplacement,
      subPlans: Object.freeze(subPlans),
    });
    lines.push(line);
  }

  return issueValidated({
    pageIndex,
    contentStreamIndex,
    operatorIndices: sortedIndices,
    replacementText: replacementLines.join("\n"),
    lines,
  });
}
