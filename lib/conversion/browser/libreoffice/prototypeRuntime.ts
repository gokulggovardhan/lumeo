const DEV_ZETA_HELPER_URL =
  "https://cdn.jsdelivr.net/npm/zetajs@1.2.0/source/zetaHelper.js";
const DEV_ZETAOFFICE_BASE_URL =
  "https://cdn.zetaoffice.net/zetaoffice_latest/";
const PROTOTYPE_MAX_FILE_BYTES = 10 * 1024 * 1024;
const READY_TIMEOUT_MS = 120_000;
const CONVERSION_TIMEOUT_MS = 120_000;

type ZetaHelperMainInstance = {
  FS: {
    writeFile(path: string, data: Uint8Array): void;
    readFile(path: string): Uint8Array;
    unlink(path: string): void;
  };
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

type PrototypeWorkerMessage =
  | { cmd: "ready" }
  | { cmd: "converted"; requestId: string; from: string; to: string }
  | { cmd: "convert-error"; requestId: string; message: string };

type PrototypeResult = {
  blob: Blob;
  fileName: string;
};

declare global {
  interface Window {
    __lumeoZetaHelperMain?: ZetaHelperMainConstructor;
  }
}

function assertDevelopmentHarness(): void {
  if (process.env.NODE_ENV !== "development") {
    throw new Error("The LibreOffice prototype runtime is disabled outside development.");
  }
}

function safeStem(fileName: string): string {
  const withoutExtension = fileName.replace(/\.[^.]+$/, "");
  return (
    withoutExtension
      .replace(/[^a-z0-9._ -]+/gi, "-")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120) || "converted"
  );
}

