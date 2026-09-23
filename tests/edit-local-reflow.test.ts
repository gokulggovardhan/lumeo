import assert from "node:assert/strict";
import test from "node:test";
import type { TextShowOperator } from "../lib/pdf/edit/contentStream.ts";
import type { ResolvedFont } from "../lib/pdf/edit/fontEncoding.ts";
import type { FontMetrics } from "../lib/pdf/edit/fontMetrics.ts";
import {
  buildSafeLocalReflowPlan,
  type BuildSafeLocalReflowPlanInput,
  type LocalReflowLineInput,
} from "../lib/pdf/edit/localReflow.ts";

const codeToUnicode = new Map<number, string>();
const unicodeToCode = new Map<string, number>();
for (let code = 32; code <= 126; code += 1) {
  const char = String.fromCharCode(code);
  codeToUnicode.set(code, char);
  unicodeToCode.set(char, code);
}

const resolvedFont: ResolvedFont = {
  kind: "TrueType",
  baseFont: "TestSans",
  isEmbedded: true,
  isSubset: false,
  bytesPerCode: 1,
  encodingSource: "WinAnsi",
  glyphCodeToUnicode: codeToUnicode,
  unicodeToGlyphCode: unicodeToCode,
};

const metrics: FontMetrics = {
  bytesPerCode: 1,
  defaultWidth: 500,
  glyphWidths: new Map(
    [...codeToUnicode.keys()].map((code) => [code, code === 32 ? 250 : 500]),
  ),
  source: "Widths",
};

function bytes(text: string) {
  return Uint8Array.from([...text].map((char) => char.charCodeAt(0)));
}

function op(
  text: string,
  index: number,
  options: Partial<TextShowOperator> = {},
): TextShowOperator {
  return {
    kind: "Tj",
    start: index * 30,
    end: index * 30 + 20,
    strings: [bytes(text)],
    fontResourceName: "F1",
    fontSizePt: 10,
    textRenderingMatrix: [10, 0, 0, 10, 20, 100 - index * 14],
    charSpacing: 0,
    wordSpacing: 0,
    horizontalScalingPct: 100,
    leading: 14,
    textRise: 0,
    renderMode: 0,
    ...options,
  };
}

function line(
  lineId: string,
  operatorIndices: number[],
  yPt: number,
  options: Partial<LocalReflowLineInput> = {},
): LocalReflowLineInput {
  return {
    lineId,
    operatorIndices,
    sourceRunIndices: [operatorIndices[0]],
    boundsPt: { xPt: 20, yPt, widthPt: 42.5, heightPt: 12 },
    availableWidthPt: 60,
    rotationDeg: 0,
    writingDirection: "ltr",
    ...options,
  };
}

function input(
  operators: TextShowOperator[],
  lines: LocalReflowLineInput[],
  replacementFirstLineText: string,
): BuildSafeLocalReflowPlanInput {
  return {
    pageIndex: 0,
    contentStreamIndex: 0,
    pageWidthPt: 200,
    pageHeightPt: 200,
    lines,
    allOperators: operators,
    replacementFirstLineText,
    resolvedFont,
    fontMetrics: metrics,
  };
}

test("safe local reflow moves overflowing words into existing block-owned line room", () => {
  const operators = [op("AAAA BBBB", 0), op("CC", 1)];
  const plan = buildSafeLocalReflowPlan(
    input(operators, [line("l1", [0], 30), line("l2", [1], 50)], "AAAA BBBB CCCC"),
  );

  assert.equal(plan.editable, true, plan.reason ?? undefined);
  assert.equal(plan.replacementFlowText, "AAAA BBBB CCCC CC");
  assert.deepEqual(
    plan.linePlans.map((entry) => [entry.lineId, entry.replacementText]),
    [["l2", "CCCC CC"]],
    "the first line remains unchanged while the overflowing word moves into existing second-line room",
  );
});

test("same-line fragmented Tj ownership stays one local line plan", () => {
  const operators = [op("AA ", 0), op("BB", 1), op("CC", 2)];
  const lines = [
    line("l1", [0, 1], 30, { sourceRunIndices: [0], availableWidthPt: 55 }),
    line("l2", [2], 50, { sourceRunIndices: [1], availableWidthPt: 55 }),
  ];
  const plan = buildSafeLocalReflowPlan(input(operators, lines, "AA BB DD EE"));

  assert.equal(plan.editable, true, plan.reason ?? undefined);
  assert.equal(plan.linePlans[0]?.kind, "multi");
  assert.equal(plan.linePlans[0]?.replacementText, "AA BB DD EE");
  assert.deepEqual(plan.linePlans[0]?.sourceRunIndices, [0]);
});

