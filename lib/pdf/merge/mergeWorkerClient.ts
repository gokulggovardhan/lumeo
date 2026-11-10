import { mergeNativeDocuments, type NativeMergeInput, type NativeMergeOptions, type NativeMergeOutput } from "./nativeMerge.ts";

type WorkerMessage =
  | { type: "progress"; completed: number; total: number }
  | { type: "result"; value: NativeMergeOutput }
  | { type: "error"; message: string };

/** Creates a dedicated worker only for the active merge, and releases it
 * on success, error, timeout or cancellation. No remote PDF upload. */
export function mergePdfInBackground(
  inputs: NativeMergeInput[],
  options: Pick<NativeMergeOptions, "format" | "marginPoints">,
  signal: AbortSignal,
  onProgress: (completed: number, total: number) => void,
): Promise<NativeMergeOutput> {
  if (signal.aborted) return Promise.reject(new DOMException("Merge cancelled.", "AbortError"));
  if (typeof Worker === "undefined") {
    // Supported fallback for older browsers. Native merging remains intact,
    // although the interface may be less responsive during a large merge.
    // Worker-less browsers cannot preempt a synchronous PDF operation, but
    // must honour cancellation before, between and after asynchronous stages.
    return mergeNativeDocuments(inputs, { ...options, signal, onProgress });
  }

  return new Promise<NativeMergeOutput>((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("./nativeMerge.worker.ts", import.meta.url), { type: "module" });
    } catch {
      reject(new Error("The local PDF merge worker could not start. Please update your browser."));
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
      if (finish()) reject(new DOMException("Merge cancelled.", "AbortError"));
    };
    const timeout = setTimeout(() => {
      if (finish()) reject(new Error("Merge processing timed out. Try fewer files or a smaller document."));
    }, 240_000);
    signal.addEventListener("abort", cancel, { once: true });
    worker.onerror = () => {
      if (finish()) reject(new Error("The PDF merge worker stopped unexpectedly. Try a smaller merge."));
    };
    worker.onmessage = ({ data }: MessageEvent<WorkerMessage>) => {
      if (settled) return;
      if (data.type === "progress") {
        onProgress(data.completed, data.total);
      } else if (data.type === "result") {
        if (finish()) resolve(data.value);
      } else if (data.type === "error") {
        if (finish()) reject(new Error(data.message));
      }
    };
    try {
      worker.postMessage({ type: "merge", inputs, options }, inputs.map((item) => item.bytes));
    } catch {
      if (finish()) reject(new Error("Unable to transfer these files to the local PDF worker."));
    }
  });
}
