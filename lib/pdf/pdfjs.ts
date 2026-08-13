let pdfJsModulePromise: Promise<typeof import("pdfjs-dist")> | null = null;

// Single app-wide singleton so every PDF tool shares one pdf.js worker
// instance instead of each component initializing its own.
export async function loadPdfJsModule() {
  if (!pdfJsModulePromise) {
    pdfJsModulePromise = import("pdfjs-dist").then((module) => {
      if (!module.GlobalWorkerOptions.workerSrc) {
        module.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.mjs",
          import.meta.url,
        ).toString();
      }
      return module;
    });
  }

  return pdfJsModulePromise;
}

// Opens a pdf.js document from already-in-memory bytes. Always disables
// useWorkerFetch -- without it, one call site (Merge) silently hung forever
// on every getDocument() call: no error, no thumbnail, no page render, just
// an unresolved promise, because the worker never fetches the data itself
// when it's already been handed over from the main thread. Every other tool
// had already discovered this the hard way and set the flag inline; this
// wrapper makes it impossible for a new call site to forget it.
export async function openPdfJsDocument(data: ArrayBuffer | Uint8Array) {
  const pdfjs = await loadPdfJsModule();
  return pdfjs.getDocument({ data, useWorkerFetch: false }).promise;
}

// A single page's canvas render should never take this long. Real-world PDFs
// with a non-embedded symbol font (e.g. ZapfDingbats bullet glyphs from
// ReportLab-generated documents) have been observed to stall pdf.js's
// RenderTask indefinitely -- no error, no rejection, just an unresolved
// promise, reproducing across every render-based tool (Compress, PDF to JPG)
// regardless of render scale. Without this timeout that hang is silent and
// unrecoverable short of closing the tab; with it, the page fails loudly and
// the user gets an actionable error instead of a frozen progress indicator.
export const PAGE_RENDER_TIMEOUT_MS = 20_000;

