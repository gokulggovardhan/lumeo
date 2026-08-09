import test from "node:test";
import assert from "node:assert/strict";

// lib/pdf/pdfjs.ts's withPageTimeout/renderPageWithTimeout use
// window.setTimeout/window.clearTimeout (they're browser-only utilities,
// same convention as the rest of that file). This test-only shim resolves
// `window` to globalThis so they run under this project's plain Node test
// runner -- it never touches the source file itself.
if (typeof globalThis.window === "undefined") {
  (globalThis as unknown as { window: typeof globalThis }).window = globalThis;
}

const { withPageTimeout, renderPageWithTimeout, PAGE_RENDER_TIMEOUT_MS, clampRenderScaleToMaxDimension, clampRenderScaleToPixelBudget, computeAdaptiveRenderScale } = await import("../lib/pdf/pdfjs.ts");

// Regression for Phase 9.3's production-readiness audit finding: EditPdfTool's
// page-render effect used to await page.render().promise and
// page.getTextContent() directly, with no timeout -- exactly the failure
// mode lib/pdf/pdfjs.ts's own comments document as a real, previously-
// observed pdf.js bug (a non-embedded symbol font can stall pdf.js's
// RenderTask indefinitely, no error, no rejection, unrecoverable short of
// closing the tab). EditPdfTool now wraps both calls with these same
// timeout guards CompressPdfTool/ExtractTextTool already used -- these
// tests cover the guards themselves (both the success path they must not
// interfere with, and the actual timeout-and-cancel path).

test("withPageTimeout resolves normally when the promise settles before the timeout", async () => {
  const result = await withPageTimeout(Promise.resolve("ok"), 1, 1000, "test");
  assert.equal(result, "ok");
});

test("withPageTimeout rejects with a page-scoped message when the promise never settles", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const hang = new Promise(() => {});
  const promise = withPageTimeout(hang, 3, 50, "load");
  t.mock.timers.tick(50);
  await assert.rejects(promise, /Page 3 took too long to load\./);
});

test("renderPageWithTimeout resolves normally when the render task settles before the timeout", async () => {
  const task = { promise: Promise.resolve(undefined), cancel: () => {} };
  await renderPageWithTimeout(task, 1);
});

// The exact scenario EditPdfTool's page-render effect is now guarded
// against: a render task whose promise never settles (the documented
// non-embedded-symbol-font hang) must reject with an actionable message AND
// call task.cancel(), rather than leaving the UI stuck on "Loading page
// preview..." forever.
test("renderPageWithTimeout rejects and cancels the task when the render hangs past PAGE_RENDER_TIMEOUT_MS", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let cancelled = false;
  const task = { promise: new Promise<void>(() => {}), cancel: () => { cancelled = true; } };
  const promise = renderPageWithTimeout(task, 5);
  t.mock.timers.tick(PAGE_RENDER_TIMEOUT_MS);
  await assert.rejects(promise, /Page 5 took too long to render\./);
  assert.equal(cancelled, true);
});

// Regression for Phase 9.3's production-readiness audit finding: EditPdfTool
// rendered every page at a fixed PAGE_RENDER_SCALE regardless of the page's
// own MediaBox size, so an oversized page (rare, but not excluded by the
// upload file-size/page-count limits) could produce an arbitrarily large
// canvas -- risking a slow render, a failed canvas allocation, or browser
// instability. clampRenderScaleToMaxDimension mirrors CompressPdfTool.tsx's
// own proven dimensionScale safety cap.

test("clampRenderScaleToMaxDimension is a no-op for an ordinary page well under the cap", () => {
  // A typical US Letter page (612x792pt) at a 1.3x scale is nowhere near
  // 5200px on its longer side -- the requested scale should pass through
  // unchanged.
  assert.equal(clampRenderScaleToMaxDimension(1.3, 612, 792, 5200), 1.3);
});

test("clampRenderScaleToMaxDimension reduces scale for an oversized page so its longer side fits the cap", () => {
  // A 6000x4000pt page at the requested 1.3x scale would be 7800px on its
  // longer side -- well past a 5200px cap. The clamped scale should bring
  // that side down to exactly the cap.
  const scale = clampRenderScaleToMaxDimension(1.3, 6000, 4000, 5200);
  assert.ok(scale < 1.3, "should reduce below the requested scale");
  assert.ok(Math.abs(6000 * scale - 5200) < 1e-9, "longer side should land exactly on the cap");
});

