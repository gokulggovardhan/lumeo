import type { PDFPageProxy } from "pdfjs-dist";
import {
  clampRenderScaleToMaxDimension,
  clampRenderScaleToPixelBudget,
  renderPageWithTimeout,
} from "../pdfjs.ts";

export const OCR_TARGET_DPI = 220;
export const OCR_MAX_DIMENSION_PX = 4096;
export const OCR_MAX_TOTAL_PIXELS = 12_000_000;

export type OcrProgress = Readonly<{
  status: string;
  progress: number;
}>;

export type OcrWord = Readonly<{
  textSource: "ocr";
  text: string;
  confidence: number;
  boundsPct: Readonly<{
    xPct: number;
    yPct: number;
    widthPct: number;
    heightPct: number;
  }>;
}>;

export type OcrPageResult = Readonly<{
  textSource: "ocr";
  pageIndex: number;
  text: string;
  confidence: number;
  renderScale: number;
  imageWidthPx: number;
  imageHeightPx: number;
  words: readonly OcrWord[];
}>;

type TesseractBbox = Readonly<{
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}>;

type TesseractWord = Readonly<{
  text: string;
  confidence: number;
  bbox: TesseractBbox;
}>;

type TesseractLine = Readonly<{ words: readonly TesseractWord[] }>;
type TesseractParagraph = Readonly<{ lines: readonly TesseractLine[] }>;
type TesseractBlock = Readonly<{ paragraphs: readonly TesseractParagraph[] }>;

type TesseractPage = Readonly<{
  text: string;
  confidence: number;
  blocks: readonly TesseractBlock[] | null;
}>;

type OcrWorker = Readonly<{
  recognize(
    image: HTMLCanvasElement,
    options?: Record<string, unknown>,
    output?: Record<string, boolean>,
  ): Promise<{ data: TesseractPage }>;
  setParameters(params: Record<string, string>): Promise<unknown>;
  terminate(): Promise<unknown>;
}>;

export type LocalOcrWorkerFactory = (
  langs: string,
  oem: number,
  options: Record<string, unknown>,
) => Promise<OcrWorker>;

export type LocalOcrEngineDependencies = Readonly<{
  createWorker?: LocalOcrWorkerFactory;
  createCanvas?: () => HTMLCanvasElement;
}>;

export type LocalOcrAssetUrls = Readonly<{
  workerPath: string;
  corePath: string;
  langPath: string;
}>;

export function localOcrAssetUrls(origin: string): LocalOcrAssetUrls {
  const base = new URL(origin);
  if (base.protocol !== "https:" && base.protocol !== "http:") {
    throw new Error("OCR assets require an http(s) application origin.");
  }
  const workerPath = new URL("/ocr/tesseract/worker.min.js", base).toString();
  const corePath = new URL("/ocr/tesseract-core", base).toString().replace(/\/$/, "");
  const langPath = new URL("/ocr/tessdata", base).toString().replace(/\/$/, "");
  for (const url of [workerPath, corePath, langPath]) {
    if (new URL(url).origin !== base.origin) {
      throw new Error("OCR assets must stay on the Lumeo application origin.");
    }
  }
  return { workerPath, corePath, langPath };
}

