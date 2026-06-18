import { fetchFile } from "@ffmpeg/util";
import type { FFmpeg } from "@ffmpeg/ffmpeg";
import {
  loadFFmpegClient,
  resetFFmpeg,
  type LoadFFmpegOptions,
} from "@/lib/ffmpegClient";

export type ExportFormat = "mp4" | "webm" | "mp3" | "wav";
export type VideoExportFormat = Extract<ExportFormat, "mp4" | "webm">;
export type AudioExportFormat = Extract<ExportFormat, "mp3" | "wav">;
export type ExportResolution = "720p" | "1080p" | "2k";

export type TrimRange = {
  startSeconds?: number;
  endSeconds?: number;
};

export type VideoExportOptions = {
  format: VideoExportFormat;
  resolution?: ExportResolution;
  trim?: TrimRange;
  fileName?: string;
  ffmpeg?: LoadFFmpegOptions;
};

export type AudioExportOptions = {
  format: AudioExportFormat;
  trim?: TrimRange;
  fileName?: string;
  ffmpeg?: LoadFFmpegOptions;
};

export type ExportResult = {
  blob: Blob;
  fileName: string;
  mimeType: string;
};

export const VIDEO_RESOLUTION_CONFIG: Record<
  ExportResolution,
  { width: number; height: number; label: string }
> = {
  "720p": { width: 1280, height: 720, label: "720p" },
  "1080p": { width: 1920, height: 1080, label: "1080p" },
  "2k": { width: 2560, height: 1440, label: "2K" },
};

const INPUT_FILE = "input";

const FORMAT_CONFIG: Record<
  ExportFormat,
  { extension: ExportFormat; mimeType: string; outputFile: string }
> = {
  mp4: {
    extension: "mp4",
    mimeType: "video/mp4",
    outputFile: "output.mp4",
  },
  webm: {
    extension: "webm",
    mimeType: "video/webm",
    outputFile: "output.webm",
  },
  mp3: {
    extension: "mp3",
    mimeType: "audio/mpeg",
    outputFile: "output.mp3",
  },
  wav: {
    extension: "wav",
    mimeType: "audio/wav",
    outputFile: "output.wav",
  },
};

export async function exportVideo(
  input: Blob | File | string,
  options: VideoExportOptions,
): Promise<ExportResult> {
  const config = FORMAT_CONFIG[options.format];
  const pathsToCleanup = [INPUT_FILE, config.outputFile];
  let ffmpeg: FFmpeg | null = null;
  let failurePoint = "initializing video export";

  console.info("[Lumeo export] video export selected input", describeInput(input));
  console.info("[Lumeo export] selected export format", options.format);
  console.info("[Lumeo export] selected export resolution", options.resolution);
  console.info("[Lumeo export] selected trimStart", options.trim?.startSeconds);
  console.info("[Lumeo export] selected trimEnd", options.trim?.endSeconds);

  try {
    failurePoint = "loading export runtime";
    ffmpeg = await loadFFmpegClient(options.ffmpeg);

    failurePoint = "writing input file";
    console.info("[Lumeo export] writeFile started", INPUT_FILE);
    await ffmpeg.writeFile(INPUT_FILE, await fetchFile(input));
    console.info("[Lumeo export] writeFile completed", INPUT_FILE);

    const args = buildVideoExportArgs(options);

    failurePoint = "executing video command";
    console.info("[Lumeo export] exec started", args);
    const exitCode = await ffmpeg.exec(args);
    console.info("[Lumeo export] exec completed", { exitCode });

    if (exitCode !== 0) {
      throw new Error(`FFmpeg video export failed with exit code ${exitCode}.`);
    }

    failurePoint = "reading output file";
    console.info("[Lumeo export] readFile started", config.outputFile);
    const data = await ffmpeg.readFile(config.outputFile);
    console.info("[Lumeo export] readFile completed", config.outputFile);

    return {
      blob: new Blob([toArrayBuffer(data)], { type: config.mimeType }),
      fileName: options.fileName ?? `lumeo-export.${config.extension}`,
      mimeType: config.mimeType,
    };
  } catch (error) {
    console.error("[Lumeo export] video export failed", {
      failurePoint,
      error,
      options,
      input: describeInput(input),
    });
    resetFFmpeg();
    throw error;
  } finally {
    if (ffmpeg) {
      await cleanupFFmpegFiles(ffmpeg, pathsToCleanup);
    }
  }
}

