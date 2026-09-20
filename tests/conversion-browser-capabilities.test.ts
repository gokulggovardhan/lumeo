import assert from "node:assert/strict";
import test from "node:test";

import {
  canRunThreadedBrowserOffice,
  detectBrowserConversionCapabilities,
  selectConversionProcessingMode,
} from "../lib/conversion/browser/capabilities.ts";

test("capability detection is feature-based and reports storage details", async () => {
  class FakeSharedArrayBuffer extends ArrayBuffer {}
  class FakeMemory {
    buffer = new FakeSharedArrayBuffer(64);
    constructor(_options: unknown) {}
  }
  class FakeFile {
    stream() {}
  }

  const result = await detectBrowserConversionCapabilities({
    WebAssembly: { Memory: FakeMemory } as unknown as typeof WebAssembly,
    Worker: class {},
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

test("processing modes classify normal, large and extreme work without browser sniffing", () => {
  assert.equal(selectConversionProcessingMode({ fileSizeBytes: 2 * 1024 * 1024 }), "normal");
  assert.equal(selectConversionProcessingMode({ fileSizeBytes: 25 * 1024 * 1024 }), "large");
  assert.equal(selectConversionProcessingMode({ fileSizeBytes: 2 * 1024 * 1024, pageCount: 60 }), "large");
  assert.equal(selectConversionProcessingMode({ fileSizeBytes: 80 * 1024 * 1024 }), "extreme");
  assert.equal(selectConversionProcessingMode({ fileSizeBytes: 2 * 1024 * 1024, requiresOcr: true }), "extreme");
});
