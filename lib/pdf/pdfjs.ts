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
