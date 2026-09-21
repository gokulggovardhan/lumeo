import type { ConversionKind } from "@/lib/conversion/types";

export const CONVERSION_WORKSPACE_ROOT = "lumeo-conversion-jobs";
export const CONVERSION_JOB_PREFIX = "job-";
export const CONVERSION_JOB_METADATA = "job.json";
export const CONVERSION_JOB_LOG = "job.log";
export const CONVERSION_ORPHAN_MAX_AGE_MS = 6 * 60 * 60 * 1000;
export const CONVERSION_WORKSPACE_SETUP_TIMEOUT_MS = 5_000;
export const CONVERSION_STORAGE_PROBE_TIMEOUT_MS = 2_000;
export const CONVERSION_WORKSPACE_DIRECTORIES = [
  "input",
  "working",
  "pages",
  "images",
  "checkpoints",
  "output",
] as const;

export type ConversionWorkspaceDirectoryName =
  (typeof CONVERSION_WORKSPACE_DIRECTORIES)[number];

export type ConversionJobStatus =
  | "created"
  | "running"
  | "completed"
  | "cancelled"
  | "failed";

export type ConversionJobMetadata = {
  version: 1;
  jobId: string;
  kind: ConversionKind;
  status: ConversionJobStatus;
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceCleanupResult = {
  removed: number;
  preserved: number;
  errors: number;
};

export type LocalStorageEstimate = {
  supported: boolean;
  quotaBytes: number | null;
  usageBytes: number | null;
  availableBytes: number | null;
};

export function hasLocalWorkspaceCapacity(
  estimate: LocalStorageEstimate,
  requiredBytes: number,
): boolean {
  if (!estimate.supported || estimate.availableBytes === null) return true;
  return estimate.availableBytes >= requiredBytes;
}

type StorageManagerWithOpfs = StorageManager & {
  getDirectory?: () => Promise<FileSystemDirectoryHandle>;
};

type DirectoryHandleWithEntries = FileSystemDirectoryHandle & {
  entries(): AsyncIterableIterator<
    [string, FileSystemFileHandle | FileSystemDirectoryHandle]
  >;
};

type PickerOptions = {
  suggestedName?: string;
  types?: Array<{
    description?: string;
    accept: Record<string, string[]>;
  }>;
};

type FilePickerScope = typeof globalThis & {
  showSaveFilePicker?: (options?: PickerOptions) => Promise<FileSystemFileHandle>;
};

function storageManager(): StorageManagerWithOpfs | null {
  if (typeof navigator === "undefined" || !navigator.storage) return null;
  return navigator.storage as StorageManagerWithOpfs;
}

function workspaceAbortReason(signal?: AbortSignal): unknown {
  return signal?.reason ?? new DOMException("Conversion cancelled", "AbortError");
}

function throwIfWorkspaceAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw workspaceAbortReason(signal);
}

async function withWorkspaceDeadline<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
  signal?: AbortSignal,
): Promise<T> {
  throwIfWorkspaceAborted(signal);

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (callback: (value: T) => void, value: T) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      callback(value);
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(error);
    };
    const onAbort = () => fail(workspaceAbortReason(signal));
    const timer = setTimeout(() => fail(new Error(message)), timeoutMs);

    signal?.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => finish(resolve, value),
      (error) => fail(error),
    );
  });
}

function parseTimestamp(value: string): number | null {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function shouldRemoveConversionJob(
  metadata: ConversionJobMetadata | null,
  now = Date.now(),
  maxAgeMs = CONVERSION_ORPHAN_MAX_AGE_MS,
): boolean {
  if (!metadata) return true;

  if (
    metadata.status === "completed" ||
    metadata.status === "cancelled" ||
    metadata.status === "failed"
  ) {
    return true;
  }

  const updatedAt = parseTimestamp(metadata.updatedAt);
  if (updatedAt === null) return true;
  return now - updatedAt > maxAgeMs;
}

function safeExtension(name: string): string {
  const match = /\.([a-z0-9]{1,12})$/i.exec(name);
  return match ? `.${match[1].toLowerCase()}` : "";
}

function safeOutputName(name: string): string {
  const clean = name
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);

  return clean || "output";
}