function safeInputExtension(fileName: string): string {
  const match = /\.(docx?|odt)$/i.exec(fileName);
  if (!match) throw new Error("Prototype accepts DOC, DOCX, or ODT files only.");
  return `.${match[1].toLowerCase()}`;
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
  if (message.cmd !== "convert") {
    throw new Error("Unknown prototype command: " + message.cmd);
  }

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
    model.storeToURL(
      "file://" + message.to,
      [overwrite, pdfExport],
    );
    zetajs.mainPort.postMessage({
      cmd: "converted",
      requestId: message.requestId,
      from: message.from,
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

function loadZetaHelperConstructor(
  helperUrl = DEV_ZETA_HELPER_URL,
): Promise<ZetaHelperMainConstructor> {
  if (window.__lumeoZetaHelperMain) {
    return Promise.resolve(window.__lumeoZetaHelperMain);
  }

  return new Promise((resolve, reject) => {
    const eventName = `lumeo:zeta-helper:${crypto.randomUUID()}`;
    const blobUrl = URL.createObjectURL(
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
    script.src = blobUrl;

    const cleanup = () => {
      script.remove();
      URL.revokeObjectURL(blobUrl);
      window.removeEventListener(eventName, handleReady);
    };
    const handleReady = () => {
      const ctor = window.__lumeoZetaHelperMain;
      cleanup();
      if (ctor) resolve(ctor);
      else reject(new Error("ZetaJS helper loaded without its constructor."));
    };

    window.addEventListener(eventName, handleReady, { once: true });
    script.onerror = () => {
      cleanup();
      reject(new Error("Could not load the pinned ZetaJS 1.2.0 helper."));
    };
    document.head.appendChild(script);
  });
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => {
        window.clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

class LibreOfficePrototypeRuntime {
  private helper: ZetaHelperMainInstance | null = null;
  private officeThreadUrl: string | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  async start(): Promise<void> {
    assertDevelopmentHarness();
    if (this.helper) return;

    if (!crossOriginIsolated || typeof SharedArrayBuffer === "undefined") {
      throw new Error(
        "This lab requires cross-origin isolation and SharedArrayBuffer.",
      );
    }

    const ZetaHelperMain = await loadZetaHelperConstructor();
    const officeThreadUrl = createOfficeThreadModule(DEV_ZETA_HELPER_URL);
    this.officeThreadUrl = officeThreadUrl;

    const helper = new ZetaHelperMain(officeThreadUrl, {
      threadJsType: "module",
      wasmPkg: `url:${DEV_ZETAOFFICE_BASE_URL}`,
      blockPageScroll: false,
    });

    await withTimeout(
      new Promise<void>((resolve, reject) => {
        helper.start(() => {
          helper.thrPort.onmessage = (
            event: MessageEvent<PrototypeWorkerMessage>,
          ) => {
            if (event.data.cmd === "ready") {
              resolve();
            }
          };
        });

        window.addEventListener(
          "error",
          (event) => {
            if (String(event.message).toLowerCase().includes("soffice")) {
              reject(new Error("ZetaOffice failed to initialize."));
            }
          },
          { once: true },
        );
      }),
      READY_TIMEOUT_MS,
      "ZetaOffice did not become ready before the prototype watchdog expired.",
    );

    this.helper = helper;
  }

  convert(file: File): Promise<PrototypeResult> {
    const operation = this.queue.then(() => this.convertExclusive(file));
    this.queue = operation.catch(() => undefined);
    return operation;
  }

  private async convertExclusive(file: File): Promise<PrototypeResult> {
    await this.start();
    const helper = this.helper;
    if (!helper) throw new Error("LibreOffice prototype runtime is unavailable.");

    if (file.size > PROTOTYPE_MAX_FILE_BYTES) {
      throw new Error(
        "Prototype samples are limited to 10 MB. Large-file streaming is implemented separately.",
      );
    }

    const extension = safeInputExtension(file.name);
    const requestId = crypto.randomUUID();
    const from = `/tmp/lumeo-input-${requestId}${extension}`;
    const to = `/tmp/lumeo-output-${requestId}.pdf`;

    // This is intentionally limited to the development prototype. The
    // production engine must not use this whole-file MEMFS copy for large
    // documents.
    const bytes = new Uint8Array(await file.arrayBuffer());
    helper.FS.writeFile(from, bytes);

    try {
      const result = await withTimeout(
        new Promise<PrototypeResult>((resolve, reject) => {
          const handleMessage = (
            event: MessageEvent<PrototypeWorkerMessage>,
          ) => {
            const message = event.data;
            if (
              (message.cmd !== "converted" &&
                message.cmd !== "convert-error") ||
              message.requestId !== requestId
            ) {
              return;
            }

            helper.thrPort.removeEventListener("message", handleMessage);
            if (message.cmd === "convert-error") {
              reject(new Error(message.message));
              return;
            }

            const pdfBytes = helper.FS.readFile(message.to);
            resolve({
              blob: new Blob([pdfBytes.slice()], { type: "application/pdf" }),
              fileName: `${safeStem(file.name)}.pdf`,
            });
          };

          helper.thrPort.addEventListener("message", handleMessage);
          helper.thrPort.postMessage({
            cmd: "convert",
            requestId,
            from,
            to,
          });
        }),
        CONVERSION_TIMEOUT_MS,
        "LibreOffice conversion exceeded the prototype watchdog.",
      );

      return result;
    } finally {
      try {
        helper.FS.unlink(from);
      } catch {}
      try {
        helper.FS.unlink(to);
      } catch {}
    }
  }

  dispose(): void {
    if (this.officeThreadUrl) {
      URL.revokeObjectURL(this.officeThreadUrl);
      this.officeThreadUrl = null;
    }
  }
}

let singleton: LibreOfficePrototypeRuntime | null = null;

export function getLibreOfficePrototypeRuntime(): LibreOfficePrototypeRuntime {
  assertDevelopmentHarness();
  singleton ??= new LibreOfficePrototypeRuntime();
  return singleton;
}

export const LIBREOFFICE_PROTOTYPE_MAX_FILE_BYTES = PROTOTYPE_MAX_FILE_BYTES;
