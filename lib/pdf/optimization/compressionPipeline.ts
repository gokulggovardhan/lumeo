import { optimizeNativePdfImages, type NativeOptimizationResult, type NativeImageSettings } from "./nativeImages.ts";
import { transcodeJpegInWorker } from "./nativeJpegCodec.ts";
import { searchNativePdfTarget, type TargetSearchOutcome, type TargetAttempt } from "./adaptiveTarget.ts";

export type PdfCompressionGoal = "recommended" | "high-quality" | "maximum" | "target";
export type PdfCompressionResponse = {
  bytes: ArrayBuffer;
  originalBytes: number;
  finalBytes: number;
  achieved: boolean | null;
  targetOutcome?: TargetSearchOutcome;
  optimizedImages: number;
  codecAvailable: boolean;
  protectedReason?: string;
  attempts?: TargetAttempt[];
};

/**
 * One shared optimisation pipeline for both Compress PDF and Merge PDF.
 * The native JPEG decoder and encoder are available only in a background
 * browser worker; no PDF contents are transferred to a remote endpoint.
 */
export async function runNativeCompression(
  originalBytes: ArrayBuffer,
  goal: PdfCompressionGoal,
  targetBytes: number | undefined,
  onProgress?: (value: number, stage: string) => void,
  settingsOverride?: NativeImageSettings,
): Promise<PdfCompressionResponse> {
  const inputBytes = originalBytes.byteLength;
  const codecAvailable =
    typeof OffscreenCanvas !== "undefined" &&
    typeof createImageBitmap === "function";
  onProgress?.(0, "Inspecting PDF structure");
  const lossless = await optimizeNativePdfImages(
    originalBytes, "lossless", { dpi: 240, quality: 0.88 },
  );
  onProgress?.(10, "Lossless optimisation checked");
  let result: NativeOptimizationResult = lossless;
  let targetOutcome: TargetSearchOutcome | undefined;
  let attempts: TargetAttempt[] | undefined;
  if (lossless.protectedReason) {
    onProgress?.(100, "Original preserved for document safety");
    return {
      bytes: lossless.bytes,
      originalBytes: inputBytes,
      finalBytes: lossless.bytes.byteLength,
      achieved: goal === "target" ? lossless.bytes.byteLength <= (targetBytes ?? 0) : null,
      targetOutcome: goal === "target" ? "no-benefit" : undefined,
      optimizedImages: 0,
      codecAvailable,
      protectedReason: lossless.protectedReason,
    };
  }

  if (goal === "target") {
    if (!Number.isSafeInteger(targetBytes) || !targetBytes || targetBytes < 20 * 1024) {
      throw new Error("Choose a valid target size of at least 20 KB.");
    }
    if (lossless.outputBytes <= targetBytes) {
      targetOutcome = "achieved";
    } else if (codecAvailable) {
      const adaptive = await searchNativePdfTarget({
        originalBytes: lossless.bytes,
        targetBytes,
        maxAttempts: 8,
        makeCandidate: async (settings) => {
          const candidate = await optimizeNativePdfImages(
            lossless.bytes, "smart", settings, transcodeJpegInWorker,
          );
          return { bytes: candidate.bytes, outputBytes: candidate.outputBytes };
        },
        onProgress: (completed, total) => onProgress?.(
          10 + Math.round((completed / Math.max(total, 1)) * 84),
          `Testing image quality ${completed} of ${total}`,
        ),
      });
      result = {
        ...lossless,
        bytes: adaptive.bytes,
        outputBytes: adaptive.bytes.byteLength,
        applied: adaptive.bytes.byteLength < inputBytes,
      };
      targetOutcome = adaptive.outcome;
      attempts = adaptive.attempts;
    } else {
      targetOutcome = lossless.outputBytes < inputBytes ? "closest-safe" : "no-benefit";
    }
  } else if (codecAvailable) {
    const settings = settingsOverride ?? (
      goal === "high-quality" ? { dpi: 250, quality: 0.91 }
        : goal === "maximum" ? { dpi: 96, quality: 0.49 }
          : { dpi: 170, quality: 0.78 }
    );
    result = await optimizeNativePdfImages(
      lossless.bytes, "smart", settings, transcodeJpegInWorker,
      ({ completed, total, stage }) => {
        if (stage === "images" && total > 0) {
          onProgress?.(
            10 + Math.round((completed / total) * 82),
            `Optimising image ${completed} of ${total}`,
          );
        }
      },
    );
  }

  if (lossless.outputBytes < result.bytes.byteLength) result = lossless;
  const achieved = goal === "target"
    ? result.bytes.byteLength <= (targetBytes ?? 0)
    : null;
  onProgress?.(100, "Verified local PDF output");
  return {
    bytes: result.bytes,
    originalBytes: inputBytes,
    finalBytes: result.bytes.byteLength,
    achieved,
    targetOutcome,
    optimizedImages: result.optimizedImages,
    codecAvailable,
    protectedReason: result.protectedReason ?? lossless.protectedReason,
    attempts,
  };
}
