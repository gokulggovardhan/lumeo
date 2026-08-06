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

const { withPageTimeout, renderPageWithTimeout, PAGE_RENDER_TIMEOUT_MS } = await import("../lib/pdf/pdfjs.ts");

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
