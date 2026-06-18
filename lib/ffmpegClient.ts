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
  const ffmpeg = await preloadFFmpeg();

  if (options.onLog) {
    ffmpeg.on("log", options.onLog);
  }

  if (options.onProgress) {
    ffmpeg.on("progress", options.onProgress);
  }

  return ffmpeg;
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
  if (!ffmpegInstance && !loadingPromise) {
    return;
  }

  void loadingPromise?.then((ffmpeg) => ffmpeg.terminate());
  ffmpegInstance?.terminate();
  ffmpegInstance = null;
  loadingPromise = null;
  currentPreloadProgress = 0;
  preloadListeners.clear();
}

async function createFFmpegClient() {
  notifyPreloadProgress(12);

  const { FFmpeg } = await withTimeout(
    import("@ffmpeg/ffmpeg"),
    LOAD_TIMEOUT_MS,
    "Timed out while importing browser export runtime.",
  );

  const ffmpeg = new FFmpeg();

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

  return ffmpeg;
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