async function readMetadata(
  directory: FileSystemDirectoryHandle,
): Promise<ConversionJobMetadata | null> {
  try {
    const handle = await directory.getFileHandle(CONVERSION_JOB_METADATA);
    const file = await handle.getFile();
    const parsed = JSON.parse(await file.text()) as Partial<ConversionJobMetadata>;

    if (
      parsed.version !== 1 ||
      typeof parsed.jobId !== "string" ||
      (parsed.kind !== "word-to-pdf" && parsed.kind !== "pdf-to-word") ||
      typeof parsed.status !== "string" ||
      typeof parsed.createdAt !== "string" ||
      typeof parsed.updatedAt !== "string"
    ) {
      return null;
    }

    return parsed as ConversionJobMetadata;
  } catch {
    return null;
  }
}

async function writeTextFile(
  directory: FileSystemDirectoryHandle,
  name: string,
  text: string,
): Promise<void> {
  const handle = await directory.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  try {
    await writable.write(text);
    await writable.close();
  } catch (error) {
    await writable.abort().catch(() => {});
    throw error;
  }
}

async function streamBlobToHandle(
  blob: Blob,
  handle: FileSystemFileHandle,
  signal?: AbortSignal,
): Promise<void> {
  throwIfWorkspaceAborted(signal);
  const writable = await handle.createWritable();

  try {
    if (typeof blob.stream === "function") {
      const reader = blob.stream().getReader();
      try {
        while (true) {
          throwIfWorkspaceAborted(signal);
          const { done, value } = await reader.read();
          if (done) break;
          if (value?.byteLength) {
            await writable.write(value);
          }
        }
      } catch (error) {
        await reader.cancel().catch(() => {});
        throw error;
      } finally {
        reader.releaseLock();
      }
    } else {
      const chunkBytes = 4 * 1024 * 1024;
      for (let offset = 0; offset < blob.size; offset += chunkBytes) {
        throwIfWorkspaceAborted(signal);
        const chunk = new Uint8Array(
          await blob.slice(offset, Math.min(blob.size, offset + chunkBytes)).arrayBuffer(),
        );
        await writable.write(chunk);
      }
    }

    throwIfWorkspaceAborted(signal);
    await writable.close();
  } catch (error) {
    await writable.abort().catch(() => {});
    throw error;
  }
}

async function getAppRoot(
  signal?: AbortSignal,
): Promise<FileSystemDirectoryHandle> {
  const storage = storageManager();
  if (!storage || typeof storage.getDirectory !== "function") {
    throw new Error("Local browser workspace is not available in this browser.");
  }

  const opfsRoot = await withWorkspaceDeadline(
    storage.getDirectory(),
    CONVERSION_WORKSPACE_SETUP_TIMEOUT_MS,
    "Local browser workspace did not become ready.",
    signal,
  );
  return withWorkspaceDeadline(
    opfsRoot.getDirectoryHandle(CONVERSION_WORKSPACE_ROOT, { create: true }),
    CONVERSION_WORKSPACE_SETUP_TIMEOUT_MS,
    "Local browser workspace could not be opened.",
    signal,
  );
}

