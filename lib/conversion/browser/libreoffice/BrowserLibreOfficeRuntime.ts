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

declare global {
  interface Window {
    __lumeoZetaHelperMain?: ZetaHelperMainConstructor;
  }
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
  if (window.__lumeoZetaHelperMain) {
    return Promise.resolve(window.__lumeoZetaHelperMain);
  }

  return new Promise((resolve, reject) => {
    const eventName = `lumeo:zeta-helper:${crypto.randomUUID()}`;
    const moduleUrl = URL.createObjectURL(
      new Blob(
        [
          `import { ZetaHelperMain } from ${JSON.stringify(helperUrl)};
globalThis.__lumeoZetaHelperMain = ZetaHelperMain;
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
      const constructor = window.__lumeoZetaHelperMain;
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
let model;

helper.thrPort.onmessage = (event) => {
  const message = event.data;
  if (message.cmd !== "convert") return;

  try {
    if (
      model !== undefined &&
      model.queryInterface(zetajs.type.interface(css.util.XCloseable))
    ) {
      model.close(false);
    }

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
  }
};

helper.thrPort.postMessage({ cmd: "ready" });
`;
  return URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
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

  try {
    const reader = source.stream().getReader();
    try {
      while (true) {
        if (signal.aborted) {
          throw signal.reason ?? new DOMException("Conversion cancelled", "AbortError");
        }

        const { done, value } = await reader.read();
        if (done) break;
        if (!value?.byteLength) continue;

        for (let offset = 0; offset < value.byteLength; offset += IO_CHUNK_BYTES) {
          const part = value.subarray(offset, Math.min(value.byteLength, offset + IO_CHUNK_BYTES));
          fs.write(stream, part, 0, part.byteLength, position);
          position += part.byteLength;
          onProgress?.(position, source.size);
        }
      }
    } finally {
      reader.releaseLock();
    }
  } finally {
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
};

export class BrowserLibreOfficeRuntime {
  private helper: ZetaHelperMainInstance | null = null;
  private officeThreadUrl: string | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly assets: OfficeAssetConfig) {}

  async start(): Promise<void> {
    if (this.helper) return;

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
    await preflightOfficeAssetOrigin(this.assets);

    const ZetaHelperMain = await loadZetaHelperConstructor(this.assets.helperUrl);
    this.officeThreadUrl = createOfficeThreadModule(this.assets.helperUrl);

    const helper = new ZetaHelperMain(this.officeThreadUrl, {
      threadJsType: "module",
      wasmPkg: `url:${this.assets.officeBaseUrl}`,
      blockPageScroll: false,
    });

    await withTimeout(
      new Promise<void>((resolve) => {
        helper.start(() => {
          helper.thrPort.onmessage = (event: MessageEvent<OfficeThreadMessage>) => {
            if (event.data.cmd === "ready") resolve();
          };
        });
      }),
      READY_TIMEOUT_MS,
      "The local Office engine did not finish loading.",
    );

    this.helper = helper;
  }

  convertDocumentToPdf(
    file: File,
    options: BrowserOfficeConvertOptions,
  ): Promise<Blob> {
    const operation = this.queue.then(() =>
      this.convertDocumentToPdfExclusive(file, options),
    );
    this.queue = operation.catch(() => undefined);
    return operation;
  }

  private async convertDocumentToPdfExclusive(
    file: File,
    options: BrowserOfficeConvertOptions,
  ): Promise<Blob> {
    await this.start();
    const helper = this.helper;
    if (!helper) throw new Error("The local Office engine is unavailable.");

    try {
      helper.FS.mkdir("/tmp/lumeo");
    } catch {}

    const requestId = crypto.randomUUID();
    const from = `/tmp/lumeo/input-${requestId}${safeExtension(file.name)}`;
    const to = `/tmp/lumeo/output-${requestId}.pdf`;

    await writeBlobToFs(
      helper.FS,
      from,
      file,
      options.signal,
      options.onInputProgress,
    );

    try {
      await withTimeout(
        new Promise<void>((resolve, reject) => {
          const handle = (event: MessageEvent<OfficeThreadMessage>) => {
            const message = event.data;
            if (
              (message.cmd !== "converted" &&
                message.cmd !== "convert-error") ||
              message.requestId !== requestId
            ) {
              return;
            }

            helper.thrPort.removeEventListener("message", handle);
            if (message.cmd === "convert-error") {
              reject(new Error(message.message));
            } else {
              resolve();
            }
          };

          helper.thrPort.addEventListener("message", handle);
          helper.thrPort.postMessage({
            cmd: "convert",
            requestId,
            from,
            to,
          });
        }),
        CONVERSION_TIMEOUT_MS,
        "Local Word to PDF conversion exceeded the safety watchdog.",
      );

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
}

let productionRuntime: BrowserLibreOfficeRuntime | null = null;

export function getBrowserLibreOfficeRuntime(): BrowserLibreOfficeRuntime {
  productionRuntime ??= new BrowserLibreOfficeRuntime(
    resolveOfficeAssetConfig("production"),
  );
  return productionRuntime;
}
