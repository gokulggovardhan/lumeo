import assert from "node:assert/strict";
import test from "node:test";
import { decideReplacementLayout } from "../lib/pdf/edit/replacementLayout.ts";

function plan(overrides: Partial<{
  editable: boolean;
  reason: string | null;
  originalWidthPt: number;
  replacementWidthPt: number;
  fontSizePt: number;
  replacementGlyphCodes: number[];
  replacementTextState: null;
}> = {}) {
  return {
    editable: true,
    reason: null,
    originalWidthPt: 100,
    replacementWidthPt: 100,
    fontSizePt: 12,
    replacementGlyphCodes: [1, 2, 3, 4, 5],
    replacementTextState: null,
    ...overrides,
  };
}

test("layout decision keeps equal-width and shorter replacements on the proven writer", () => {
  assert.equal(decideReplacementLayout(plan()).strategy, "natural");
  const shorter = decideReplacementLayout(plan({ replacementWidthPt: 75 }));
  assert.equal(shorter.strategy, "advance-compensation");
  assert.equal(shorter.safeToApplyWithCurrentWriter, true);
});

test("layout decision permits only bounded overflow on the current writer", () => {
  const bounded = decideReplacementLayout(plan({ replacementWidthPt: 107 }));
  assert.equal(bounded.strategy, "advance-compensation");
  assert.equal(bounded.safeToApplyWithCurrentWriter, true);

  const wider = decideReplacementLayout(
    plan({ replacementWidthPt: 112, fontSizePt: 20, replacementGlyphCodes: Array(20).fill(1) }),
  );
  assert.equal(wider.safeToApplyWithCurrentWriter, false);
  assert.equal(wider.strategy, "letter-spacing");
  assert.ok((wider.suggestedCharSpacingDeltaPt ?? 0) < 0);
});

test("layout decision escalates to horizontal scale and then blocks destructive overflow", () => {
  const scale = decideReplacementLayout(
    plan({ replacementWidthPt: 112, fontSizePt: 10, replacementGlyphCodes: [1, 2] }),
  );
  assert.equal(scale.strategy, "horizontal-scale");
  assert.ok((scale.suggestedHorizontalScaleFactor ?? 0) >= 0.88);

  const blocked = decideReplacementLayout(
    plan({ replacementWidthPt: 180, fontSizePt: 10, replacementGlyphCodes: [1, 2] }),
  );
  assert.equal(blocked.strategy, "blocked");
  assert.equal(blocked.safeToApplyWithCurrentWriter, false);
  assert.match(blocked.reason ?? "", /will not silently overlap/i);
});

test("layout decision preserves upstream rejection reason", () => {
  const rejected = decideReplacementLayout(
    plan({ editable: false, reason: "Font mapping unavailable." }),
  );
  assert.equal(rejected.strategy, "blocked");
  assert.equal(rejected.reason, "Font mapping unavailable.");
});
