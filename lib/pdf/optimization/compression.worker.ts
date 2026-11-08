import { optimizeNativePdfImages, type NativeOptimizationResult } from "./nativeImages.ts";
import { transcodeJpegInWorker } from "./nativeJpegCodec.ts";
import { searchNativePdfTarget, type TargetSearchOutcome } from "./adaptiveTarget.ts";

export type PdfCompressionGoal = "recommended" | "high-quality" | "maximum" | "target";
export type PdfCompressionRequest = {
  type: "compress";
  bytes: ArrayBuffer;
  goal: PdfCompressionGoal;
  targetBytes?: number;
};
export type PdfCompressionResponse = {
  bytes: ArrayBuffer;
  originalBytes: number;
  finalBytes: number;
  achieved: boolean | null;
  targetOutcome?: TargetSearchOutcome;
  optimizedImages: number;
  codecAvailable: boolean;
};
export type PdfCompressionWorkerMessage =
  | { type: "progress"; value: number; stage: string }
  | { type: "result"; value: PdfCompressionResponse }
  | { type: "error"; message: string };

function progress(value: number, stage: string) {
  self.postMessage({ type: "progress", value, stage } satisfies PdfCompressionWorkerMessage);
}

self.onmessage = async ({ data }: MessageEvent<PdfCompressionRequest>) => {
  if (data?.type !== "compress") return;
  try {
    const originalSize = data.bytes.byteLength;
    const codecAvailable =
      typeof OffscreenCanvas !== "undefined" &&
      typeof createImageBitmap === "function";
    progress(0, "Inspecting PDF structure");
    const defaultSettings = { dpi: 240, quality: 0.88 };
    const lossless = await optimizeNativePdfImages(data.bytes, "lossless", defaultSettings);
    progress(10, "Lossless optimisation checked");

    let result: NativeOptimizationResult = lossless;
    let targetOutcome: TargetSearchOutcome | undefined;
    if (data.goal === "target") {
      const requested = data.targetBytes;
      if (!Number.isSafeInteger(requested) || !requested || requested < 20 * 1024) {
        throw new Error("Choose a valid target size of at least 20 KB.");
      }
      if (lossless.outputBytes <= requested) {
        targetOutcome = "achieved";
      } else if (codecAvailable) {
        const adaptive = await searchNativePdfTarget({
          originalBytes: lossless.bytes,
          targetBytes: requested,
          maxAttempts: 8,
          makeCandidate: async (settings) => {
            const candidate = await optimizeNativePdfImages(
              lossless.bytes, "smart", settings, transcodeJpegInWorker,
            );
            return { bytes: candidate.bytes, outputBytes: candidate.outputBytes };
          },
          onProgress: (completed, total) => {
            progress(10 + Math.round((completed / Math.max(total, 1)) * 84),
              `Testing image quality ${completed} of ${total}`);
          },
        });
        result = {
          ...lossless,
          bytes: adaptive.bytes,
          outputBytes: adaptive.bytes.byteLength,
          applied: adaptive.bytes.byteLength < originalSize,
        };
        targetOutcome = adaptive.outcome;
      } else {
        targetOutcome = lossless.outputBytes < originalSize ? "closest-safe" : "no-benefit";
      }
    } else if (codecAvailable) {
      const settings =
        data.goal === "high-quality" ? { dpi: 250, quality: 0.91 }
          : data.goal === "maximum" ? { dpi: 96, quality: 0.49 }
            : { dpi: 170, quality: 0.78 };
      result = await optimizeNativePdfImages(
        lossless.bytes, "smart", settings, transcodeJpegInWorker,
        ({ completed, total, stage }) => {
          if (stage === "images" && total > 0) {
            progress(10 + Math.round((completed / total) * 82),
              `Optimising image ${completed} of ${total}`);
          }
        },
      );
    }

    // Candidate output may be a lossless improvement relative to the
    // original, even if no JPEG pass could be applied on this browser.
    if (lossless.bytes.byteLength < result.bytes.byteLength) result = lossless;
    const achieved = data.goal === "target"
      ? result.bytes.byteLength <= (data.targetBytes ?? 0) : null;
    progress(100, "Verified local PDF output");
    const response: PdfCompressionResponse = {
      bytes: result.bytes,
      originalBytes: originalSize,
      finalBytes: result.bytes.byteLength,
      achieved,
      targetOutcome,
      optimizedImages: result.optimizedImages,
      codecAvailable,
    };
    self.postMessage({ type: "result", value: response } satisfies PdfCompressionWorkerMessage, {
      transfer: [response.bytes],
    });
  } catch (error) {
    self.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : "Unable to compress this PDF safely.",
    } satisfies PdfCompressionWorkerMessage);
  }
};
