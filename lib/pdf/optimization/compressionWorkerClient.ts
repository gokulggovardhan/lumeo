import type { NativeImageSettings } from "./nativeImages.ts";
import type {
  PdfCompressionGoal,
  PdfCompressionResponse,
  PdfCompressionWorkerMessage,
} from "./compression.worker.ts";

/**
 * One short-lived local PDF worker per active compression job.
 * Never transfers ownership of the caller's original bytes.
 */
export function compressPdfInBackground(
  originalBytes: ArrayBuffer,
  goal: PdfCompressionGoal,
  targetBytes: number | undefined,
  signal: AbortSignal,
  onProgress: (value: number, stage: string) => void,
  settingsOverride?: NativeImageSettings,
): Promise<PdfCompressionResponse> {
  if (signal.aborted) return Promise.reject(new DOMException("Compression cancelled.", "AbortError"));
  if (typeof Worker === "undefined") {
    return Promise.reject(new Error("Background PDF compression is unavailable in this browser."));
  }
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("./compression.worker.ts", import.meta.url), { type: "module" });
    } catch {
      reject(new Error("The local PDF compression worker could not start."));
      return;
    }
    let settled = false;
    const finish = () => {
      if (settled) return false;
      settled = true;
      clearTimeout(timeout);
      signal.removeEventListener("abort", cancel);
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
      return true;
    };
    const cancel = () => {
      if (finish()) reject(new DOMException("Compression cancelled.", "AbortError"));
    };
    const timeout = setTimeout(() => {
      if (finish()) reject(new Error("Compression exceeded the safe browser processing time."));
    }, 240_000);
    signal.addEventListener("abort", cancel, { once: true });
    worker.onerror = () => {
      if (finish()) reject(new Error("The local compression engine stopped unexpectedly."));
    };
    worker.onmessage = ({ data }: MessageEvent<PdfCompressionWorkerMessage>) => {
      if (settled) return;
      if (data.type === "progress") {
        onProgress(data.value, data.stage);
      } else if (data.type === "result") {
        if (finish()) resolve(data.value);
      } else if (data.type === "error") {
        if (finish()) reject(new Error(data.message));
      }
    };
    try {
      const workerBytes = originalBytes.slice(0);
      worker.postMessage({ type: "compress", bytes: workerBytes, goal, targetBytes, settingsOverride }, [workerBytes]);
    } catch {
      if (finish()) reject(new Error("The browser could not allocate memory for local compression."));
    }
  });
}