export async function estimateLocalConversionStorage(
  signal?: AbortSignal,
): Promise<LocalStorageEstimate> {
  const storage = storageManager();
  if (!storage || typeof storage.estimate !== "function") {
    return {
      supported: false,
      quotaBytes: null,
      usageBytes: null,
      availableBytes: null,
    };
  }

  try {
    const estimate = await withWorkspaceDeadline(
      storage.estimate(),
      CONVERSION_STORAGE_PROBE_TIMEOUT_MS,
      "Browser storage estimate timed out.",
      signal,
    );
    const quotaBytes = typeof estimate.quota === "number" ? estimate.quota : null;
    const usageBytes = typeof estimate.usage === "number" ? estimate.usage : null;
    return {
      supported: true,
      quotaBytes,
      usageBytes,
      availableBytes:
        quotaBytes !== null && usageBytes !== null
          ? Math.max(0, quotaBytes - usageBytes)
          : null,
    };
  } catch {
    return {
      supported: true,
      quotaBytes: null,
      usageBytes: null,
      availableBytes: null,
    };
  }
}

export async function requestPersistentConversionStorage(): Promise<boolean> {
  const storage = storageManager();
  if (!storage || typeof storage.persist !== "function") return false;

  try {
    return await withWorkspaceDeadline(
      storage.persist(),
      CONVERSION_STORAGE_PROBE_TIMEOUT_MS,
      "Persistent storage request timed out.",
    );
  } catch {
    return false;
  }
}

export async function cleanupOrphanedConversionJobs(
  now = Date.now(),
  signal?: AbortSignal,
): Promise<WorkspaceCleanupResult> {
  const root = await getAppRoot(signal);
  const result: WorkspaceCleanupResult = { removed: 0, preserved: 0, errors: 0 };

  for await (const [name, handle] of (root as DirectoryHandleWithEntries).entries()) {
    throwIfWorkspaceAborted(signal);
    if (handle.kind !== "directory" || !name.startsWith(CONVERSION_JOB_PREFIX)) continue;

    const directory = handle as FileSystemDirectoryHandle;
    const metadata = await readMetadata(directory);

    if (!shouldRemoveConversionJob(metadata, now)) {
      result.preserved += 1;
      continue;
    }

    try {
      await root.removeEntry(name, { recursive: true });
      result.removed += 1;
    } catch {
      result.errors += 1;
    }
  }

  return result;
}

export class BrowserConversionWorkspace {
  readonly jobId: string;
  readonly kind: ConversionKind;
  readonly directory: FileSystemDirectoryHandle;

  private readonly root: FileSystemDirectoryHandle;
  private readonly directories: Record<
    ConversionWorkspaceDirectoryName,
    FileSystemDirectoryHandle
  >;
  private status: ConversionJobStatus = "created";
  private disposed = false;

  private constructor(
    root: FileSystemDirectoryHandle,
    directory: FileSystemDirectoryHandle,
    directories: Record<ConversionWorkspaceDirectoryName, FileSystemDirectoryHandle>,
    metadata: ConversionJobMetadata,
  ) {
    this.root = root;
    this.directory = directory;
    this.directories = directories;
    this.jobId = metadata.jobId;
    this.kind = metadata.kind;
    this.status = metadata.status;
  }

  static async create(
    kind: ConversionKind,
    signal?: AbortSignal,
  ): Promise<BrowserConversionWorkspace> {
    // Persistence improves quota durability but must never block a conversion.
    void requestPersistentConversionStorage().catch(() => {});

    const root = await getAppRoot(signal);
    // Orphan cleanup is housekeeping, not a conversion prerequisite. In
    // particular, Firefox may take a long time to enumerate OPFS entries.
    // Never let that block a fresh conversion.
    void cleanupOrphanedConversionJobs(Date.now()).catch(() => {});
    throwIfWorkspaceAborted(signal);

    const jobId = crypto.randomUUID();
    const directory = await root.getDirectoryHandle(
      `${CONVERSION_JOB_PREFIX}${jobId}`,
      { create: true },
    );
    const entries = await Promise.all(
      CONVERSION_WORKSPACE_DIRECTORIES.map(async (name) => [
        name,
        await directory.getDirectoryHandle(name, { create: true }),
      ] as const),
    );
    const directories = Object.fromEntries(entries) as Record<
      ConversionWorkspaceDirectoryName,
      FileSystemDirectoryHandle
    >;

    const now = new Date().toISOString();
    const metadata: ConversionJobMetadata = {
      version: 1,
      jobId,
      kind,
      status: "created",
      createdAt: now,
      updatedAt: now,
    };

    await writeTextFile(directory, CONVERSION_JOB_METADATA, JSON.stringify(metadata));
    return new BrowserConversionWorkspace(root, directory, directories, metadata);
  }

