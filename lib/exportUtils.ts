import { fetchFile } from "@ffmpeg/util";
import { loadFFmpegClient, type LoadFFmpegOptions } from "@/lib/ffmpegClient";

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
  const ffmpeg = await loadFFmpegClient(options.ffmpeg);

  await ffmpeg.writeFile(INPUT_FILE, await fetchFile(input));
  const exitCode = await ffmpeg.exec(buildVideoExportArgs(options));

  if (exitCode !== 0) {
    throw new Error(`FFmpeg video export failed with exit code ${exitCode}.`);
  }

  const data = await ffmpeg.readFile(config.outputFile);
  await cleanupFFmpegFiles([INPUT_FILE, config.outputFile]);

  return {
    blob: new Blob([toArrayBuffer(data)], { type: config.mimeType }),
    fileName: options.fileName ?? `lumeo-export.${config.extension}`,
    mimeType: config.mimeType,
  };
}

export async function extractAudio(
  input: Blob | File | string,
  options: AudioExportOptions,
): Promise<ExportResult> {
  const config = FORMAT_CONFIG[options.format];
  const ffmpeg = await loadFFmpegClient(options.ffmpeg);

  await ffmpeg.writeFile(INPUT_FILE, await fetchFile(input));
  const exitCode = await ffmpeg.exec(buildAudioExportArgs(options));

  if (exitCode !== 0) {
    throw new Error(`FFmpeg audio export failed with exit code ${exitCode}.`);
  }

  const data = await ffmpeg.readFile(config.outputFile);
  await cleanupFFmpegFiles([INPUT_FILE, config.outputFile]);

  return {
    blob: new Blob([toArrayBuffer(data)], { type: config.mimeType }),
    fileName: options.fileName ?? `lumeo-audio.${config.extension}`,
    mimeType: config.mimeType,
  };
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

async function cleanupFFmpegFiles(paths: string[]) {
  const ffmpeg = await loadFFmpegClient();

  await Promise.all(
    paths.map(async (path) => {
      try {
        await ffmpeg.deleteFile(path);
      } catch {
        // The export still succeeded if cleanup misses an already-removed file.
      }
    }),
  );
}

function toArrayBuffer(data: string | Uint8Array): ArrayBuffer {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const copy: Uint8Array<ArrayBuffer> = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