export function computeOcrRenderScale(
  pageWidthPt: number,
  pageHeightPt: number,
  targetDpi = OCR_TARGET_DPI,
): number {
  if (
    !Number.isFinite(pageWidthPt) ||
    !Number.isFinite(pageHeightPt) ||
    pageWidthPt <= 0 ||
    pageHeightPt <= 0 ||
    !Number.isFinite(targetDpi) ||
    targetDpi <= 0
  ) {
    throw new Error("OCR render dimensions and target DPI must be positive finite values.");
  }
  let scale = targetDpi / 72;
  scale = clampRenderScaleToMaxDimension(
    scale,
    pageWidthPt,
    pageHeightPt,
    OCR_MAX_DIMENSION_PX,
  );
  scale = clampRenderScaleToPixelBudget(
    scale,
    pageWidthPt,
    pageHeightPt,
    OCR_MAX_TOTAL_PIXELS,
  );
  return scale;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

export function ocrWordsFromBlocks(
  blocks: readonly TesseractBlock[] | null,
  imageWidthPx: number,
  imageHeightPx: number,
): OcrWord[] {
  if (imageWidthPx <= 0 || imageHeightPx <= 0) return [];
  const words: OcrWord[] = [];
  for (const block of blocks ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const line of paragraph.lines ?? []) {
        for (const word of line.words ?? []) {
          const text = word.text.trim();
          if (!text) continue;
          const left = clampPercent((word.bbox.x0 / imageWidthPx) * 100);
          const top = clampPercent((word.bbox.y0 / imageHeightPx) * 100);
          const right = clampPercent((word.bbox.x1 / imageWidthPx) * 100);
          const bottom = clampPercent((word.bbox.y1 / imageHeightPx) * 100);
          if (right <= left || bottom <= top) continue;
          words.push({
            textSource: "ocr",
            text,
            confidence: Math.max(
              0,
              Math.min(100, Number.isFinite(word.confidence) ? word.confidence : 0),
            ),
            boundsPct: {
              xPct: left,
              yPct: top,
              widthPct: right - left,
              heightPct: bottom - top,
            },
          });
        }
      }
    }
  }
  return words;
}

