import type { PDFPageProxy } from "pdfjs-dist";
import {
  clampRenderScaleToMaxDimension,
  clampRenderScaleToPixelBudget,
  renderPageWithTimeout,
} from "../pdfjs.ts";

export const OCR_TARGET_DPI = 220;
export const OCR_MAX_DIMENSION_PX = 4096;
export const OCR_MAX_TOTAL_PIXELS = 12_000_000;

export const LOCAL_OCR_LANGUAGES = Object.freeze([
  { code: "eng", label: "English" },
  { code: "spa", label: "Spanish" },
  { code: "fra", label: "French" },
  { code: "deu", label: "German" },
  { code: "ita", label: "Italian" },
  { code: "por", label: "Portuguese" },
] as const);

export type LocalOcrLanguage = (typeof LOCAL_OCR_LANGUAGES)[number]["code"];
export const DEFAULT_LOCAL_OCR_LANGUAGE: LocalOcrLanguage = "eng";

export function isLocalOcrLanguage(value: string): value is LocalOcrLanguage {
  return LOCAL_OCR_LANGUAGES.some((language) => language.code === value);
}

export function localOcrLanguageLabel(language: LocalOcrLanguage): string {
  return (
    LOCAL_OCR_LANGUAGES.find((candidate) => candidate.code === language)?.label ??
    language
  );
}

export type OcrOrientationCorrection = 0 | 90 | 180 | 270;

export function isOcrOrientationCorrection(
  value: number,
): value is OcrOrientationCorrection {
  return value === 0 || value === 90 || value === 180 || value === 270;
}

export type OcrProgress = Readonly<{
  status: string;
  progress: number;
}>;

export type OcrWordLayoutRef = Readonly<{
  blockIndex: number;
  paragraphIndex: number;
  lineIndex: number;
  wordIndex: number;
}>;

export type OcrWord = Readonly<{
  textSource: "ocr";
  text: string;
  confidence: number;
  /**
   * Structural provenance supplied by Tesseract. Advisory only: layout
   * grouping may use it for review/reading order, but it never authorizes a
   * native PDF mutation and searchable publication still validates each word
   * independently.
   */
  layout?: OcrWordLayoutRef;
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
  language: LocalOcrLanguage;
  orientationCorrection: OcrOrientationCorrection;
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

function inverseRotatePercentPoint(
  xPct: number,
  yPct: number,
  correction: OcrOrientationCorrection,
): readonly [number, number] {
  switch (correction) {
    case 0:
      return [xPct, yPct];
    case 90:
      return [yPct, 100 - xPct];
    case 180:
      return [100 - xPct, 100 - yPct];
    case 270:
      return [100 - yPct, xPct];
  }
}

export function inverseMapOcrBoundsPct(
  bounds: Readonly<{
    xPct: number;
    yPct: number;
    widthPct: number;
    heightPct: number;
  }>,
  correction: OcrOrientationCorrection,
): OcrWord["boundsPct"] {
  const left = bounds.xPct;
  const top = bounds.yPct;
  const right = bounds.xPct + bounds.widthPct;
  const bottom = bounds.yPct + bounds.heightPct;
  const points = [
    inverseRotatePercentPoint(left, top, correction),
    inverseRotatePercentPoint(right, top, correction),
    inverseRotatePercentPoint(left, bottom, correction),
    inverseRotatePercentPoint(right, bottom, correction),
  ];
  const xs = points.map(([x]) => clampPercent(x));
  const ys = points.map(([, y]) => clampPercent(y));
  const mappedLeft = Math.min(...xs);
  const mappedTop = Math.min(...ys);
  const mappedRight = Math.max(...xs);
  const mappedBottom = Math.max(...ys);
  return {
    xPct: mappedLeft,
    yPct: mappedTop,
    widthPct: mappedRight - mappedLeft,
    heightPct: mappedBottom - mappedTop,
  };
}

export function ocrWordsFromBlocks(
  blocks: readonly TesseractBlock[] | null,
  imageWidthPx: number,
  imageHeightPx: number,
  orientationCorrection: OcrOrientationCorrection = 0,
): OcrWord[] {
  if (imageWidthPx <= 0 || imageHeightPx <= 0) return [];
  const words: OcrWord[] = [];
  for (const [blockIndex, block] of (blocks ?? []).entries()) {
    for (const [paragraphIndex, paragraph] of (block.paragraphs ?? []).entries()) {
      for (const [lineIndex, line] of (paragraph.lines ?? []).entries()) {
        for (const [wordIndex, word] of (line.words ?? []).entries()) {
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
            layout: Object.freeze({
              blockIndex,
              paragraphIndex,
              lineIndex,
              wordIndex,
            }),
            confidence: Math.max(
              0,
              Math.min(100, Number.isFinite(word.confidence) ? word.confidence : 0),
            ),
            boundsPct: inverseMapOcrBoundsPct(
              {
                xPct: left,
                yPct: top,
                widthPct: right - left,
                heightPct: bottom - top,
              },
              orientationCorrection,
            ),
          });
        }
      }
    }
  }
  return words;
}

export function rotateOcrCanvas(
  source: HTMLCanvasElement,
  correction: OcrOrientationCorrection,
  createCanvas: () => HTMLCanvasElement,
): HTMLCanvasElement {
  if (correction === 0) return source;

  const target = createCanvas();
  const swapsAxes = correction === 90 || correction === 270;
  target.width = swapsAxes ? source.height : source.width;
  target.height = swapsAxes ? source.width : source.height;
  const context = target.getContext("2d", { alpha: false });
  if (!context) {
    throw new Error("The browser could not create an OCR orientation canvas.");
  }
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, target.width, target.height);
  context.save();
  if (correction === 90) {
    context.translate(target.width, 0);
    context.rotate(Math.PI / 2);
  } else if (correction === 180) {
    context.translate(target.width, target.height);
    context.rotate(Math.PI);
  } else {
    context.translate(0, target.height);
    context.rotate(-Math.PI / 2);
  }
  context.drawImage(source, 0, 0);
  context.restore();
  return target;
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
    language?: LocalOcrLanguage;
    orientationCorrection?: OcrOrientationCorrection;
  }): Promise<OcrPageResult>;
  terminate(): Promise<void>;
}>;

