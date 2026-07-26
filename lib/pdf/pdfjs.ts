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
