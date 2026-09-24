import assert from "node:assert/strict";
import test from "node:test";

import {
  canRunThreadedBrowserOffice,
  detectBrowserConversionCapabilities,
  missingThreadedBrowserOfficeCapabilities,
  selectConversionProcessingMode,
} from "../lib/conversion/browser/capabilities.ts";

test("capability detection is feature-based and reports storage details", async () => {
  class FakeSharedArrayBuffer extends ArrayBuffer {}
  class FakeMemory {
    buffer = new FakeSharedArrayBuffer(64);
    constructor(options: unknown) {
      void options;
    }
  }
  class FakeFile {
    stream() {}
  }
  class FakeWorker {
    onmessage: ((event: MessageEvent<boolean>) => void) | null = null;
    onerror: ((event: ErrorEvent) => void) | null = null;
    constructor(url: string | URL) {
      void url;
    }
    postMessage() {
      queueMicrotask(() => {
        this.onmessage?.({ data: true } as MessageEvent<boolean>);
      });
    }
    terminate() {}
  }

  const result = await detectBrowserConversionCapabilities({
    WebAssembly: { Memory: FakeMemory } as unknown as typeof WebAssembly,
    Worker: FakeWorker,
    SharedArrayBuffer: FakeSharedArrayBuffer,
    OffscreenCanvas: class {},
    File: FakeFile as unknown as typeof File,
    structuredClone(value: unknown, options?: { transfer?: Transferable[] }) {
      if (value instanceof ArrayBuffer && options?.transfer?.includes(value)) {
        // Node's native structuredClone is used here only to model the
        // detached-buffer behavior the detector looks for.
        return globalThis.structuredClone(value, { transfer: [value] });
      }
      return globalThis.structuredClone(value);
    },
    crossOriginIsolated: true,
    showSaveFilePicker() {},
    navigator: {
      hardwareConcurrency: 8,
      storage: {
        async getDirectory() {
          return {};
        },
        async estimate() {
          return { quota: 1_000_000, usage: 125_000 };
        },
        async persist() {
          return true;
        },
      },
    },
  });

  assert.equal(result.webAssembly, true);
  assert.equal(result.webWorkers, true);
  assert.equal(result.crossOriginIsolated, true);
  assert.equal(result.opfs, true);
  assert.equal(result.storageEstimate.supported, true);
  assert.equal(result.storageEstimate.quotaBytes, 1_000_000);
  assert.equal(result.storageEstimate.usageBytes, 125_000);
  assert.equal(result.offscreenCanvas, true);
  assert.equal(result.workerOffscreenWebGl, true);
  assert.equal(result.transferableArrayBuffer, true);
  assert.equal(result.hardwareConcurrency, 8);
  assert.equal(result.fileStream, true);
  assert.equal(result.fileSystemAccess, true);
  assert.equal(result.wasmSharedMemory, true);
  assert.equal(result.wasmThreadsReady, true);
  assert.equal(canRunThreadedBrowserOffice(result), true);
});

test("threaded office readiness fails closed without cross-origin isolation", async () => {
  const result = await detectBrowserConversionCapabilities({
    WebAssembly: globalThis.WebAssembly,
    Worker: class {},
    SharedArrayBuffer: globalThis.SharedArrayBuffer,
    structuredClone: globalThis.structuredClone,
    crossOriginIsolated: false,
    navigator: { hardwareConcurrency: 4 },
  });

  assert.equal(result.wasmThreadsReady, false);
  assert.equal(canRunThreadedBrowserOffice(result), false);
});



test("threaded Office readiness requires worker OffscreenCanvas WebGL", () => {
  const capabilities = {
    webAssembly: true,
    webWorkers: true,
    sharedArrayBuffer: true,
    crossOriginIsolated: true,
    opfs: false,
    storageManager: false,
    storageEstimate: {
      supported: false,
      quotaBytes: null,
      usageBytes: null,
    },
    persistentStorage: false,
    offscreenCanvas: false,
    workerOffscreenWebGl: false,
    transferableArrayBuffer: true,
    hardwareConcurrency: 4,
    fileStream: true,
    fileSystemAccess: false,
    wasmSharedMemory: true,
    wasmThreadsReady: true,
  };

  assert.deepEqual(missingThreadedBrowserOfficeCapabilities(capabilities), [
    "worker OffscreenCanvas WebGL",
  ]);
  assert.equal(canRunThreadedBrowserOffice(capabilities), false);
});

test("threaded Office readiness reports the actual missing runtime capability", () => {
  const capabilities = {
    webAssembly: true,
    webWorkers: true,
    sharedArrayBuffer: true,
    crossOriginIsolated: false,
    opfs: false,
    storageManager: false,
    storageEstimate: {
      supported: false,
      quotaBytes: null,
      usageBytes: null,
    },
    persistentStorage: false,
    offscreenCanvas: true,
    workerOffscreenWebGl: true,
    transferableArrayBuffer: true,
    hardwareConcurrency: 4,
    fileStream: true,
    fileSystemAccess: false,
    wasmSharedMemory: true,
    wasmThreadsReady: false,
  };

  assert.deepEqual(missingThreadedBrowserOfficeCapabilities(capabilities), [
    "cross-origin isolation",
  ]);
  assert.equal(canRunThreadedBrowserOffice(capabilities), false);
});

test("processing modes classify normal, large and extreme work without browser sniffing", () => {
  assert.equal(selectConversionProcessingMode({ fileSizeBytes: 2 * 1024 * 1024 }), "normal");
  assert.equal(selectConversionProcessingMode({ fileSizeBytes: 25 * 1024 * 1024 }), "large");
  assert.equal(selectConversionProcessingMode({ fileSizeBytes: 2 * 1024 * 1024, pageCount: 60 }), "large");
  assert.equal(selectConversionProcessingMode({ fileSizeBytes: 80 * 1024 * 1024 }), "extreme");
  assert.equal(selectConversionProcessingMode({ fileSizeBytes: 2 * 1024 * 1024, requiresOcr: true }), "extreme");
});
