import assert from "node:assert/strict";
import test from "node:test";
import { applyEditPlanToBytes, EditPlanRejectedError } from "../lib/pdf/edit/applyEditPlan.ts";
import type { EditPlan } from "../lib/pdf/edit/editPlan.ts";
import type { PdfTextLayoutDecision } from "../lib/pdf/edit/layoutEngine.ts";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function plan(overrides: Partial<EditPlan> = {}): EditPlan {
  return {
    pageIndex: 0,
    contentStreamIndex: 0,
    formPath: null,
    operatorIndex: 0,
    operatorType: "Tj",
    fontResourceName: "F1",
    fontSizePt: 12,
    wordSpacing: 0,
    charSpacing: 0,
    originalText: "AA",
    replacementText: "BB",
    originalGlyphCodes: [65, 65],
    replacementGlyphCodes: [66, 66],
    originalWidthPt: 12,
    replacementWidthPt: 12,
    tjSpacingDelta: 0,
    byteOffset: 0,
    byteLength: "(AA) Tj".length,
    fallbackFont: null,
    editable: true,
    reason: null,
    ...overrides,
  };
}

function decision(overrides: Partial<PdfTextLayoutDecision> = {}): PdfTextLayoutDecision {
  return {
    strategy: "natural",
    supported: true,
    reason: null,
    originalWidthPt: 12,
    replacementWidthPt: 12,
    deltaPt: 0,
    targetCharSpacingPt: null,
    targetHorizontalScalingPct: null,
    tailTjAdjustment: 0,
    originalCharSpacingPt: 0,
    originalHorizontalScalingPct: 100,
    ...overrides,
  };
}

test("legacy callers without a layout decision keep the original Tj rewrite shape", () => {
  const output = applyEditPlanToBytes(encoder.encode("(AA) Tj"), plan(), 1);
  assert.equal(decoder.decode(output), "<4242> Tj");
});

test("natural layout may promote Tj to TJ to preserve following text position", () => {
  const output = applyEditPlanToBytes(
    encoder.encode("(AA) Tj"),
    plan(),
    1,
    { layoutDecision: decision({ tailTjAdjustment: 18 }) },
  );
  assert.equal(decoder.decode(output), "[<4242> 18] TJ");
});

test("distributed character spacing is local and restores original Tc", () => {
  const output = applyEditPlanToBytes(
    encoder.encode("(AA) Tj"),
    plan(),
    1,
    {
      layoutDecision: decision({
        strategy: "distributed-char-spacing",
        targetCharSpacingPt: -0.35,
        originalCharSpacingPt: 0.1,
      }),
    },
  );
  assert.equal(decoder.decode(output), "-0.35 Tc <4242> Tj 0.1 Tc");
});

test("horizontal scaling is local and restores original Tz", () => {
  const output = applyEditPlanToBytes(
    encoder.encode("(AA) Tj"),
    plan(),
    1,
    {
      layoutDecision: decision({
        strategy: "horizontal-scale",
        targetHorizontalScalingPct: 94.5,
        originalHorizontalScalingPct: 97,
      }),
    },
  );
  assert.equal(decoder.decode(output), "94.5 Tz <4242> Tj 97 Tz");
});

test("double-quote replacement changes its own ac operand then restores Tc", () => {
  const quotePlan = plan({
    operatorType: '"',
    wordSpacing: 2,
    charSpacing: 0.25,
    byteLength: '2 0.25 (AA) "'.length,
  });
  const output = applyEditPlanToBytes(
    encoder.encode('2 0.25 (AA) "'),
    quotePlan,
    1,
    {
      layoutDecision: decision({
        strategy: "distributed-char-spacing",
        targetCharSpacingPt: -0.1,
        originalCharSpacingPt: 0.25,
      }),
    },
  );
  assert.equal(decoder.decode(output), '2 -0.1 <4242> " 0.25 Tc');
});

test("blocked layout decisions are rejected before mutating bytes", () => {
  assert.throws(
    () =>
      applyEditPlanToBytes(
        encoder.encode("(AA) Tj"),
        plan(),
        1,
        {
          layoutDecision: decision({
            strategy: "blocked",
            supported: false,
            reason: "Unsafe width mismatch",
          }),
        },
      ),
    (error) => error instanceof EditPlanRejectedError && /unsafe width mismatch/i.test(error.message),
  );
});