test("clampRenderScaleToMaxDimension uses whichever page dimension is longer, not just width", () => {
  // A tall/portrait oversized page -- height is the longer side here.
  const scale = clampRenderScaleToMaxDimension(1.3, 3000, 8000, 5200);
  assert.ok(Math.abs(8000 * scale - 5200) < 1e-9, "the taller dimension should be clamped to the cap");
});

// Phase 26: clampRenderScaleToMaxDimension alone only bounds the canvas's
// LONGER side -- a page large on BOTH axes can still pass that check while
// producing an enormous total pixel count (e.g. a ~5200x5200pt page clamps
// to ~1.0x, a no-op relative to the dimension cap, yet still rasterizes a
// 5200x5200 = ~27 megapixel canvas). clampRenderScaleToPixelBudget is a
// standalone second safety net for exactly that gap.

test("clampRenderScaleToPixelBudget is a no-op when the requested scale is already within budget", () => {
  // US Letter at the ordinary 1.3x scale is ~819K px -- nowhere near a
  // 20-million-pixel budget.
  assert.equal(clampRenderScaleToPixelBudget(1.3, 612, 792, 20_000_000), 1.3);
});

test("clampRenderScaleToPixelBudget reduces scale so a near-square oversized page's total pixel count lands exactly on the budget", () => {
  // A page that already passed clampRenderScaleToMaxDimension's own
  // longer-side check (scale ~1.0 for a ~5200pt page) but would still
  // produce ~27 million pixels at that scale.
  const pageWidthPt = 5200;
  const pageHeightPt = 5200;
  const requestedScale = 1.0;
  const budget = 20_000_000;
  const scale = clampRenderScaleToPixelBudget(requestedScale, pageWidthPt, pageHeightPt, budget);
  assert.ok(scale < requestedScale, "should reduce below the requested scale");
  const totalPixels = pageWidthPt * scale * (pageHeightPt * scale);
  assert.ok(Math.abs(totalPixels - budget) < 1, "total pixel count should land exactly on the budget");
});

test("clampRenderScaleToPixelBudget composed with clampRenderScaleToMaxDimension caps a near-square oversized page on both axes", () => {
  // The exact composition EditPdfTool.tsx uses: dimension cap first, then
  // pixel budget. A 6000x6000pt page would be 7800x7800 at 1.3x (clamped
  // by dimension to ~5200x5200 = ~27M px), and the pixel budget must then
  // reduce it further.
  const pageWidthPt = 6000;
  const pageHeightPt = 6000;
  const dimensionScale = clampRenderScaleToMaxDimension(1.3, pageWidthPt, pageHeightPt, 5200);
  const finalScale = clampRenderScaleToPixelBudget(dimensionScale, pageWidthPt, pageHeightPt, 20_000_000);
  assert.ok(finalScale < dimensionScale, "pixel budget should reduce further below the dimension-capped scale");
  const totalPixels = pageWidthPt * finalScale * (pageHeightPt * finalScale);
  assert.ok(totalPixels <= 20_000_000 + 1, `expected total pixels within budget, got ${totalPixels}`);
});

test("clampRenderScaleToPixelBudget does not affect a large-format page within budget (ANSI E at PAGE_RENDER_SCALE)", () => {
  // ANSI E (34x44in = 2448x3168pt) at the ordinary 1.3x scale -- a genuine
  // large real-world document size that must NOT be degraded by this cap.
  const scale = clampRenderScaleToPixelBudget(1.3, 2448, 3168, 20_000_000);
  assert.equal(scale, 1.3);
});

// Phase 20: computeAdaptiveRenderScale -- prepared, tested infrastructure for
// a future device-aware render policy (not yet wired into any live render
// path; see its own doc comment in lib/pdf/pdfjs.ts for why). These tests
// are the only proof of correctness available in this project, since there
// is no real high-DPR device or DOM harness to verify it against visually.

const US_LETTER_PT = { pageWidthPt: 612, pageHeightPt: 792 };

test("computeAdaptiveRenderScale falls back to today's exact fixed-scale behavior when cssDisplayWidthPx is unknown", () => {
  const scale = computeAdaptiveRenderScale({
    ...US_LETTER_PT,
    cssDisplayWidthPx: null,
    devicePixelRatio: 3,
    baseScale: 1.3,
    maxDimensionPx: 5200,
    maxTotalPixels: Infinity,
  });
  assert.equal(scale, clampRenderScaleToMaxDimension(1.3, 612, 792, 5200));
});

