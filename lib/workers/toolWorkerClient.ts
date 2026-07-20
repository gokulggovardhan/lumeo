// lib/workers/toolWorkerClient.ts
//
// Reusable harness for running heavy, CPU-bound tool work (PDF parsing,
// image decode, compression) off the main thread, so the UI never freezes
// while a large file processes. Intended for new tools going forward
// (Inscribe, Seal, Secure, and the rest of the "Coming soon" catalog) --
// none of the 5 already-shipped tools have been moved onto this yet. That
// would mean rewriting production code whose correctness can only really be
// confirmed by running a real file through it end to end, which this pass
// couldn't verify (no file-upload capability in the available browser
// automation). Safer to add this as the foundation the next tool builds on,
// without touching what already works.
//
// Usage from a "use client" component:
//
//   const worker = new Worker(new URL("./myTool.worker.ts", import.meta.url));
//   const result = await runInWorker<MyInput, MyOutput>(worker, input, {
//     onProgress: (pct) => setProgress(pct),
//   });
//
// The worker file on the other side calls `respondToToolWorker` (below) to
// send progress/result/error messages back in the shape this client expects.

export type ToolWorkerProgressMessage = { type: "progress"; value: number };
export type ToolWorkerResultMessage<TOut> = { type: "result"; value: TOut };
export type ToolWorkerErrorMessage = { type: "error"; message: string };
export type ToolWorkerMessage<TOut> =
  | ToolWorkerProgressMessage
  | ToolWorkerResultMessage<TOut>
  | ToolWorkerErrorMessage;

export type RunInWorkerOptions = {
  onProgress?: (value: number) => void;
  /** Safety net so a stuck worker can't hang the UI forever. Defaults to 2 minutes. */
  timeoutMs?: number;
};

export function runInWorker<TIn, TOut>(
  worker: Worker,
  input: TIn,
  options: RunInWorkerOptions = {},
): Promise<TOut> {
  const timeoutMs = options.timeoutMs ?? 120_000;

  return new Promise<TOut>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      worker.terminate();
      reject(new Error("Tool worker timed out."));
    }, timeoutMs);

    function cleanup() {
      window.clearTimeout(timer);
      worker.removeEventListener("message", handleMessage);
      worker.removeEventListener("error", handleError);
    }

    function handleMessage(event: MessageEvent<ToolWorkerMessage<TOut>>) {
      const message = event.data;
      if (message.type === "progress") {
        options.onProgress?.(message.value);
        return;
      }
      cleanup();
      if (message.type === "result") {
        resolve(message.value);
      } else {
        reject(new Error(message.message));
      }
    }

    function handleError(event: ErrorEvent) {
      cleanup();
      reject(new Error(event.message || "Tool worker failed."));
    }

    worker.addEventListener("message", handleMessage);
    worker.addEventListener("error", handleError);
    worker.postMessage(input);
  });
}

// Call from inside a worker file to report progress or finish.
export function reportWorkerProgress(value: number) {
  self.postMessage({ type: "progress", value } satisfies ToolWorkerProgressMessage);
}

export function resolveWorkerResult<TOut>(value: TOut) {
  self.postMessage({ type: "result", value } satisfies ToolWorkerResultMessage<TOut>);
}

export function rejectWorkerError(message: string) {
  self.postMessage({ type: "error", message } satisfies ToolWorkerErrorMessage);
}
