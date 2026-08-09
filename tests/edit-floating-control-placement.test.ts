import assert from "node:assert/strict";
import test from "node:test";
import { pickHorizontalAlign, pickVerticalPlacement } from "../lib/pdf/edit/floatingControlPlacement.ts";

// Regression for Phase 29's edge-clipping fix: EditElementView.tsx's delete
// pill and EditPdfTool.tsx's inline text-editor Apply/Cancel toolbar both
// float near a percent-space box that lives inside the PDF stage, which
// clips overflow -- a box near an edge previously left its floating control
// partly or fully invisible. These are the pure percent-space decisions
// both call sites now make; see the module's own doc comment for why no
// stage measurement is involved.

test("pickVerticalPlacement returns 'above' when there is enough room above (default margin)", () => {
  // A box starting at yPct=50 has 50% of the page above it -- comfortably
  // past the default 12% margin.
  assert.equal(pickVerticalPlacement(50, 60), "above");
});

test("pickVerticalPlacement returns 'below' when there is NOT enough room above but there is below", () => {
  // A box starting at yPct=5 (top edge) has only 5% above it -- below the
  // default 12% margin -- but its bottom edge at 20% leaves 80% of the page
  // below, comfortably enough room.
  assert.equal(pickVerticalPlacement(5, 20), "below");
});

test("pickVerticalPlacement falls back to 'above' when neither side has enough room", () => {
  // A box spanning nearly the whole page height (5 to 95) leaves only 5%
  // above and 5% below -- below the default margin on both sides. Falls
  // back to the existing default rather than inventing new behavior for a
  // case neither real call site produces today.
  assert.equal(pickVerticalPlacement(5, 95), "above");
});

test("pickVerticalPlacement respects a caller-supplied margin (the inline editor's own wider margin)", () => {
  // yPct=15, bottomPct=20 -- 15% above is enough room for the default 12%
  // margin (so 'above' would be picked by default), but NOT enough for the
  // inline editor's own wider 24% margin used for its taller toolbar+
  // tooltip stack -- so with that margin it must fall through to checking
  // below instead, where 80% of the page remains, comfortably past 24%.
  assert.equal(pickVerticalPlacement(15, 20), "above");
  assert.equal(pickVerticalPlacement(15, 20, 24), "below");
});

test("pickVerticalPlacement treats exactly-at-the-margin as enough room (boundary is inclusive)", () => {
  assert.equal(pickVerticalPlacement(12, 20), "above");
  assert.equal(pickVerticalPlacement(11.9, 80), "below");
});

// Regression for the Phase 29 review finding: EditElementView.tsx's delete
// pill and EditPdfTool.tsx's inline-editor toolbar have DIFFERENT original
// defaults (above vs. below, respectively) -- reusing one hardcoded
// "always prefer above" rule for both silently flipped the inline editor's
// normal-case placement to above for any run outside roughly the top
// quarter of the page, not just genuine bottom-edge cases. preferBelow
// lets each caller keep its own actual default; these tests cover the
// preferBelow:true path EditPdfTool.tsx's inline editor now uses (the
// preferBelow:false/default tests above already cover EditElementView.tsx's
// unchanged above-preferring path).

test("pickVerticalPlacement with preferBelow:true returns 'below' when there is room both above and below", () => {
  // A box in the middle of the page (yPct=50, bottomPct=53) has room on
  // both sides -- with preferBelow:true this must pick 'below' (the inline
  // editor's actual normal-case default), NOT 'above' (which the
  // preferBelow:false default would have picked, and which is exactly the
  // bug this parameter fixes).
  assert.equal(pickVerticalPlacement(50, 53, 24, true), "below");
});

test("pickVerticalPlacement with preferBelow:true falls back to 'above' when there is insufficient room below", () => {
  // A box near the bottom edge (yPct=85, bottomPct=88) has only 12% below
  // it -- under the 24% margin the inline editor uses -- but 85% above,
  // comfortably enough room, so it flips to 'above'.
  assert.equal(pickVerticalPlacement(85, 88, 24, true), "above");
});

test("pickHorizontalAlign returns 'center' when there is room on both sides (default margin)", () => {
  // A box from 40 to 60 has 40% on the left and 40% on the right --
  // comfortably past the default 20% margin on both sides.
  assert.equal(pickHorizontalAlign(40, 60), "center");
});

test("pickHorizontalAlign returns 'start' when the box is near the left edge", () => {
  assert.equal(pickHorizontalAlign(5, 30), "start");
});

test("pickHorizontalAlign returns 'end' when the box is near the right edge", () => {
  assert.equal(pickHorizontalAlign(70, 95), "end");
});

test("pickHorizontalAlign prefers 'start' when neither side has room (checked before 'end')", () => {
  // A box spanning nearly the full width (5 to 95) is within margin of
  // BOTH edges -- 'start' wins because it's checked first, matching the
  // existing left-anchored default the inline editor's toolbar already used
  // before this fix.
  assert.equal(pickHorizontalAlign(5, 95), "start");
});
