import {
  preflightOfficeAssetOrigin,
  resolveOfficeAssetConfig,
  type OfficeAssetConfig,
} from "@/lib/conversion/browser/libreoffice/assetConfig";

const READY_TIMEOUT_MS = 180_000;
const CONVERSION_TIMEOUT_MS = 300_000;
const IO_CHUNK_BYTES = 4 * 1024 * 1024;

type EmscriptenFs = {
  mkdir(path: string): void;
  open(path: string, flags: string): unknown;
  close(stream: unknown): void;
  write(
    stream: unknown,
    buffer: Uint8Array,
    offset: number,
    length: number,
    position?: number,
  ): number;
  read(
    stream: unknown,
    buffer: Uint8Array,
    offset: number,
    length: number,
    position?: number,
  ): number;
  stat(path: string): { size: number };
  unlink(path: string): void;
};

type ZetaHelperMainInstance = {
  FS: EmscriptenFs;
  thrPort: MessagePort;
  start(callback: () => void): void;
};

type ZetaHelperMainConstructor = new (
  threadJs: string | URL | null,
  options: {
    threadJsType: string | null;
    wasmPkg: string | null;
    blockPageScroll: boolean;
  },
) => ZetaHelperMainInstance;

type OfficeThreadMessage =
  | { cmd: "ready" }
  | { cmd: "converted"; requestId: string; to: string }
  | { cmd: "convert-error"; requestId: string; message: string };

type RuntimeWindow = Window & {
  __lumeoBrowserOfficeZetaHelperMain?: ZetaHelperMainConstructor;
  Module?: unknown;
  FS?: unknown;
};

declare global {
  interface Window {
    __lumeoBrowserOfficeZetaHelperMain?: ZetaHelperMainConstructor;
  }
}

function abortError(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("Conversion cancelled", "AbortError");
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw abortError(signal);
}

async function waitForPromiseOrAbort(
  promise: Promise<void>,
  signal: AbortSignal,
): Promise<void> {
  throwIfAborted(signal);

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      callback();
    };
    const onAbort = () => finish(() => reject(abortError(signal)));

    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      () => finish(resolve),
      (error) => finish(() => reject(error)),
    );
  });
}

function safeExtension(fileName: string): string {
  const match = /\.(docx?|odt)$/i.exec(fileName);
  if (!match) throw new Error("Use a DOC, DOCX, or ODT document.");
  return `.${match[1].toLowerCase()}`;
}

function ensureOfficeCanvas(): HTMLCanvasElement {
  const existing = document.getElementById("qtcanvas");
  if (existing instanceof HTMLCanvasElement) return existing;

  const canvas = document.createElement("canvas");
  canvas.id = "qtcanvas";
  canvas.hidden = true;
  canvas.setAttribute("aria-hidden", "true");
  document.body.appendChild(canvas);
  return canvas;
}

function loadZetaHelperConstructor(
  helperUrl: string,
): Promise<ZetaHelperMainConstructor> {
  if (window.__lumeoBrowserOfficeZetaHelperMain) {
    return Promise.resolve(window.__lumeoBrowserOfficeZetaHelperMain);
  }

  return new Promise((resolve, reject) => {
    const eventName = `lumeo:zeta-helper:${crypto.randomUUID()}`;
    const moduleUrl = URL.createObjectURL(
      new Blob(
        [
          `import { ZetaHelperMain } from ${JSON.stringify(helperUrl)};
globalThis.__lumeoBrowserOfficeZetaHelperMain = ZetaHelperMain;
dispatchEvent(new CustomEvent(${JSON.stringify(eventName)}));`,
        ],
        { type: "text/javascript" },
      ),
    );
    const script = document.createElement("script");
    script.type = "module";
    script.src = moduleUrl;

    const cleanup = () => {
      script.remove();
      URL.revokeObjectURL(moduleUrl);
      window.removeEventListener(eventName, handleReady);
    };
    const handleReady = () => {
      const constructor = window.__lumeoBrowserOfficeZetaHelperMain;
      cleanup();
      if (constructor) resolve(constructor);
      else reject(new Error("The browser Office helper did not initialize."));
    };

    window.addEventListener(eventName, handleReady, { once: true });
    script.onerror = () => {
      cleanup();
      reject(new Error("The browser Office helper could not be loaded."));
    };
    document.head.appendChild(script);
  });
}

