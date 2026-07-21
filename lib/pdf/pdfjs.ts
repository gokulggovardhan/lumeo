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