export async function extractAudio(
  input: Blob | File | string,
  options: AudioExportOptions,
): Promise<ExportResult> {
  const config = FORMAT_CONFIG[options.format];
  const pathsToCleanup = [INPUT_FILE, config.outputFile];
  let ffmpeg: FFmpeg | null = null;
  let failurePoint = "initializing audio extraction";

  console.info("[Lumeo export] audio extraction selected input", describeInput(input));
  console.info("[Lumeo export] selected audio format", options.format);
  console.info("[Lumeo export] selected trimStart", options.trim?.startSeconds);
  console.info("[Lumeo export] selected trimEnd", options.trim?.endSeconds);

  try {
    failurePoint = "loading export runtime";
    ffmpeg = await loadFFmpegClient(options.ffmpeg);

    failurePoint = "writing input file";
    console.info("[Lumeo export] writeFile started", INPUT_FILE);
    await ffmpeg.writeFile(INPUT_FILE, await fetchFile(input));
    console.info("[Lumeo export] writeFile completed", INPUT_FILE);

    const args = buildAudioExportArgs(options);

    failurePoint = "executing audio command";
    console.info("[Lumeo export] exec started", args);
    const exitCode = await ffmpeg.exec(args);
    console.info("[Lumeo export] exec completed", { exitCode });

    if (exitCode !== 0) {
      throw new Error(`FFmpeg audio export failed with exit code ${exitCode}.`);
    }

    failurePoint = "reading output file";
    console.info("[Lumeo export] readFile started", config.outputFile);
    const data = await ffmpeg.readFile(config.outputFile);
    console.info("[Lumeo export] readFile completed", config.outputFile);

    return {
      blob: new Blob([toArrayBuffer(data)], { type: config.mimeType }),
      fileName: options.fileName ?? `lumeo-audio.${config.extension}`,
      mimeType: config.mimeType,
    };
  } catch (error) {
    console.error("[Lumeo export] audio extraction failed", {
      failurePoint,
      error,
      options,
      input: describeInput(input),
    });
    resetFFmpeg();
    throw error;
  } finally {
    if (ffmpeg) {
      await cleanupFFmpegFiles(ffmpeg, pathsToCleanup);
    }
  }
}

export function buildVideoExportArgs(options: VideoExportOptions) {
  const config = FORMAT_CONFIG[options.format];
  const args = [...buildTrimArgs(options.trim), "-i", INPUT_FILE];

  if (options.resolution) {
    args.push(...buildScaleArgs(options.resolution));
  }

  if (options.format === "mp4") {
    args.push(
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "23",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-movflags",
      "faststart",
    );
  } else {
    args.push("-c:v", "libvpx-vp9", "-crf", "32", "-b:v", "0", "-c:a", "libopus", "-b:a", "160k");
  }

  args.push(config.outputFile);
  return args;
}

export function buildAudioExportArgs(options: AudioExportOptions) {
  const config = FORMAT_CONFIG[options.format];
  const args = [...buildTrimArgs(options.trim), "-i", INPUT_FILE, "-vn"];

  if (options.format === "mp3") {
    args.push("-c:a", "libmp3lame", "-b:a", "192k");
  } else {
    args.push("-c:a", "pcm_s16le", "-ar", "44100");
  }

  args.push(config.outputFile);
  return args;
}

function buildScaleArgs(resolution: ExportResolution) {
  const { width, height } = VIDEO_RESOLUTION_CONFIG[resolution];
  return ["-vf", `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`];
}

function buildTrimArgs(trim?: TrimRange) {
  if (!trim) {
    return [];
  }

  const args: string[] = [];

  if (typeof trim.startSeconds === "number") {
    args.push("-ss", String(trim.startSeconds));
  }

  if (typeof trim.endSeconds === "number") {
    args.push("-to", String(trim.endSeconds));
  }

  return args;
}

async function cleanupFFmpegFiles(ffmpeg: FFmpeg, paths: string[]) {
  console.info("[Lumeo export] cleanup started", paths);

  await Promise.all(
    paths.map(async (path) => {
      try {
        await ffmpeg.deleteFile(path);
      } catch (error) {
        console.warn("[Lumeo export] cleanup skipped file", { path, error });
      }
    }),
  );

  console.info("[Lumeo export] cleanup completed", paths);
}

function toArrayBuffer(data: string | Uint8Array): ArrayBuffer {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const copy: Uint8Array<ArrayBuffer> = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function describeInput(input: Blob | File | string) {
  if (typeof input === "string") {
    return {
      source: input,
      type: "url-or-path",
    };
  }

  return {
    name: input instanceof File ? input.name : "blob-input",
    size: input.size,
    type: input.type,
  };
}