  private assertOpen() {
    if (this.disposed) throw new Error("Conversion workspace is already closed.");
  }

  private async writeMetadata(status: ConversionJobStatus): Promise<void> {
    this.assertOpen();
    const previous = await readMetadata(this.directory);
    const now = new Date().toISOString();
    const metadata: ConversionJobMetadata = {
      version: 1,
      jobId: this.jobId,
      kind: this.kind,
      status,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
    };

    await writeTextFile(this.directory, CONVERSION_JOB_METADATA, JSON.stringify(metadata));
    this.status = status;
  }

  async markRunning(): Promise<void> {
    await this.writeMetadata("running");
  }

  async appendLog(message: string): Promise<void> {
    this.assertOpen();
    const handle = await this.directory.getFileHandle(CONVERSION_JOB_LOG, { create: true });
    const existing = await handle.getFile();
    const writable = await handle.createWritable({ keepExistingData: true });

    try {
      await writable.seek(existing.size);
      await writable.write(`[${new Date().toISOString()}] ${message}\n`);
      await writable.close();
    } catch (error) {
      await writable.abort().catch(() => {});
      throw error;
    }
  }

  async stageInput(
    file: File,
    signal?: AbortSignal,
  ): Promise<FileSystemFileHandle> {
    this.assertOpen();
    const handle = await this.directories.input.getFileHandle(
      `input${safeExtension(file.name)}`,
      { create: true },
    );
    await streamBlobToHandle(file, handle, signal);
    return handle;
  }

  async writeOutput(
    name: string,
    blob: Blob,
    signal?: AbortSignal,
  ): Promise<FileSystemFileHandle> {
    this.assertOpen();
    const handle = await this.directories.output.getFileHandle(
      safeOutputName(name),
      { create: true },
    );
    await streamBlobToHandle(blob, handle, signal);
    return handle;
  }

  async getFile(name: string): Promise<File> {
    this.assertOpen();
    const handle = await this.directories.output.getFileHandle(safeOutputName(name));
    return handle.getFile();
  }

  getDirectory(name: ConversionWorkspaceDirectoryName): FileSystemDirectoryHandle {
    this.assertOpen();
    return this.directories[name];
  }

  async dispose(status: Exclude<ConversionJobStatus, "created" | "running">): Promise<void> {
    if (this.disposed) return;

    try {
      await this.writeMetadata(status);
    } finally {
      this.disposed = true;
      await this.root
        .removeEntry(`${CONVERSION_JOB_PREFIX}${this.jobId}`, { recursive: true })
        .catch(() => {
          // If deletion is interrupted, terminal metadata makes the next
          // orphan sweep remove the directory immediately.
        });
    }
  }

  get currentStatus(): ConversionJobStatus {
    return this.status;
  }
}

/**
 * Optional zero-copy-ish download path for browsers with the File System
 * Access API. Call from a user gesture (for example the existing Download
 * button); callers can fall back to an object URL when this returns false.
 */
export async function saveLocalFileWithPicker(
  source: File,
  suggestedName: string,
  mimeType: string,
): Promise<boolean> {
  const scope = globalThis as FilePickerScope;
  if (typeof scope.showSaveFilePicker !== "function") return false;

  const handle = await scope.showSaveFilePicker({
    suggestedName: safeOutputName(suggestedName),
    types: [{ description: "Converted document", accept: { [mimeType]: [safeExtension(suggestedName)] } }],
  });

  await streamBlobToHandle(source, handle);
  return true;
}
