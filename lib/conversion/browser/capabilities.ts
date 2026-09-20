export type ConversionProcessingMode = "normal" | "large" | "extreme";

export type StorageEstimate = {
  supported: boolean;
  quotaBytes: number | null;
  usageBytes: number | null;
};

export type BrowserConversionCapabilities = {
  webAssembly: boolean;
  webWorkers: boolean;
  sharedArrayBuffer: boolean;
  crossOriginIsolated: boolean;
  opfs: boolean;
  storageManager: boolean;
  storageEstimate: StorageEstimate;
  persistentStorage: boolean;
  offscreenCanvas: boolean;
  transferableArrayBuffer: boolean;
  hardwareConcurrency: number | null;
  fileStream: boolean;
  fileSystemAccess: boolean;
  wasmSharedMemory: boolean;
  wasmThreadsReady: boolean;
};

type NavigatorLike = {
  hardwareConcurrency?: number;
  storage?: {
    getDirectory?: () => Promise<unknown>;
    estimate?: () => Promise<{ quota?: number; usage?: number }>;
    persist?: () => Promise<boolean>;
  };
};

type CapabilityScope = {
  WebAssembly?: typeof WebAssembly;
  Worker?: unknown;
  SharedArrayBuffer?: unknown;
  OffscreenCanvas?: unknown;
  File?: typeof File;
  structuredClone?: typeof structuredClone;
  crossOriginIsolated?: boolean;
  showSaveFilePicker?: unknown;
  navigator?: NavigatorLike;
};

function finitePositive(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function supportsTransferableArrayBuffer(scope: CapabilityScope): boolean {
  if (typeof scope.structuredClone !== "function") return false;

  try {
    const source = new ArrayBuffer(1);
    const cloned = scope.structuredClone(source, { transfer: [source] });
    return source.byteLength === 0 && cloned instanceof ArrayBuffer && cloned.byteLength === 1;
  } catch {
    return false;
  }
}

function supportsWasmSharedMemory(scope: CapabilityScope): boolean {
  const SharedArrayBufferCtor = scope.SharedArrayBuffer;
  if (!scope.WebAssembly || typeof SharedArrayBufferCtor !== "function") return false;

  try {
    const memory = new scope.WebAssembly.Memory({
      initial: 1,
      maximum: 1,
      shared: true,
    });
    return memory.buffer instanceof (SharedArrayBufferCtor as typeof SharedArrayBuffer);
  } catch {
    return false;
  }
}

async function readStorageEstimate(navigatorLike: NavigatorLike | undefined): Promise<StorageEstimate> {
  const storage = navigatorLike?.storage;
  const estimate = storage?.estimate;
  if (!storage || typeof estimate !== "function") {
    return { supported: false, quotaBytes: null, usageBytes: null };
  }

  try {
    const result = await estimate.call(storage);
    return {
      supported: true,
      quotaBytes: finitePositive(result.quota) ?? (result.quota === 0 ? 0 : null),
      usageBytes: finitePositive(result.usage) ?? (result.usage === 0 ? 0 : null),
    };
  } catch {
    // Capability exists even if a particular browser denies or fails this
    // estimate call. Treat the values as unknown instead of disabling local
    // conversion altogether.
    return { supported: true, quotaBytes: null, usageBytes: null };
  }
}

/**
 * Runtime feature detection only. Never branch on browser name/user agent:
 * capability presence is the contract the conversion engines actually need.
 */
export async function detectBrowserConversionCapabilities(
  scope: CapabilityScope = globalThis as unknown as CapabilityScope,
): Promise<BrowserConversionCapabilities> {
  const navigatorLike = scope.navigator;
  const storageManager = Boolean(navigatorLike?.storage);
  const opfs = typeof navigatorLike?.storage?.getDirectory === "function";
  const persistentStorage = typeof navigatorLike?.storage?.persist === "function";
  const webAssembly = typeof scope.WebAssembly === "object";
  const sharedArrayBuffer = typeof scope.SharedArrayBuffer !== "undefined";
  const crossOriginIsolated = scope.crossOriginIsolated === true;
  const wasmSharedMemory = supportsWasmSharedMemory(scope);

  const filePrototype = scope.File?.prototype as { stream?: unknown } | undefined;

  return {
    webAssembly,
    webWorkers: typeof scope.Worker !== "undefined",
    sharedArrayBuffer,
    crossOriginIsolated,
    opfs,
    storageManager,
    storageEstimate: await readStorageEstimate(navigatorLike),
    persistentStorage,
    offscreenCanvas: typeof scope.OffscreenCanvas !== "undefined",
    transferableArrayBuffer: supportsTransferableArrayBuffer(scope),
    hardwareConcurrency: finitePositive(navigatorLike?.hardwareConcurrency),
    fileStream: typeof filePrototype?.stream === "function",
    fileSystemAccess: typeof scope.showSaveFilePicker === "function",
    wasmSharedMemory,
    // Emscripten pthread builds require both shared WASM memory and a
    // cross-origin-isolated page before SharedArrayBuffer can be used safely.
    wasmThreadsReady: webAssembly && wasmSharedMemory && crossOriginIsolated,
  };
}

export type ProcessingModeInput = {
  fileSizeBytes: number;
  pageCount?: number | null;
  imageHeavy?: boolean;
  requiresOcr?: boolean;
};

/**
 * Internal routing hint only; this is deliberately not a user-facing quality
 * tier. Thresholds are conservative starting points and can be tuned from
 * measurements without changing the UI or engine contract.
 */
export function selectConversionProcessingMode(input: ProcessingModeInput): ConversionProcessingMode {
  const pageCount = input.pageCount ?? 0;

  if (
    input.requiresOcr ||
    input.fileSizeBytes >= 75 * 1024 * 1024 ||
    pageCount >= 150
  ) {
    return "extreme";
  }

  if (
    input.imageHeavy ||
    input.fileSizeBytes >= 20 * 1024 * 1024 ||
    pageCount >= 50
  ) {
    return "large";
  }

  return "normal";
}

export function canRunThreadedBrowserOffice(
  capabilities: BrowserConversionCapabilities,
): boolean {
  return (
    capabilities.webAssembly &&
    capabilities.webWorkers &&
    capabilities.sharedArrayBuffer &&
    capabilities.crossOriginIsolated &&
    capabilities.wasmSharedMemory &&
    capabilities.wasmThreadsReady
  );
}
