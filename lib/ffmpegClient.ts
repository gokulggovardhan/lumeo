import type { FFmpeg, LogEvent, ProgressEvent } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";

const CORE_VERSION = "0.12.9";
const DEFAULT_CORE_BASE_URL = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/umd`;

let ffmpegPromise: Promise<FFmpeg> | null = null;

export type FFmpegLogHandler = (event: LogEvent) => void;
export type FFmpegProgressHandler = (event: ProgressEvent) => void;

export type LoadFFmpegOptions = {
  coreBaseURL?: string;
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
  if (!isBrowserFFmpegSupported()) {
    throw new Error("Browser FFmpeg requires Window, Worker, and WebAssembly support.");
  }

  if (!ffmpegPromise) {
    ffmpegPromise = createFFmpegClient(options);
  }

  const ffmpeg = await ffmpegPromise;

  if (options.onLog) {
    ffmpeg.on("log", options.onLog);
  }

  if (options.onProgress) {
    ffmpeg.on("progress", options.onProgress);
  }

  return ffmpeg;
}

export function unloadFFmpegClient() {
  if (!ffmpegPromise) {
    return;
  }

  void ffmpegPromise.then((ffmpeg) => ffmpeg.terminate());
  ffmpegPromise = null;
}

async function createFFmpegClient(options: LoadFFmpegOptions) {
  const [{ FFmpeg }, coreURL, wasmURL] = await Promise.all([
    import("@ffmpeg/ffmpeg"),
    toBlobURL(`${options.coreBaseURL ?? DEFAULT_CORE_BASE_URL}/ffmpeg-core.js`, "text/javascript"),
    toBlobURL(`${options.coreBaseURL ?? DEFAULT_CORE_BASE_URL}/ffmpeg-core.wasm`, "application/wasm"),
  ]);

  const ffmpeg = new FFmpeg();

  if (options.onLog) {
    ffmpeg.on("log", options.onLog);
  }

  if (options.onProgress) {
    ffmpeg.on("progress", options.onProgress);
  }

  await ffmpeg.load(
    {
      coreURL,
      wasmURL,
    },
    {
      signal: options.signal,
    },
  );

  return ffmpeg;
}
