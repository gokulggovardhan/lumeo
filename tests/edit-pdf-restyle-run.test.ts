import assert from "node:assert/strict";
import test from "node:test";
import { planRunRestyle, type DetectedRunGeometry } from "../lib/pdf/edit/restyleRun.ts";

// A run 4% of the page tall, rendered at 12 device px, on a page rendered at
// 2 device px per PDF point -- so its real size is 6pt.
function makeRun(overrides: Partial<DetectedRunGeometry> = {}): DetectedRunGeometry {
  return { str: "Total Amount", xPct: 20, yPct: 30, widthPct: 25, heightPct: 4, fontSizePt: 12, ...overrides };
}

// Was "converts device-pixel font size into PDF points", asserting
// planRunRestyle(run, pixelsPerPoint=2) turned a 24px run into 12pt.
// Detection now reports points directly (DetectedTextRun.fontSizePt), so
// there is no conversion left to make -- and nothing that could go stale
// when the raster scale changes for zoom. The contract is now simply that
// the run's own point size survives into the replacement untouched.
test("planRunRestyle carries the run's point size straight into the replacement", () => {
  assert.equal(planRunRestyle(makeRun({ fontSizePt: 24 })).text.fontSizePt, 24);
  assert.equal(planRunRestyle(makeRun({ fontSizePt: 9.5 })).text.fontSizePt, 9.5);
});

// The property that makes high-zoom re-rasterization safe: nothing about a
// restyle depends on how sharply the page happens to be rendered. Two runs
// with identical geometry must produce identical plans, because there is no
// raster-scale input left for them to disagree about.
test("planRunRestyle is independent of the raster scale the page was rendered at", () => {
  const a = planRunRestyle(makeRun({ fontSizePt: 12, yPct: 30, heightPct: 4 }));
  const b = planRunRestyle(makeRun({ fontSizePt: 12, yPct: 30, heightPct: 4 }));
  assert.deepEqual(a, b);
});

test("planRunRestyle carries the run's own text into the replacement", () => {
  const plan = planRunRestyle(makeRun({ str: "5534501001928" }));
  assert.equal(plan.text.text, "5534501001928");
});

test("planRunRestyle pads the whiteout beyond the run box on all four sides", () => {
  const run = makeRun();
  const plan = planRunRestyle(run);
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
  const run = makeRun({ yPct: 30, heightPct: 4, fontSizePt: 12 });
  const plan = planRunRestyle(run);

  // Vertical scale implied by the run itself: its height in pct maps to its
  // font height in points, so this converts between the two. No
  // pixels-per-point factor any more -- both sides of this conversion are
  // now points, which is the whole point of detection reporting points.
  const pctPerPt = run.heightPct / run.fontSizePt;

  const runBaselinePct = run.yPct + run.heightPct * 0.85;
  // export.ts: baseline = element top + fontSizePt, expressed back in pct.
  const exportedBaselinePct = plan.text.yPct + plan.text.fontSizePt * pctPerPt;

  assert.ok(
    Math.abs(exportedBaselinePct - runBaselinePct) < 1e-9,
    `baselines should coincide; run ${runBaselinePct} vs exported ${exportedBaselinePct}`,
  );
});

test("planRunRestyle gives the text box slack so an edited replacement isn't clipped", () => {
  const run = makeRun();
  const plan = planRunRestyle(run);
  assert.ok(plan.text.widthPct > run.widthPct);
  assert.ok(plan.text.heightPct > run.heightPct);
});

test("planRunRestyle never places geometry off the page, even for a run at the very top-left", () => {
  const plan = planRunRestyle(makeRun({ xPct: 0, yPct: 0 }));
  assert.ok(plan.whiteout.xPct >= 0);
  assert.ok(plan.whiteout.yPct >= 0);
  assert.ok(plan.text.xPct >= 0);
  assert.ok(plan.text.yPct >= 0);
});

test("planRunRestyle keeps a run at the far right/bottom edge within the page bounds", () => {
  const plan = planRunRestyle(makeRun({ xPct: 96, yPct: 97, widthPct: 3, heightPct: 2 }));
  assert.ok(plan.whiteout.xPct + plan.whiteout.widthPct <= 100 + 1e-9);
  assert.ok(plan.whiteout.yPct + plan.whiteout.heightPct <= 100 + 1e-9);
  assert.ok(plan.text.xPct + plan.text.widthPct <= 100 + 1e-9);
  assert.ok(plan.text.yPct + plan.text.heightPct <= 100 + 1e-9);
});

// Page metrics load a moment after the page image does, so a restyle
// triggered in that window would otherwise divide by zero and emit Infinity.
test("planRunRestyle falls back to a 1:1 ratio rather than emitting Infinity when page metrics aren't ready", () => {
  const plan = planRunRestyle(makeRun({ fontSizePt: 12 }));
  assert.equal(plan.text.fontSizePt, 12);
  assert.ok(Number.isFinite(plan.text.yPct));
});
