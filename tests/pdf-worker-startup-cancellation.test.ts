import assert from "node:assert/strict";
import test from "node:test";
import { mergePdfInBackground } from "../lib/pdf/merge/mergeWorkerClient.ts";
import { compressPdfInBackground } from "../lib/pdf/optimization/compressionWorkerClient.ts";

/**
 * AbortSignal dispatches only once. A Worker can synchronously abort a
 * controller during construction (or an equivalent startup hook) before the
 * client attaches its listener. Both clients must recheck the signal and
 * release their Worker without posting any document bytes.
 */
function mockWorkerThatAbortsOnConstruction(controller: AbortController) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "Worker");
  const counts = { created: 0, posted: 0, terminated: 0 };

  class AbortingWorker {
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: ((event: ErrorEvent) => void) | null = null;

    constructor() {
      counts.created += 1;
      controller.abort();
    }

    postMessage(): void {
      counts.posted += 1;
    }

    terminate(): void {
      counts.terminated += 1;
    }
  }

  Object.defineProperty(globalThis, "Worker", {
    configurable: true,
    writable: true,
    value: AbortingWorker,
  });

  return {
    counts,
    restore() {
      if (descriptor) Object.defineProperty(globalThis, "Worker", descriptor);
      else Reflect.deleteProperty(globalThis, "Worker");
    },
  };
}

test("native Merge Worker startup cancellation rejects before transferring PDF input", { timeout: 5_000 }, async () => {
  const controller = new AbortController();
  const mock = mockWorkerThatAbortsOnConstruction(controller);
  const first = new ArrayBuffer(16);
  const second = new ArrayBuffer(12);
  try {
    await assert.rejects(
      mergePdfInBackground(
        [
          { name: "first.pdf", bytes: first, rotation: 0 },
          { name: "second.pdf", bytes: second, rotation: 0 },
        ],
        { format: "original", marginPoints: 0 },
        controller.signal,
        () => {},
      ),
      { name: "AbortError", message: "Merge cancelled." },
    );
    assert.deepEqual(mock.counts, { created: 1, posted: 0, terminated: 1 });
    assert.equal(first.byteLength, 16);
    assert.equal(second.byteLength, 12);
  } finally {
    mock.restore();
  }
});

test("shared Compress Worker startup cancellation rejects without copying or posting input", { timeout: 5_000 }, async () => {
  const controller = new AbortController();
  const mock = mockWorkerThatAbortsOnConstruction(controller);
  const input = new ArrayBuffer(16);
  try {
    await assert.rejects(
      compressPdfInBackground(input, "recommended", undefined, controller.signal, () => {}),
      { name: "AbortError", message: "Compression cancelled." },
    );
    assert.deepEqual(mock.counts, { created: 1, posted: 0, terminated: 1 });
    assert.equal(input.byteLength, 16);
  } finally {
    mock.restore();
  }
});