// General-purpose guard for any single-page pdf.js operation (not just
// canvas rendering) that could hang instead of rejecting -- e.g.
// getTextContent() on a page with a malformed/circular content stream.
// Rejects with a descriptive, page-scoped error instead of letting one bad
// page stall (or silently starve) a whole-document loop forever.
export async function withPageTimeout<T>(
  promise: Promise<T>,
  pageNumber: number,
  timeoutMs: number,
  operation: string,
): Promise<T> {
  let timeoutId: number | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timeoutId = window.setTimeout(() => {
          reject(new Error(`Page ${pageNumber} took too long to ${operation}.`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
  }
}

type MinimalRenderTask = { promise: Promise<void>; cancel: () => void };

export async function renderPageWithTimeout(task: MinimalRenderTask, pageNumber: number) {
  let timeoutId: number | undefined;
  try {
    await Promise.race([
      task.promise,
      new Promise((_resolve, reject) => {
        timeoutId = window.setTimeout(() => {
          // Reject with the descriptive message before calling cancel() --
          // cancel() rejects task.promise too (with a generic
          // RenderingCancelledException), and since both are racing here,
          // whichever settles first wins the message the user sees.
          reject(
            new Error(
              `Page ${pageNumber} took too long to render. It may use an uncommon font or complex graphics -- try a lower quality profile, or fewer pages at once.`,
            ),
          );
          try {
            task.cancel();
          } catch {
            // Best-effort -- the render may already be past cancellation.
          }
        }, PAGE_RENDER_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
  }
}

// Pure scale-clamping math shared by any tool that renders a page to a
// canvas at a fixed default scale and needs to protect against an oversized
// MediaBox (rare, but not excluded by upload file-size/page-count limits) --
// mirrors CompressPdfTool.tsx's own inline dimensionScale calculation.
// Extracted here (rather than duplicated per tool) so it has one regression
// test independent of any canvas/DOM harness (this project has none for
// components). A no-op for any page whose longer side, at requestedScale,
// stays within maxDimensionPx -- only an oversized page has its scale
// reduced below what was asked for.
export function clampRenderScaleToMaxDimension(
  requestedScale: number,
  pageWidthPt: number,
  pageHeightPt: number,
  maxDimensionPx: number,
): number {
  return Math.min(requestedScale, maxDimensionPx / Math.max(pageWidthPt, pageHeightPt));
}

// Phase 26: clampRenderScaleToMaxDimension alone only bounds the LONGER
// side of the canvas -- a page whose MediaBox is large on BOTH axes (e.g.
// close to square, near the dimension cap on each side) can still pass
// that check while producing an enormous total pixel count. Concretely: at
// MAX_CANVAS_DIMENSION_PX=5200, a ~5200x5200pt page clamps its scale to
// ~1.0 (a no-op relative to the cap) and still rasterizes a 5200x5200
// canvas -- 27 million pixels, a ~108MB RGBA backing buffer for one canvas,
// before JPEG encoding even begins. Ordinary pages (Letter/A4, and even
// large-format ones like ANSI E at 34x44in) stay far below this and are
// completely unaffected -- this only reduces scale further for the rare
// page that's large on both axes at once, exactly mirroring
// computeAdaptiveRenderScale's own maxTotalPixels budget (see its own doc
// comment) but as a standalone, DPR/CSS-width-independent safety net that
// can be applied to the CURRENT live render path without any of the
// unverifiable-in-this-sandbox assumptions that keep that function itself
// unwired.
export function clampRenderScaleToPixelBudget(
  requestedScale: number,
  pageWidthPt: number,
  pageHeightPt: number,
  maxTotalPixels: number,
): number {
  const totalPixels = pageWidthPt * requestedScale * (pageHeightPt * requestedScale);
  if (totalPixels <= maxTotalPixels) return requestedScale;
  return requestedScale * Math.sqrt(maxTotalPixels / totalPixels);
}

// Phase 20: a device-aware render-scale policy, prepared as tested
// infrastructure but NOT yet wired into any live render path (see
// EditPdfTool.tsx's page-render effect, which still calls
// clampRenderScaleToMaxDimension directly, unchanged). Rationale:
//
// This function's whole purpose is to raster sharper on a real high-DPR
// mobile screen -- but doing that correctly needs the actual CSS pixel
// width the canvas will be DISPLAYED at, measured from the live page
// stage element. This project has no way to verify that measurement (or
// its downstream visual/performance effect) without a real device: the
// sandboxed browser tooling available in this environment cannot
// composite the interactive canvas at all (confirmed via repeated
// `screenshot` failures across the PDF-edit performance work in this
// thread), and even where DOM state IS inspectable, devicePixelRatio in
// that sandbox reads 1, so a DPR>1 code path can never be exercised there
// either. Shipping a live behavior change whose only different branch is
// completely unverifiable would repeat exactly the mistake this project's
// own PDF-edit history warns against (see PAGE_RENDER_SCALE's sibling
// comments) -- so this is deliberately scoped to "correct, tested,
// available for a future PR once real-device verification exists," not
// "wired in now."
//
// Design, so a future caller can trust it without re-deriving the math:
// - When cssDisplayWidthPx is unknown (null/<=0), returns EXACTLY
//   clampRenderScaleToMaxDimension(baseScale, ...) -- byte-for-byte the
//   scale every page already renders at today. This is the only path
//   this project's tooling can currently prove correct, and it's also
//   the correct fallback for a real caller that hasn't measured yet.
// - devicePixelRatio is capped at MAX_EFFECTIVE_DPR before use, so a
//   pathological report (e.g. some Android devices misreport very high
//   values) can't request a runaway raster size.
// - The result never drops BELOW baseScale -- this policy only ever
//   asks for equal-or-sharper output than today, never blurrier, so a
//   caller adopting it can't accidentally regress visual quality.
// - A hard total-pixel budget (independent of the longer-side cap
//   clampRenderScaleToMaxDimension already enforces, which alone can't
//   catch a wide-aspect page that stays under the longer-side cap but
//   would still blow a memory budget) caps the final scale.
// Snaps a continuously-varying desired render scale onto a small ladder of
// discrete steps, so a zoom gesture re-rasterizes once (or not at all)
// instead of on every wheel tick. Returns the SMALLEST step that is at
// least `desiredScale` -- rounding up, never down, so quantisation can only
// ever make the raster sharper than asked for, never blurrier. A desired
// scale above the top step saturates there; the caller's own pixel budget
// (clampRenderScaleToPixelBudget) is what actually bounds memory, and is
// applied after this.
//
// `steps` must be ascending. An empty ladder returns desiredScale
// unchanged, which degrades to "no quantisation" rather than to zero.
export function quantizeRenderScale(desiredScale: number, steps: readonly number[]): number {
  if (steps.length === 0) return desiredScale;
  for (const step of steps) {
    // Epsilon so a desired scale that lands microscopically above a step
    // (floating-point drift from a width/point-size division) doesn't jump
    // a whole rung and double the raster for nothing.
    if (desiredScale <= step + 1e-6) return step;
  }
  return steps[steps.length - 1];
}

const MAX_EFFECTIVE_DPR = 2;

export function computeAdaptiveRenderScale({
  pageWidthPt,
  pageHeightPt,
  cssDisplayWidthPx,
  devicePixelRatio,
  baseScale,
  maxDimensionPx,
  maxTotalPixels,
}: {
  pageWidthPt: number;
  pageHeightPt: number;
  // The CSS pixel width the rendered canvas will actually be DISPLAYED
  // at (the page stage element's own width, not the canvas's own
  // backing-store width) -- null/0 means "not measured," and falls back
  // to today's fixed-scale behavior exactly.
  cssDisplayWidthPx: number | null;
  devicePixelRatio: number;
  baseScale: number;
  maxDimensionPx: number;
  // Hard ceiling on total raster pixel count (width * height of the
  // resulting canvas), independent of maxDimensionPx's longer-side-only
  // cap. Callers without a specific memory budget in mind can pass
  // Infinity to rely on maxDimensionPx alone.
  maxTotalPixels: number;
}): number {
  if (!cssDisplayWidthPx || cssDisplayWidthPx <= 0 || !Number.isFinite(cssDisplayWidthPx)) {
    return clampRenderScaleToMaxDimension(baseScale, pageWidthPt, pageHeightPt, maxDimensionPx);
  }

  const effectiveDpr = Math.min(Math.max(devicePixelRatio, 1), MAX_EFFECTIVE_DPR);
  const desiredRasterWidthPx = cssDisplayWidthPx * effectiveDpr;
  const desiredScale = desiredRasterWidthPx / pageWidthPt;

  // The ceiling here is maxDimensionPx's RAW cap, not
  // clampRenderScaleToMaxDimension(baseScale, ...) -- for an ordinary
  // (non-oversized) page, that would equal baseScale itself, silently
  // making the "raster sharper for a high-DPR display" branch below a
  // permanent no-op (max(desiredScale, baseScale) can never exceed a
  // ceiling that's already pinned to baseScale). The raw cap is the
  // genuine longer-side pixel budget; baseScale only needs to act as the
  // FLOOR (see its own doc comment above).
  const rawDimensionCeiling = maxDimensionPx / Math.max(pageWidthPt, pageHeightPt);
  let scale = Math.min(Math.max(desiredScale, baseScale), rawDimensionCeiling);

  const totalPixels = pageWidthPt * scale * (pageHeightPt * scale);
  if (Number.isFinite(maxTotalPixels) && totalPixels > maxTotalPixels) {
    scale *= Math.sqrt(maxTotalPixels / totalPixels);
  }
  return scale;
}
