import assert from "node:assert/strict";
import test from "node:test";
import type { TextShowOperator } from "../lib/pdf/edit/contentStream.ts";
import type { ResolvedFont } from "../lib/pdf/edit/fontEncoding.ts";
import type { FontMetrics } from "../lib/pdf/edit/fontMetrics.ts";
import { buildMultiRunEditPlan } from "../lib/pdf/edit/multiRunEditPlan.ts";
import { decideReplacementLayout } from "../lib/pdf/edit/replacementLayout.ts";

const glyphCodeToUnicode = new Map<number, string>();
const unicodeToGlyphCode = new Map<string, number>();
for (let code = 32; code <= 126; code += 1) {
  const char = String.fromCharCode(code);
  glyphCodeToUnicode.set(code, char);
  unicodeToGlyphCode.set(char, code);
}

const font: ResolvedFont = {
  kind: "TrueType",
  baseFont: "TestSans",
  isEmbedded: true,
  isSubset: false,
  bytesPerCode: 1,
  encodingSource: "WinAnsi",
  glyphCodeToUnicode,
  unicodeToGlyphCode,
};

const metrics: FontMetrics = {
  bytesPerCode: 1,
  defaultWidth: 500,
  glyphWidths: new Map(
    [...glyphCodeToUnicode.keys()].map((code) => [code, code === 32 ? 250 : 500]),
  ),
  source: "Widths",
};

function textBytes(value: string) {
  return Uint8Array.from([...value].map((char) => char.charCodeAt(0)));
}

function operator(
  text: string,
  index: number,
  x: number,
  y: number,
  overrides: Partial<TextShowOperator> = {},
): TextShowOperator {
  return {
    kind: "Tj",
    start: index * 40,
    end: index * 40 + 24,
    strings: [textBytes(text)],
    fontResourceName: "F1",
    fontSizePt: 10,
    textRenderingMatrix: [10, 0, 0, 10, x, y],
    charSpacing: 0,
    wordSpacing: 0,
    horizontalScalingPct: 100,
    leading: 14,
    textRise: 0,
    renderMode: 0,
    ...overrides,
  };
}

function plan(operators: TextShowOperator[], replacementText: string) {
  return buildMultiRunEditPlan({
    pageIndex: 0,
    contentStreamIndex: 0,
    allOperators: operators,
    operatorIndices: operators.map((_operator, index) => index),
    replacementText,
    resolvedFont: font,
    fontMetrics: metrics,
  });
}

test("multi-run planner performs controlled local reflow across aligned existing lines", () => {
  const result = plan(
    [
      operator("AAAA BBBB", 0, 20, 100),
      operator("CC", 1, 20, 82),
    ],
    "AAAA BBBB CCCC",
  );

  assert.equal(result.editable, true, result.reason ?? undefined);
  assert.ok(result.localReflow, "expected a proven local-reflow plan");
  assert.deepEqual(result.localReflow?.lineTexts, ["AAAA BBBB", "CCCC"]);
  assert.deepEqual(result.localReflow?.lineOperatorIndices, [[0], [1]]);

  const layout = decideReplacementLayout(result.subPlans[0]);
  assert.equal(layout.strategy, "local-reflow");
  assert.equal(layout.safeToApplyWithCurrentWriter, true);
  assert.equal(layout.reason, null);
});

test("fragmented same-line Tj/TJ selection keeps the established multi-run compensation path", () => {
  const result = plan(
    [
      operator("AA ", 0, 20, 100),
      operator("BB", 1, 20, 100, { kind: "TJ" }),
    ],
    "AA CC",
  );

  assert.equal(result.editable, true, result.reason ?? undefined);
  assert.equal(result.localReflow, undefined);
  assert.equal(result.subPlans.length, 2);
  assert.equal(result.subPlans[0].replacementText, "AA CC");
  assert.equal(result.subPlans[1].replacementText, "");
});

test("local reflow remains disabled for rotated, skewed and clipping text", () => {
  const rotated = plan(
    [
      operator("AAAA BBBB", 0, 20, 100, { textRenderingMatrix: [0, 10, -10, 0, 20, 100] }),
      operator("CC", 1, 20, 82, { textRenderingMatrix: [0, 10, -10, 0, 20, 82] }),
    ],
    "AAAA BBBB CCCC",
  );
  assert.equal(rotated.localReflow, undefined);
  assert.equal(decideReplacementLayout(rotated.subPlans[0]).safeToApplyWithCurrentWriter, false);

  const skewed = plan(
    [
      operator("AAAA BBBB", 0, 20, 100, { textRenderingMatrix: [10, 1, 0, 10, 20, 100] }),
      operator("CC", 1, 20, 82, { textRenderingMatrix: [10, 1, 0, 10, 20, 82] }),
    ],
    "AAAA BBBB CCCC",
  );
  assert.equal(skewed.localReflow, undefined);

  const clipping = plan(
    [
      operator("AAAA BBBB", 0, 20, 100, { renderMode: 7 }),
      operator("CC", 1, 20, 82, { renderMode: 7 }),
    ],
    "AAAA BBBB CCCC",
  );
  assert.equal(clipping.editable, false);
  assert.match(clipping.reason ?? "", /clipping path/i);
});

test("local reflow refuses indented/misaligned lines and mixed text state", () => {
  const indented = plan(
    [operator("AAAA BBBB", 0, 20, 100), operator("CC", 1, 40, 82)],
    "AAAA BBBB CCCC",
  );
  assert.equal(indented.localReflow, undefined);

  const mixedScale = plan(
    [
      operator("AAAA BBBB", 0, 20, 100),
      operator("CC", 1, 20, 82, { horizontalScalingPct: 90, textRenderingMatrix: [9, 0, 0, 10, 20, 82] }),
    ],
    "AAAA BBBB CCCC",
  );
  assert.equal(mixedScale.localReflow, undefined);
});

test("local reflow refuses replacements that need more than the existing paragraph width", () => {
  const result = plan(
    [operator("AAAA BBBB", 0, 20, 100), operator("CC", 1, 20, 82)],
    "AAAA BBBB CCCCCCCCCCCCCCCCCCCCCCCCC",
  );

  assert.equal(result.localReflow, undefined);
  const layout = decideReplacementLayout(result.subPlans[0]);
  assert.equal(layout.safeToApplyWithCurrentWriter, false);
  assert.ok(["horizontal-scale", "blocked"].includes(layout.strategy));
});

test("local reflow rejects mixed font resources before any redistribution", () => {
  const result = plan(
    [
      operator("AAAA BBBB", 0, 20, 100),
      operator("CC", 1, 20, 82, { fontResourceName: "F2" }),
    ],
    "AAAA BBBB CCCC",
  );
  assert.equal(result.editable, false);
  assert.match(result.reason ?? "", /more than one font resource/i);
});