function createOfficeThreadModule(helperUrl: string): string {
  const source = `
import { ZetaHelperThread } from ${JSON.stringify(helperUrl)};

const helper = new ZetaHelperThread();
const zetajs = helper.zetajs;
const css = helper.css;
const hidden = new css.beans.PropertyValue({ Name: "Hidden", Value: true });
const overwrite = new css.beans.PropertyValue({ Name: "Overwrite", Value: true });
const pdfExport = new css.beans.PropertyValue({
  Name: "FilterName",
  Value: "writer_pdf_Export",
});

function closeModel(model) {
  if (!model) return;
  try {
    const closeable = model.queryInterface(
      zetajs.type.interface(css.util.XCloseable),
    );
    if (closeable) closeable.close(false);
  } catch {}
}

helper.thrPort.onmessage = (event) => {
  const message = event.data;
  if (message.cmd !== "convert") return;

  let model;
  try {
    model = helper.desktop.loadComponentFromURL(
      "file://" + message.from,
      "_blank",
      0,
      [hidden],
    );
    model.storeToURL("file://" + message.to, [overwrite, pdfExport]);
    zetajs.mainPort.postMessage({
      cmd: "converted",
      requestId: message.requestId,
      to: message.to,
    });
  } catch (error) {
    let detail = "LibreOffice could not convert this document.";
    try {
      const exception = zetajs.catchUnoException(error);
      if (exception?.Message) detail = String(exception.Message);
    } catch {}
    zetajs.mainPort.postMessage({
      cmd: "convert-error",
      requestId: message.requestId,
      message: detail,
    });
  } finally {
    closeModel(model);
  }
};

helper.thrPort.postMessage({ cmd: "ready" });
`;
  return URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
}

async function waitForReady(
  helper: ZetaHelperMainInstance,
  signal: AbortSignal,
): Promise<void> {
  throwIfAborted(signal);

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      finish(
        reject,
        new Error("The local Office engine did not finish loading."),
      );
    }, READY_TIMEOUT_MS);

    const onAbort = () => finish(reject, abortError(signal));

    const finish = (
      callback: (value?: never) => void,
      value?: unknown,
    ) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      if (helper.thrPort) helper.thrPort.onmessage = null;
      if (value === undefined) resolve();
      else callback(value as never);
    };

    signal.addEventListener("abort", onAbort, { once: true });
    helper.start(() => {
      helper.thrPort.onmessage = (
        event: MessageEvent<OfficeThreadMessage>,
      ) => {
        if (event.data.cmd === "ready") finish(() => undefined);
      };
    });
  });
}

async function writeBlobToFs(
  fs: EmscriptenFs,
  path: string,
  source: Blob,
  signal: AbortSignal,
  onProgress?: (loaded: number, total: number) => void,
): Promise<void> {
  const stream = fs.open(path, "w+");
  let position = 0;
  const reader = source.stream().getReader();

  try {
    while (true) {
      throwIfAborted(signal);

      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.byteLength) continue;

      for (let offset = 0; offset < value.byteLength; offset += IO_CHUNK_BYTES) {
        throwIfAborted(signal);
        const part = value.subarray(
          offset,
          Math.min(value.byteLength, offset + IO_CHUNK_BYTES),
        );
        fs.write(stream, part, 0, part.byteLength, position);
        position += part.byteLength;
        onProgress?.(position, source.size);
      }
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
    fs.close(stream);
  }
}

function readFsFileAsBlob(
  fs: EmscriptenFs,
  path: string,
  mimeType: string,
): Blob {
  const size = fs.stat(path).size;
  const stream = fs.open(path, "r");
  const parts: BlobPart[] = [];
  let position = 0;

  try {
    while (position < size) {
      const length = Math.min(IO_CHUNK_BYTES, size - position);
      const buffer = new Uint8Array(length);
      const read = fs.read(stream, buffer, 0, length, position);
      if (read <= 0) break;
      parts.push(read === buffer.byteLength ? buffer : buffer.slice(0, read));
      position += read;
    }
  } finally {
    fs.close(stream);
  }

  return new Blob(parts, { type: mimeType });
}

export type BrowserOfficeConvertOptions = {
  signal: AbortSignal;
  onInputProgress?: (loaded: number, total: number) => void;
  onInputReady?: () => void;
};

export class BrowserLibreOfficeRuntime {
  private helper: ZetaHelperMainInstance | null = null;
  private officeThreadUrl: string | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private startPromise: Promise<void> | null = null;
  private ready = false;

  constructor(private readonly assets: OfficeAssetConfig) {}

  async start(signal: AbortSignal): Promise<void> {
    throwIfAborted(signal);
    if (this.ready && this.helper) return;

    while (!this.ready) {
      this.startPromise ??= this.initialize().finally(() => {
        this.startPromise = null;
      });
      await waitForPromiseOrAbort(this.startPromise, signal);
      throwIfAborted(signal);
    }
  }

  private async initialize(): Promise<void> {
    const bootstrapSignal = new AbortController().signal;

    if (
      !crossOriginIsolated ||
      typeof SharedArrayBuffer === "undefined" ||
      typeof WebAssembly === "undefined" ||
      typeof Worker === "undefined"
    ) {
      throw new Error(
        "This browser cannot run local Office conversion because cross-origin isolated WebAssembly workers are unavailable.",
      );
    }

    ensureOfficeCanvas();
    await preflightOfficeAssetOrigin(this.assets, bootstrapSignal);

    const ZetaHelperMain = await loadZetaHelperConstructor(this.assets.helperUrl);

    this.officeThreadUrl = createOfficeThreadModule(this.assets.helperUrl);
    const helper = new ZetaHelperMain(this.officeThreadUrl, {
      threadJsType: "module",
      wasmPkg: `url:${this.assets.officeBaseUrl}`,
      blockPageScroll: false,
    });
    this.helper = helper;

    try {
      await waitForReady(helper, bootstrapSignal);
      this.ready = true;
    } catch (error) {
      this.destroyNow();
      throw error;
    }
  }