export function createLocalOcrEngine(
  origin?: string,
  dependencies: LocalOcrEngineDependencies = {},
): LocalOcrEngine {
  let workerPromise: Promise<OcrWorker> | null = null;
  let workerPromiseLanguage: LocalOcrLanguage | null = null;
  let worker: OcrWorker | null = null;
  let workerLanguage: LocalOcrLanguage | null = null;
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

  const ensureWorker = async (
    language: LocalOcrLanguage,
  ): Promise<OcrWorker> => {
    if (terminated) throw new Error("The OCR session has been terminated.");
    if (worker && workerLanguage === language) return worker;

    if (worker && workerLanguage !== language) {
      const previousWorker = worker;
      worker = null;
      workerLanguage = null;
      try {
        await previousWorker.terminate();
      } catch {
        // Language switching never reuses the previous worker. Cleanup is
        // best-effort and a failed terminate cannot authorize reuse.
      }
    }

    if (!workerPromise) {
      const applicationOrigin =
        origin ?? (typeof window !== "undefined" ? window.location.origin : "");
      if (!applicationOrigin) {
        throw new Error("OCR can only start in a browser application origin.");
      }
      const assets = localOcrAssetUrls(applicationOrigin);
      workerPromiseLanguage = language;
      workerPromise = (async () => {
        const createWorker = await loadWorkerFactory();
        return createWorker(language, 1, {
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
    const pendingLanguage = workerPromiseLanguage;
    try {
      const resolved = await pending;
      if (terminated) {
        // terminate() owns cleanup of a worker that was still starting. Do
        // not terminate it here too; some worker implementations are not
        // guaranteed to make duplicate termination idempotent.
        throw new Error("The OCR session has been terminated.");
      }
      if (pendingLanguage !== language) {
        try {
          await resolved.terminate();
        } catch {
          // A mismatched startup worker is never reused.
        }
        throw new Error("The OCR language changed while its worker was starting.");
      }
      worker = resolved;
      workerLanguage = language;
      if (workerPromise === pending) {
        workerPromise = null;
        workerPromiseLanguage = null;
      }
      return resolved;
    } catch (error) {
      if (workerPromise === pending) {
        workerPromise = null;
        workerPromiseLanguage = null;
      }
      throw error;
    }
  };

  const discardWorker = async (failedWorker: OcrWorker | null): Promise<void> => {
    if (!failedWorker) return;
    if (worker === failedWorker) {
      worker = null;
      workerLanguage = null;
    }
    try {
      await failedWorker.terminate();
    } catch {
      // Failed OCR workers are never reused; cleanup remains best-effort.
    }
  };

  return {
    async recognizePage({
      page,
      pageIndex,
      onProgress,
      language = DEFAULT_LOCAL_OCR_LANGUAGE,
      orientationCorrection = 0,
    }) {
      if (terminated) throw new Error("The OCR session has been terminated.");
      if (recognitionActive) {
        throw new Error("Another local OCR recognition is already running.");
      }
      if (!Number.isInteger(pageIndex) || pageIndex < 0) {
        throw new Error("OCR page index must be a non-negative integer.");
      }
      if (!isLocalOcrLanguage(language)) {
        throw new Error("OCR language is not in Lumeo's self-hosted language set.");
      }
      if (!isOcrOrientationCorrection(orientationCorrection)) {
        throw new Error(
          "OCR orientation correction must be 0, 90, 180 or 270 degrees.",
        );
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
          ensureWorker(language),
        ]);
        const { canvas, scale } = rendered;
        const recognitionCanvas = rotateOcrCanvas(
          canvas,
          orientationCorrection,
          createCanvas,
        );
        activeWorker = readyWorker;
        if (terminated) throw new Error("The OCR session was cancelled.");
        const recognizeWithWorker = async (candidate: OcrWorker) => {
          await candidate.setParameters({
            user_defined_dpi: String(Math.max(72, Math.round(scale * 72))),
          });
          return candidate.recognize(
            recognitionCanvas,
            {},
            { text: true, blocks: true },
          );
        };

        let recognition = await recognizeWithWorker(activeWorker);
        if (terminated) throw new Error("The OCR session was cancelled.");

        let words = ocrWordsFromBlocks(
          recognition.data.blocks,
          recognitionCanvas.width,
          recognitionCanvas.height,
          orientationCorrection,
        );
        if (!recognition.data.text.trim() && words.length === 0) {
          onProgress?.({
            status: "Retrying recognition locally",
            progress: 0,
          });
          await discardWorker(activeWorker);
          activeWorker = null;
          const retryWorker = await ensureWorker(language);
          activeWorker = retryWorker;
          recognition = await recognizeWithWorker(retryWorker);
          if (terminated) throw new Error("The OCR session was cancelled.");
          words = ocrWordsFromBlocks(
            recognition.data.blocks,
            recognitionCanvas.width,
            recognitionCanvas.height,
            orientationCorrection,
          );
        }

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
          language,
          orientationCorrection,
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
      workerLanguage = null;
      const pending = workerPromise;
      workerPromise = null;
      workerPromiseLanguage = null;

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
