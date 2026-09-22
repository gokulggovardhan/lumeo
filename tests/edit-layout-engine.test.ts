import assert from "node:assert/strict";
import test from "node:test";
import {
  decideTextReplacementLayout,
} from "../lib/pdf/edit/layoutEngine.ts";

function input(overrides: Partial<Parameters<typeof decideTextReplacementLayout>[0]> = {}) {
  return {
    operatorType: "Tj" as const,
    originalWidthPt: 100,
    replacementWidthPt: 100,
    glyphCount: 10,
    fontSizePt: 12,
    originalCharSpacingPt: 0,
    originalHorizontalScalingPct: 100,
    existingTjAdjustment: 0,
    ...overrides,
  };
}

test("layout engine preserves natural rendering for negligible width differences", () => {
  const decision = decideTextReplacementLayout(input({ replacementWidthPt: 100.8, existingTjAdjustment: 8 }));
  assert.equal(decision.strategy, "natural");
  assert.equal(decision.supported, true);
  assert.equal(decision.tailTjAdjustment, 8);
});

test("layout engine distributes a bounded width delta through character spacing first", () => {
  const decision = decideTextReplacementLayout(input({ replacementWidthPt: 104, glyphCount: 10 }));
  assert.equal(decision.strategy, "distributed-char-spacing");
  assert.equal(decision.supported, true);
  assert.ok(Math.abs((decision.targetCharSpacingPt ?? 99) + 0.4) < 1e-9);
  assert.equal(decision.originalCharSpacingPt, 0);
});

test("layout engine uses bounded horizontal scaling when spacing would be too aggressive", () => {
  const decision = decideTextReplacementLayout(input({ replacementWidthPt: 110, glyphCount: 5 }));
  assert.equal(decision.strategy, "horizontal-scale");
  assert.equal(decision.supported, true);
  assert.ok(Math.abs((decision.targetHorizontalScalingPct ?? 0) - (100 / 110) * 100) < 1e-9);
  assert.equal(decision.originalHorizontalScalingPct, 100);
});

test("layout engine surfaces local reflow as an explicit unsupported capability", () => {
  const decision = decideTextReplacementLayout(input({
    replacementWidthPt: 130,
    glyphCount: 5,
    safeReflowWidthPt: 140,
  }));
  assert.equal(decision.strategy, "local-reflow");
  assert.equal(decision.supported, false);
  assert.match(decision.reason ?? "", /local line reflow/i);
});

test("layout engine blocks width changes that exceed bounded spacing/scaling", () => {
  const decision = decideTextReplacementLayout(input({ replacementWidthPt: 160, glyphCount: 5 }));
  assert.equal(decision.strategy, "blocked");
  assert.equal(decision.supported, false);
  assert.match(decision.reason ?? "", /too different in width/i);
});

test("deletion is always a supported natural-layout operation", () => {
  const decision = decideTextReplacementLayout(input({
    replacementWidthPt: 0,
    glyphCount: 0,
  }));
  assert.equal(decision.strategy, "natural");
  assert.equal(decision.supported, true);
  assert.equal(decision.tailTjAdjustment, 0);
});