test("local reflow blocks rotated and skewed/transformed text", () => {
  const rotated = buildSafeLocalReflowPlan(
    input(
      [op("AAAA", 0), op("BBBB", 1)],
      [line("l1", [0], 30, { rotationDeg: 90 }), line("l2", [1], 50)],
      "AAAA CCCC",
    ),
  );
  assert.equal(rotated.editable, false);
  assert.match(rotated.reason ?? "", /rotated/i);

  const skewed = buildSafeLocalReflowPlan(
    input(
      [op("AAAA", 0, { textRenderingMatrix: [10, 1, 0, 10, 20, 100] }), op("BBBB", 1)],
      [line("l1", [0], 30), line("l2", [1], 50)],
      "AAAA CCCC",
    ),
  );
  assert.equal(skewed.editable, false);
  assert.match(skewed.reason ?? "", /transformed|skewed/i);
});

test("local reflow blocks page-edge overflow and unproven block width", () => {
  const operators = [op("AAAA", 0), op("BBBB", 1)];
  const plan = buildSafeLocalReflowPlan({
    ...input(operators, [
      line("l1", [0], 30, {
        boundsPt: { xPt: 190, yPt: 30, widthPt: 20, heightPt: 12 },
        availableWidthPt: 20,
      }),
      line("l2", [1], 50),
    ], "AAAA CCCC"),
  });
  assert.equal(plan.editable, false);
  assert.match(plan.reason ?? "", /page boundary|page\/block geometry/i);
});

test("local reflow blocks ambiguous ownership, unrelated operators and mixed fonts", () => {
  const operators = [op("AAAA", 0), op("BBBB", 1), op("CCCC", 2)];
  const duplicate = buildSafeLocalReflowPlan(
    input(operators, [line("l1", [0], 30), line("l2", [0], 50)], "AAAA DD"),
  );
  assert.equal(duplicate.editable, false);
  assert.match(duplicate.reason ?? "", /ambiguous/i);

  const gap = buildSafeLocalReflowPlan(
    input(operators, [line("l1", [0], 30), line("l2", [2], 50)], "AAAA DD"),
  );
  assert.equal(gap.editable, false);
  assert.match(gap.reason ?? "", /unrelated/i);

  const mixed = buildSafeLocalReflowPlan(
    input(
      [op("AAAA", 0), op("BBBB", 1, { fontResourceName: "F2" })],
      [line("l1", [0], 30), line("l2", [1], 50)],
      "AAAA DD",
    ),
  );
  assert.equal(mixed.editable, false);
  assert.match(mixed.reason ?? "", /mixes fonts/i);
});

test("local reflow blocks quote/clipping operators and words wider than the proven region", () => {
  const quote = buildSafeLocalReflowPlan(
    input(
      [op("AAAA", 0, { kind: "'" }), op("BBBB", 1)],
      [line("l1", [0], 30), line("l2", [1], 50)],
      "AAAA DD",
    ),
  );
  assert.equal(quote.editable, false);
  assert.match(quote.reason ?? "", /quote/i);

  const clipping = buildSafeLocalReflowPlan(
    input(
      [op("AAAA", 0, { renderMode: 7 }), op("BBBB", 1)],
      [line("l1", [0], 30), line("l2", [1], 50)],
      "AAAA DD",
    ),
  );
  assert.equal(clipping.editable, false);
  assert.match(clipping.reason ?? "", /clipping/i);

  const overflow = buildSafeLocalReflowPlan(
    input(
      [op("AA", 0), op("BB", 1)],
      [
        line("l1", [0], 30, { availableWidthPt: 18, boundsPt: { xPt: 20, yPt: 30, widthPt: 10, heightPt: 12 } }),
        line("l2", [1], 50, { availableWidthPt: 18, boundsPt: { xPt: 20, yPt: 50, widthPt: 10, heightPt: 12 } }),
      ],
      "SUPERCALIFRAGILISTIC",
    ),
  );
  assert.equal(overflow.editable, false);
  assert.match(overflow.reason ?? "", /wider|more lines/i);
});
