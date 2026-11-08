import { runNativeCompression, type PdfCompressionGoal, type PdfCompressionResponse } from "./compressionPipeline.ts";
import type { NativeImageSettings } from "./nativeImages.ts";

export type { PdfCompressionGoal, PdfCompressionResponse } from "./compressionPipeline.ts";
export type PdfCompressionRequest = {
  type: "compress";
  bytes: ArrayBuffer;
  goal: PdfCompressionGoal;
  targetBytes?: number;
  settingsOverride?: NativeImageSettings;
};
export type PdfCompressionWorkerMessage =
  | { type: "progress"; value: number; stage: string }
  | { type: "result"; value: PdfCompressionResponse }
  | { type: "error"; message: string };

self.onmessage = async ({ data }: MessageEvent<PdfCompressionRequest>) => {
  if (data?.type !== "compress") return;
  try {
    const result = await runNativeCompression(
      data.bytes,
      data.goal,
      data.targetBytes,
      (value, stage) => self.postMessage({ type: "progress", value, stage } satisfies PdfCompressionWorkerMessage),
      data.settingsOverride,
    );
    self.postMessage({ type: "result", value: result } satisfies PdfCompressionWorkerMessage, {
      transfer: [result.bytes],
    });
  } catch (error) {
    self.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : "Unable to compress this PDF safely.",
    } satisfies PdfCompressionWorkerMessage);
  }
};