async function renderPageForOcr(
  page: Pick<PDFPageProxy, "getViewport" | "render">,
  pageNumber: number,
  createCanvas: () => HTMLCanvasElement,
  onRenderTask: (task: { cancel: () => void } | null) => void,
): Promise<{
  canvas: HTMLCanvasElement;
  scale: number;
}> {
  const pointViewport = page.getViewport({ scale: 1 });
  const scale = computeOcrRenderScale(pointViewport.width, pointViewport.height);
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas();
  canvas.width = Math.max(1, Math.ceil(viewport.width));
  canvas.height = Math.max(1, Math.ceil(viewport.height));
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("The browser could not create an OCR canvas.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  const renderTask = page.render({ canvas, canvasContext: context, viewport });
  onRenderTask(renderTask);
  try {
    await renderPageWithTimeout(renderTask, pageNumber);
    return { canvas, scale };
  } finally {
    onRenderTask(null);
  }
}

export type LocalOcrEngine = Readonly<{
  recognizePage(input: {
    page: Pick<PDFPageProxy, "getViewport" | "render">;
    pageIndex: number;
    onProgress?: (progress: OcrProgress) => void;
  }): Promise<OcrPageResult>;
  terminate(): Promise<void>;
}>;

export function createLocalOcrEngine(
  origin?: string,
  dependencies: LocalOcrEngineDependencies = {},
): LocalOcrEngine {
  let workerPromise: Promise<OcrWorker> | null = null;
  let worker: OcrWorker | null = null;
  let activeRenderTask: { cancel: () => void } | null = null;
  let recognitionActive = false;
  let terminated = false;
  let currentProgressListener: ((progress: OcrProgress) => void) | null = null;
  const createCanvas =
    dependencies.createCanvas ?? (() => document.createElement("canvas"));

  const loadWorkerFactory = async (): Promise<LocalOcrWorkerFactory> => {
    if (dependencies.createWorker) return dependencies.createWorker;
    const tesseract = await import("tesseract.js");
    const dynamicModule = tesseract as unknown as {
      createWorker?: LocalOcrWorkerFactory;
      default?: { createWorker?: LocalOcrWorkerFactory };
    };
    const createWorker =
      dynamicModule.createWorker ?? dynamicModule.default?.createWorker;
    if (!createWorker) throw new Error("Tesseract OCR could not be loaded.");
    return createWorker;
  };

  const ensureWorker = async (): Promise<OcrWorker> => {
    if (terminated) throw new Error("The OCR session has been terminated.");
    if (worker) return worker;
    if (!workerPromise) {
      const applicationOrigin =
        origin ?? (typeof window !== "undefined" ? window.location.origin : "");
      if (!applicationOrigin) {
        throw new Error("OCR can only start in a browser application origin.");
      }
      const assets = localOcrAssetUrls(applicationOrigin);
      workerPromise = (async () => {
        const createWorker = await loadWorkerFactory();
        return createWorker("eng", 1, {
          ...assets,
          workerBlobURL: false,
          gzip: true,
          cacheMethod: "write",
          legacyCore: false,
          legacyLang: false,
          logger: (message: { status?: string; progress?: number }) => {
            currentProgressListener?.({
              status: message.status ?? "Working locally",
              progress: Math.max(
                0,
                Math.min(
                  1,
                  Number.isFinite(message.progress) ? message.progress ?? 0 : 0,
                ),
              ),
            });
          },
        });
      })();
    }

    const pending = workerPromise;
    try {
      const resolved = await pending;
      if (terminated) {
        try {
          await resolved.terminate();
        } catch {
          // Best-effort cleanup after cancellation during worker startup.
        }
        throw new Error("The OCR session has been terminated.");
      }
      worker = resolved;
      if (workerPromise === pending) workerPromise = null;
      return resolved;
    } catch (error) {
      if (workerPromise === pending) workerPromise = null;
      throw error;
    }
  };

  const discardWorker = async (failedWorker: OcrWorker | null): Promise<void> => {
    if (!failedWorker) return;
    if (worker === failedWorker) worker = null;
    try {
      await failedWorker.terminate();
    } catch {
      // Failed OCR workers are never reused; cleanup remains best-effort.
    }
  };

  return {
    async recognizePage({ page, pageIndex, onProgress }) {
      if (terminated) throw new Error("The OCR session has been terminated.");
      if (recognitionActive) {
        throw new Error("Another local OCR recognition is already running.");
      }
      if (!Number.isInteger(pageIndex) || pageIndex < 0) {
        throw new Error("OCR page index must be a non-negative integer.");
      }
      recognitionActive = true;
      currentProgressListener = onProgress ?? null;
      let activeWorker: OcrWorker | null = null;
      try {
        onProgress?.({ status: "Preparing page locally", progress: 0 });
        const [rendered, readyWorker] = await Promise.all([
          renderPageForOcr(
            page,
            pageIndex + 1,
            createCanvas,
            (task) => {
              activeRenderTask = task;
            },
          ),
          ensureWorker(),
        ]);
        const { canvas, scale } = rendered;
        activeWorker = readyWorker;
        if (terminated) throw new Error("The OCR session was cancelled.");
        await activeWorker.setParameters({
          user_defined_dpi: String(Math.max(72, Math.round(scale * 72))),
        });
        const recognition = await activeWorker.recognize(
          canvas,
          {},
          { text: true, blocks: true },
        );
        if (terminated) throw new Error("The OCR session was cancelled.");
        const words = ocrWordsFromBlocks(
          recognition.data.blocks,
          canvas.width,
          canvas.height,
        );
        return {
          textSource: "ocr",
          pageIndex,
          text: recognition.data.text.trim(),
          confidence: Math.max(
            0,
            Math.min(
              100,
              Number.isFinite(recognition.data.confidence)
                ? recognition.data.confidence
                : 0,
            ),
          ),
          renderScale: scale,
          imageWidthPx: canvas.width,
          imageHeightPx: canvas.height,
          words,
        };
      } catch (error) {
        if (!terminated) {
          await discardWorker(activeWorker);
        }
        throw error;
      } finally {
        recognitionActive = false;
        currentProgressListener = null;
        activeRenderTask = null;
      }
    },

    async terminate() {
      terminated = true;
      recognitionActive = false;
      currentProgressListener = null;

      const renderTask = activeRenderTask;
      activeRenderTask = null;
      if (renderTask) {
        try {
          renderTask.cancel();
        } catch {
          // Best-effort: the render may already have completed.
        }
      }

      const currentWorker = worker;
      worker = null;
      const pending = workerPromise;
      workerPromise = null;

      if (currentWorker) {
        try {
          await currentWorker.terminate();
        } catch {
          // Best-effort cleanup: cancellation must not surface a second error.
        }
        return;
      }

      if (!pending) return;
      try {
        const pendingWorker = await pending;
        await pendingWorker.terminate();
      } catch {
        // Best-effort cleanup: cancellation must not surface a second error.
      }
    },
  };
}