test("computeAdaptiveRenderScale treats a non-positive or non-finite cssDisplayWidthPx the same as unknown", () => {
  const fallback = clampRenderScaleToMaxDimension(1.3, 612, 792, 5200);
  for (const bad of [0, -100, NaN, Infinity]) {
    const scale = computeAdaptiveRenderScale({
      ...US_LETTER_PT,
      cssDisplayWidthPx: bad,
      devicePixelRatio: 2,
      baseScale: 1.3,
      maxDimensionPx: 5200,
      maxTotalPixels: Infinity,
    });
    assert.equal(scale, fallback, `cssDisplayWidthPx=${bad} should fall back exactly like null`);
  }
});

test("computeAdaptiveRenderScale never returns below baseScale, even for a tiny/narrow display", () => {
  // A 320px-wide phone at DPR 1 wants far less than the existing baseline
  // quality (320/612 ~= 0.52) -- the policy must never make output blurrier
  // than what already ships today.
  const scale = computeAdaptiveRenderScale({
    ...US_LETTER_PT,
    cssDisplayWidthPx: 320,
    devicePixelRatio: 1,
    baseScale: 1.3,
    maxDimensionPx: 5200,
    maxTotalPixels: Infinity,
  });
  assert.equal(scale, 1.3);
});

test("computeAdaptiveRenderScale increases scale for a wide, high-DPR display, above baseScale", () => {
  // A ~900 CSS px wide tablet/desktop-class display at DPR 2 genuinely
  // benefits from more than the mobile-conservative baseline.
  const scale = computeAdaptiveRenderScale({
    ...US_LETTER_PT,
    cssDisplayWidthPx: 900,
    devicePixelRatio: 2,
    baseScale: 1.3,
    maxDimensionPx: 5200,
    maxTotalPixels: Infinity,
  });
  assert.ok(scale > 1.3, `expected scale above baseline 1.3, got ${scale}`);
  assert.ok(Math.abs(scale - (900 * 2) / 612) < 1e-9, "should exactly match the desired raster width / page width");
});

test("computeAdaptiveRenderScale caps devicePixelRatio at MAX_EFFECTIVE_DPR (2) to prevent a runaway request", () => {
  const at2x = computeAdaptiveRenderScale({
    ...US_LETTER_PT,
    cssDisplayWidthPx: 900,
    devicePixelRatio: 2,
    baseScale: 1.3,
    maxDimensionPx: 5200,
    maxTotalPixels: Infinity,
  });
  const at4x = computeAdaptiveRenderScale({
    ...US_LETTER_PT,
    cssDisplayWidthPx: 900,
    devicePixelRatio: 4,
    baseScale: 1.3,
    maxDimensionPx: 5200,
    maxTotalPixels: Infinity,
  });
  assert.equal(at4x, at2x, "a DPR above the cap should produce identical output to the cap itself");
});

test("computeAdaptiveRenderScale still respects the longer-side dimension cap for an oversized page", () => {
  const scale = computeAdaptiveRenderScale({
    pageWidthPt: 3000,
    pageHeightPt: 4000,
    cssDisplayWidthPx: 1200,
    devicePixelRatio: 2,
    baseScale: 1.3,
    maxDimensionPx: 5200,
    maxTotalPixels: Infinity,
  });
  assert.ok(Math.abs(4000 * scale - 5200) < 1e-6, "the longer side (height) should land exactly on the dimension cap");
});

test("computeAdaptiveRenderScale enforces a hard total-pixel budget independent of the dimension cap", () => {
  // A wide-aspect page that stays comfortably under the longer-side cap
  // could still produce an enormous total pixel count -- the budget must
  // catch that case even when clampRenderScaleToMaxDimension alone would not.
  const scale = computeAdaptiveRenderScale({
    pageWidthPt: 2000,
    pageHeightPt: 100,
    cssDisplayWidthPx: 2000,
    devicePixelRatio: 2,
    baseScale: 1.3,
    maxDimensionPx: 5200,
    maxTotalPixels: 500_000,
  });
  const totalPixels = 2000 * scale * (100 * scale);
  assert.ok(totalPixels <= 500_000 + 1, `expected total pixels within budget, got ${totalPixels}`);
});
