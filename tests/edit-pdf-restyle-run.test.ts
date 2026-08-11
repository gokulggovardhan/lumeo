import assert from "node:assert/strict";
import test from "node:test";
import { planRunRestyle, type DetectedRunGeometry } from "../lib/pdf/edit/restyleRun.ts";

// A run 4% of the page tall, rendered at 12 device px, on a page rendered at
// 2 device px per PDF point -- so its real size is 6pt.
function makeRun(overrides: Partial<DetectedRunGeometry> = {}): DetectedRunGeometry {
  return { str: "Total Amount", xPct: 20, yPct: 30, widthPct: 25, heightPct: 4, fontSizePx: 12, ...overrides };
}

test("planRunRestyle converts device-pixel font size into PDF points", () => {
  const plan = planRunRestyle(makeRun({ fontSizePx: 24 }), 2);
  assert.equal(plan.text.fontSizePt, 12);
});

test("planRunRestyle carries the run's own text into the replacement", () => {
  const plan = planRunRestyle(makeRun({ str: "5534501001928" }), 2);
  assert.equal(plan.text.text, "5534501001928");
});

test("planRunRestyle pads the whiteout beyond the run box on all four sides", () => {
  const run = makeRun();
  const plan = planRunRestyle(run, 2);
  assert.ok(plan.whiteout.xPct < run.xPct, "should start left of the run");
  assert.ok(plan.whiteout.yPct < run.yPct, "should start above the run");
  assert.ok(plan.whiteout.xPct + plan.whiteout.widthPct > run.xPct + run.widthPct, "should end right of the run");
  assert.ok(plan.whiteout.yPct + plan.whiteout.heightPct > run.yPct + run.heightPct, "should end below the run");
});

// The core correctness property: a detected run's baseline sits at
// top + height*0.85, while export.ts draws a placed element's baseline at
// top + fontSize. The plan must offset the replacement so those coincide,
// otherwise restyled text renders low.
test("planRunRestyle raises the text box so its exported baseline matches the run's own", () => {
  const run = makeRun({ yPct: 30, heightPct: 4, fontSizePx: 12 });
  const pixelsPerPoint = 3;
  const plan = planRunRestyle(run, pixelsPerPoint);

  // Vertical scale implied by the run itself: its height in pct maps to its
  // font height in px, so this converts between the two.
  const pctPerPx = run.heightPct / run.fontSizePx;

  const runBaselinePct = run.yPct + run.heightPct * 0.85;
  // export.ts: baseline = element top + fontSizePt, expressed back in pct.
  const exportedBaselinePct = plan.text.yPct + plan.text.fontSizePt * pixelsPerPoint * pctPerPx;

  assert.ok(
    Math.abs(exportedBaselinePct - runBaselinePct) < 1e-9,
    `baselines should coincide; run ${runBaselinePct} vs exported ${exportedBaselinePct}`,
  );
});

test("planRunRestyle gives the text box slack so an edited replacement isn't clipped", () => {
  const run = makeRun();
  const plan = planRunRestyle(run, 2);
  assert.ok(plan.text.widthPct > run.widthPct);
  assert.ok(plan.text.heightPct > run.heightPct);
});

test("planRunRestyle never places geometry off the page, even for a run at the very top-left", () => {
  const plan = planRunRestyle(makeRun({ xPct: 0, yPct: 0 }), 2);
  assert.ok(plan.whiteout.xPct >= 0);
  assert.ok(plan.whiteout.yPct >= 0);
  assert.ok(plan.text.xPct >= 0);
  assert.ok(plan.text.yPct >= 0);
});

test("planRunRestyle keeps a run at the far right/bottom edge within the page bounds", () => {
  const plan = planRunRestyle(makeRun({ xPct: 96, yPct: 97, widthPct: 3, heightPct: 2 }), 2);
  assert.ok(plan.whiteout.xPct + plan.whiteout.widthPct <= 100 + 1e-9);
  assert.ok(plan.whiteout.yPct + plan.whiteout.heightPct <= 100 + 1e-9);
  assert.ok(plan.text.xPct + plan.text.widthPct <= 100 + 1e-9);
  assert.ok(plan.text.yPct + plan.text.heightPct <= 100 + 1e-9);
});

// Page metrics load a moment after the page image does, so a restyle
// triggered in that window would otherwise divide by zero and emit Infinity.
test("planRunRestyle falls back to a 1:1 ratio rather than emitting Infinity when page metrics aren't ready", () => {
  const plan = planRunRestyle(makeRun({ fontSizePx: 12 }), 0);
  assert.equal(plan.text.fontSizePt, 12);
  assert.ok(Number.isFinite(plan.text.yPct));
});
