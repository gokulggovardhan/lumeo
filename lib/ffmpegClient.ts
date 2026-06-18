import type { FFmpeg, LogEvent, ProgressEvent } from "@ffmpeg/ffmpeg";

const CORE_VERSION = "0.12.10";
const CORE_BASE_URL = `/ffmpeg/${CORE_VERSION}`;
const LOAD_TIMEOUT_MS = 45000;

let ffmpegInstance: FFmpeg | null = null;
let loadingPromise: Promise<FFmpeg> | null = null;
let currentPreloadProgress = 0;
const preloadListeners = new Set<FFmpegPreloadProgressHandler>();

export type FFmpegLogHandler = (event: LogEvent) => void;
export type FFmpegProgressHandler = (event: ProgressEvent) => void;
export type FFmpegPreloadProgressHandler = (progress: number) => void;

export type LoadFFmpegOptions = {
  onLog?: FFmpegLogHandler;
  onProgress?: FFmpegProgressHandler;
  signal?: AbortSignal;
};

export function isBrowserFFmpegSupported() {
  return (
    typeof window !== "undefined" &&
    typeof Worker !== "undefined" &&
    typeof WebAssembly !== "undefined"
  );
}

export async function loadFFmpegClient(options: LoadFFmpegOptions = {}) {
  console.info("[Lumeo export] FFmpeg/load requested");

  try {
    const ffmpeg = await preloadFFmpeg();

    if (options.onLog) {
      ffmpeg.on("log", options.onLog);
    }

    if (options.onProgress) {
      ffmpeg.on("progress", options.onProgress);
    }

    console.info("[Lumeo export] FFmpeg/load completed");
    return ffmpeg;
  } catch (error) {
    console.error("[Lumeo export] FFmpeg/load failed", error);
    resetFFmpeg();
    throw error;
  }
}

export async function preloadFFmpeg(onProgress?: FFmpegPreloadProgressHandler) {
  if (!isBrowserFFmpegSupported()) {
    throw new Error("Browser export is not supported in this environment.");
  }

  if (onProgress) {
    preloadListeners.add(onProgress);
    onProgress(currentPreloadProgress);
  }

  if (ffmpegInstance?.loaded) {
    notifyPreloadProgress(100);
    return ffmpegInstance;
  }

  if (!loadingPromise) {
    loadingPromise = createFFmpegClient().catch((error) => {
      loadingPromise = null;
      currentPreloadProgress = 0;
      throw error;
    });
  }

  return loadingPromise;
}

export function unloadFFmpegClient() {
  resetFFmpeg();
}

export function resetFFmpeg() {
  void loadingPromise
    ?.then((ffmpeg) => ffmpeg.terminate())
    .catch((error) => {
      console.warn("[Lumeo export] FFmpeg/reset ignored pending load failure", error);
    });

  try {
    ffmpegInstance?.terminate();
  } catch (error) {
    console.warn("[Lumeo export] FFmpeg/reset terminate failed", error);
  }

  ffmpegInstance = null;
  loadingPromise = null;
  currentPreloadProgress = 0;
  preloadListeners.clear();
}

async function createFFmpegClient() {
  let ffmpeg: FFmpeg | null = null;

  try {
    console.info("[Lumeo export] FFmpeg/load started");
    notifyPreloadProgress(12);

    const { FFmpeg } = await withTimeout(
      import("@ffmpeg/ffmpeg"),
      LOAD_TIMEOUT_MS,
      "Timed out while importing browser export runtime.",
    );

    ffmpeg = new FFmpeg();

    notifyPreloadProgress(35);

    await withTimeout(
      ffmpeg.load({
        coreURL: `${CORE_BASE_URL}/ffmpeg-core.js`,
        wasmURL: `${CORE_BASE_URL}/ffmpeg-core.wasm`,
      }),
      LOAD_TIMEOUT_MS,
      "Timed out while preparing browser export runtime.",
    );

    ffmpegInstance = ffmpeg;
    notifyPreloadProgress(100);
    console.info("[Lumeo export] FFmpeg/load completed");

    return ffmpeg;
  } catch (error) {
    console.error("[Lumeo export] FFmpeg/load failure point", error);

    try {
      ffmpeg?.terminate();
    } catch (terminateError) {
      console.warn("[Lumeo export] FFmpeg/load cleanup failed", terminateError);
    }

    ffmpegInstance = null;
    loadingPromise = null;
    currentPreloadProgress = 0;
    throw error;
  }
}

function notifyPreloadProgress(progress: number) {
  currentPreloadProgress = progress;
  preloadListeners.forEach((listener) => listener(progress));
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}