  convertDocumentToPdf(
    file: File,
    options: BrowserOfficeConvertOptions,
  ): Promise<Blob> {
    const operation = this.queue.then(async () => {
      throwIfAborted(options.signal);
      return this.convertDocumentToPdfExclusive(file, options);
    });
    this.queue = operation.catch(() => undefined);
    return operation;
  }

  private async waitForConversion(
    helper: ZetaHelperMainInstance,
    requestId: string,
    from: string,
    to: string,
    signal: AbortSignal,
  ): Promise<void> {
    throwIfAborted(signal);

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const timer = window.setTimeout(() => {
        finish(
          reject,
          new Error("Local Word to PDF conversion exceeded the safety watchdog."),
          true,
        );
      }, CONVERSION_TIMEOUT_MS);

      const cleanup = () => {
        window.clearTimeout(timer);
        signal.removeEventListener("abort", onAbort);
        helper.thrPort.removeEventListener("message", onMessage);
      };

      const finish = (
        callback: (value?: never) => void,
        value?: unknown,
        resetRuntime = false,
      ) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (resetRuntime) this.destroy();
        if (value === undefined) resolve();
        else callback(value as never);
      };

      const onAbort = () => finish(reject, abortError(signal), true);
      const onMessage = (event: MessageEvent<OfficeThreadMessage>) => {
        const message = event.data;
        if (
          (message.cmd !== "converted" && message.cmd !== "convert-error") ||
          message.requestId !== requestId
        ) {
          return;
        }

        if (message.cmd === "convert-error") {
          finish(reject, new Error(message.message));
        } else {
          finish(() => undefined);
        }
      };

      signal.addEventListener("abort", onAbort, { once: true });
      helper.thrPort.addEventListener("message", onMessage);
      helper.thrPort.postMessage({
        cmd: "convert",
        requestId,
        from,
        to,
      });
    });
  }

  private async convertDocumentToPdfExclusive(
    file: File,
    options: BrowserOfficeConvertOptions,
  ): Promise<Blob> {
    await this.start(options.signal);
    const helper = this.helper;
    if (!helper) throw new Error("The local Office engine is unavailable.");

    try {
      helper.FS.mkdir("/tmp/lumeo");
    } catch {}

    const requestId = crypto.randomUUID();
    const from = `/tmp/lumeo/input-${requestId}${safeExtension(file.name)}`;
    const to = `/tmp/lumeo/output-${requestId}.pdf`;

    try {
      await writeBlobToFs(
        helper.FS,
        from,
        file,
        options.signal,
        options.onInputProgress,
      );
      throwIfAborted(options.signal);
      options.onInputReady?.();

      await this.waitForConversion(
        helper,
        requestId,
        from,
        to,
        options.signal,
      );

      throwIfAborted(options.signal);
      return readFsFileAsBlob(helper.FS, to, "application/pdf");
    } finally {
      try {
        helper.FS.unlink(from);
      } catch {}
      try {
        helper.FS.unlink(to);
      } catch {}
    }
  }

  /**
   * ZetaJS 1.2.0 does not expose a public worker termination API. Its Office
   * thread continues to use window.Module after initialization, so deleting
   * globals or closing its port poisons all later conversions in this page.
   * Job files are removed in convertDocumentToPdfExclusive; the initialized
   * runtime itself is retained and reused until the browser releases the page.
   */
  destroy(): void {
    if (this.ready || this.startPromise) return;
    this.destroyNow();
  }

  private destroyNow(): void {
    const helper = this.helper;
    this.helper = null;
    this.ready = false;

    try {
      helper?.thrPort?.close();
    } catch {}

    if (this.officeThreadUrl) {
      URL.revokeObjectURL(this.officeThreadUrl);
      this.officeThreadUrl = null;
    }

    const sofficeUrl = new URL("soffice.js", this.assets.officeBaseUrl).toString();
    for (const script of Array.from(document.scripts)) {
      if (script.src === sofficeUrl) script.remove();
    }

    const runtimeWindow = window as RuntimeWindow;
    try {
      delete runtimeWindow.Module;
    } catch {}
    try {
      delete runtimeWindow.FS;
    } catch {}
  }
}

let productionRuntime: BrowserLibreOfficeRuntime | null = null;

export function getBrowserLibreOfficeRuntime(): BrowserLibreOfficeRuntime {
  const mode =
    process.env.NODE_ENV === "development" ? "development" : "production";
  productionRuntime ??= new BrowserLibreOfficeRuntime(
    resolveOfficeAssetConfig(mode),
  );
  return productionRuntime;
}
