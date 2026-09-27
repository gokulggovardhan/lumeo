export const LOCAL_OCR_LANGUAGE = "eng";

export type LocalOcrProgress = Readonly<{
  status: string;
  progress: number;
}>;

export type LocalOcrResult = Readonly<{
  text: string;
  confidence: number | null;
  durationMs: number;
}>;

export type LocalOcrAssetConfig = Readonly<{
  workerPath: string;
  corePath: string;
  langPath: string;
}>;

type TesseractModule = typeof import("tesseract.js");
type OcrWorker = Awaited<ReturnType<TesseractModule["createWorker"]>>;

let workerPromise: Promise<OcrWorker> | null = null;
let activeProgressListener: ((progress: LocalOcrProgress) => void) | null = null;
let jobInFlight = false;

function safeProgress(value: unknown): number {
  const numeric = typeof value === "number" ? value : 0;
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(1, numeric));
}

export function localOcrAssetConfig(origin: string): LocalOcrAssetConfig {
  const normalizedOrigin = new URL(origin).origin;
  const config = {
    workerPath: new URL("/tesseract/worker.min.js", normalizedOrigin).href,
    corePath: new URL("/tesseract/core", normalizedOrigin).href,
    langPath: new URL("/tesseract/lang", normalizedOrigin).href,
  } satisfies LocalOcrAssetConfig;

  for (const value of Object.values(config)) {
    if (new URL(value).origin !== normalizedOrigin) {
      throw new Error("OCR runtime assets must stay on the Lumeo origin.");
    }
  }
  return config;
}

export function localOcrConfidenceLabel(confidence: number | null): string {
  if (confidence === null || !Number.isFinite(confidence)) return "Confidence unavailable";
  if (confidence >= 90) return "High confidence";
  if (confidence >= 75) return "Review recommended";
  return "Low confidence · review carefully";
}

async function createLocalWorker(): Promise<OcrWorker> {
  if (typeof window === "undefined") {
    throw new Error("Local OCR is available only in the browser.");
  }
  const tesseract = await import("tesseract.js");
  const assets = localOcrAssetConfig(window.location.origin);
  return tesseract.createWorker(
    LOCAL_OCR_LANGUAGE,
    tesseract.OEM.LSTM_ONLY,
    {
      ...assets,
      gzip: true,
      logger(message) {
        activeProgressListener?.({
          status: typeof message.status === "string" ? message.status : "recognizing",
          progress: safeProgress(message.progress),
        });
      },
    },
  );
}

async function getLocalWorker(): Promise<OcrWorker> {
  workerPromise ??= createLocalWorker().catch((error) => {
    workerPromise = null;
    throw error;
  });
  return workerPromise;
}

export async function resetLocalOcrWorker(): Promise<void> {
  const current = workerPromise;
  workerPromise = null;
  activeProgressListener = null;
  jobInFlight = false;
  if (!current) return;
  try {
    const worker = await current;
    await worker.terminate();
  } catch {
    // Best-effort teardown. A failed/partially-created worker is already
    // discarded by clearing workerPromise above.
  }
}

export async function recognizeLocalOcrImage({
  image,
  onProgress,
}: {
  image: Blob;
  onProgress?: (progress: LocalOcrProgress) => void;
}): Promise<LocalOcrResult> {
  if (jobInFlight) {
    throw new Error("Another local OCR job is already running.");
  }
  if (!(image instanceof Blob) || image.size === 0) {
    throw new Error("OCR requires a non-empty browser-local page image.");
  }

  jobInFlight = true;
  activeProgressListener = onProgress ?? null;
  const startedAt = performance.now();
  try {
    const worker = await getLocalWorker();
    const result = await worker.recognize(image);
    const text = result.data.text.replace(/\r\n?/g, "\n").trim();
    const confidence =
      typeof result.data.confidence === "number" && Number.isFinite(result.data.confidence)
        ? Math.max(0, Math.min(100, result.data.confidence))
        : null;
    return {
      text,
      confidence,
      durationMs: Math.max(0, performance.now() - startedAt),
    };
  } catch (error) {
    // Discard the worker after a recognition failure so a corrupted WASM
    // state or aborted job can never leak into the next page.
    await resetLocalOcrWorker();
    throw error;
  } finally {
    activeProgressListener = null;
    jobInFlight = false;
  }
}
