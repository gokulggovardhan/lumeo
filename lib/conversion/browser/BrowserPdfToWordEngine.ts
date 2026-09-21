import {
  BrowserConversionWorkspace,
  estimateLocalConversionStorage,
  hasLocalWorkspaceCapacity,
} from "@/lib/conversion/browser/workspace";
import {
  detectBrowserConversionCapabilities,
  selectConversionProcessingMode,
} from "@/lib/conversion/browser/capabilities";
import { buildReconstructedDocx } from "@/lib/conversion/browser/pdfToWord/docx";
import {
  ocrLinesToReconstructed,
  reconstructTextLines,
} from "@/lib/conversion/browser/pdfToWord/layout";
import type {
  PdfToWordOcrAdapter,
  ReconstructedPage,
} from "@/lib/conversion/browser/pdfToWord/types";
import {
  conversionUserError,
  normalizeConversionError,
} from "@/lib/conversion/errors";
import { validatePdfConversionFile } from "@/lib/conversion/fileValidation";
import { checkBrowserConversionFileSize } from "@/lib/conversion/limits";
import { sanitizeFileStem } from "@/lib/pdf/sanitizeFileName";
import { checkPdfPageCount } from "@/lib/pdf/uploadValidation";
import {
  clampRenderScaleToMaxDimension,
  clampRenderScaleToPixelBudget,
  loadPdfJsModule,
  renderPageWithTimeout,
  withPageTimeout,
} from "@/lib/pdf/pdfjs";
import type {
  ConversionEngine,
  ConversionInput,
  ConversionOptions,
  ConversionResult,
} from "@/lib/conversion/types";

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PAGE_OPERATION_TIMEOUT_MS = 25_000;
const BACKGROUND_RENDER_SCALE = 1.35;
const MAX_BACKGROUND_DIMENSION_PX = 3000;
const MAX_BACKGROUND_PIXELS = 8_000_000;
const JPEG_QUALITY = 0.84;

type PdfPageLike = {
  rotate: number;
  getViewport(options: { scale: number; rotation?: number }): {
    width: number;
    height: number;
    transform: number[];
  };
  getTextContent(): Promise<{
    items: unknown[];
  }>;
  getOperatorList(): Promise<{ fnArray: number[] }>;
  render(options: {
    canvas: HTMLCanvasElement;
    canvasContext: CanvasRenderingContext2D;
    viewport: unknown;
  }): { promise: Promise<void>; cancel(): void };
};

type PdfDocumentLike = {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfPageLike>;
  destroy?(): Promise<void> | void;
};

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("Conversion cancelled", "AbortError");
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw abortReason(signal);
}

async function withAbort<T>(
  promise: Promise<T>,
  signal: AbortSignal,
  onAbort?: () => void,
): Promise<T> {
  throwIfAborted(signal);

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (
      callback: (value: T | PromiseLike<T>) => void,
      value: T,
    ) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", handleAbort);
      callback(value);
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", handleAbort);
      reject(error);
    };
    const handleAbort = () => {
      try {
        onAbort?.();
      } catch {}
      fail(abortReason(signal));
    };

    signal.addEventListener("abort", handleAbort, { once: true });
    promise.then(
      (value) => finish(resolve, value),
      (error) => fail(error),
    );
  });
}

async function writeBlob(
  directory: FileSystemDirectoryHandle,
  name: string,
  blob: Blob,
  signal: AbortSignal,
): Promise<File> {
  throwIfAborted(signal);
  const handle = await directory.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  try {
    await blob.stream().pipeTo(writable, { signal });
  } catch (error) {
    await writable.abort().catch(() => {});
    throw error;
  }
  return handle.getFile();
}

async function writeCheckpoint(
  workspace: BrowserConversionWorkspace,
  page: ReconstructedPage,
): Promise<void> {
  const directory = workspace.getDirectory("checkpoints");
  const handle = await directory.getFileHandle(
    `page-${String(page.pageNumber).padStart(4, "0")}.json`,
    { create: true },
  );
  const writable = await handle.createWritable();
  try {
    await writable.write(
      JSON.stringify({
        pageNumber: page.pageNumber,
        widthPt: page.widthPt,
        heightPt: page.heightPt,
        lineCount: page.lines.length,
        hasBackgroundImage: Boolean(page.backgroundImage),
      }),
    );
    await writable.close();
  } catch (error) {
    await writable.abort().catch(() => {});
    throw error;
  }
}

function countImageOperators(
  pdfjs: typeof import("pdfjs-dist"),
  fnArray: number[],
): number {
  const imageOps = new Set<number>(
    [
      pdfjs.OPS.paintImageXObject,
      pdfjs.OPS.paintInlineImageXObject,
      pdfjs.OPS.paintImageMaskXObject,
      pdfjs.OPS.paintSolidColorImageMask,
    ].filter((value): value is number => typeof value === "number"),
  );

  return fnArray.reduce(
    (count, operation) => count + (imageOps.has(operation) ? 1 : 0),
    0,
  );
}

function countVectorLayoutOperators(
  pdfjs: typeof import("pdfjs-dist"),
  fnArray: number[],
): number {
  const layoutOps = new Set<number>(
    [
      pdfjs.OPS.constructPath,
      pdfjs.OPS.stroke,
      pdfjs.OPS.closeStroke,
      pdfjs.OPS.fill,
      pdfjs.OPS.eoFill,
      pdfjs.OPS.fillStroke,
      pdfjs.OPS.eoFillStroke,
    ].filter((value): value is number => typeof value === "number"),
  );

  return fnArray.reduce(
    (count, operation) => count + (layoutOps.has(operation) ? 1 : 0),
    0,
  );
}

async function renderPageBackground(
  page: PdfPageLike,
  pageNumber: number,
  signal: AbortSignal,
): Promise<Blob> {
  throwIfAborted(signal);

  const pointViewport = page.getViewport({ scale: 1 });
  let scale = clampRenderScaleToMaxDimension(
    BACKGROUND_RENDER_SCALE,
    pointViewport.width,
    pointViewport.height,
    MAX_BACKGROUND_DIMENSION_PX,
  );
  scale = clampRenderScaleToPixelBudget(
    scale,
    pointViewport.width,
    pointViewport.height,
    MAX_BACKGROUND_PIXELS,
  );

  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error(`Page ${pageNumber} could not create a canvas.`);

  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  context.fillStyle = "#FFFFFF";
  context.fillRect(0, 0, canvas.width, canvas.height);

  try {
    const task = page.render({
      canvas,
      canvasContext: context,
      viewport,
    });
    await withAbort(
      renderPageWithTimeout(task, pageNumber),
      signal,
      () => task.cancel(),
    );
    throwIfAborted(signal);

    const blob = await withAbort(
      new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
      ),
      signal,
    );
    if (!blob) throw new Error(`Page ${pageNumber} could not be rasterized.`);
    return blob;
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

export class BrowserPdfToWordEngine implements ConversionEngine {
  readonly id = "browser-pdfjs-pdf-to-word";
  readonly kind = "pdf-to-word" as const;
  readonly processingLocation = "browser" as const;

  constructor(private readonly ocrAdapter: PdfToWordOcrAdapter | null = null) {}

  async convert(
    input: ConversionInput,
    options: ConversionOptions,
    signal: AbortSignal,
  ): Promise<ConversionResult> {
    const sizeError = checkBrowserConversionFileSize(input.file);
    if (sizeError) {
      throw conversionUserError("file-too-large", {
        technicalMessage: sizeError,
      });
    }

    const validation = await validatePdfConversionFile(input.file);
    if (!validation.ok) {
      throw conversionUserError(validation.code, {
        message: validation.message,
      });
    }

    const capabilities = await detectBrowserConversionCapabilities();
    if (!capabilities.webWorkers) {
      throw conversionUserError("browser-unsupported", {
        recoverable: false,
        technicalMessage: "PDF reconstruction requires Web Worker support.",
      });
    }

    const mode = selectConversionProcessingMode({
      fileSizeBytes: input.file.size,
    });

    options.onProgress?.({
      phase: "preparing",
      message:
        mode === "normal"
          ? "Preparing document"
          : "Preparing large document workspace",
    });

    let workspace: BrowserConversionWorkspace | null = null;
    let document: PdfDocumentLike | null = null;
    let sourceUrl = "";

    try {
      let sourceFile = input.file;
      const storageEstimate = capabilities.opfs
        ? await estimateLocalConversionStorage(signal)
        : null;
      const workspaceBytes = input.file.size * 2.5 + 96 * 1024 * 1024;
      const canUseWorkspace =
        mode !== "normal" &&
        capabilities.opfs &&
        (!storageEstimate ||
          hasLocalWorkspaceCapacity(storageEstimate, workspaceBytes));

      if (canUseWorkspace) {
        try {
          workspace = await BrowserConversionWorkspace.create(
            "pdf-to-word",
            signal,
          );
          await workspace.markRunning();
          await workspace.appendLog(
            `Starting PDF to Word reconstruction in ${mode} mode (${input.file.size} bytes).`,
          );
          const handle = await workspace.stageInput(input.file, signal);
          sourceFile = await handle.getFile();
        } catch (workspaceError) {
          if (signal.aborted) throw workspaceError;
          await workspace?.dispose("failed").catch(() => {});
          workspace = null;
          sourceFile = input.file;
        }
      }

      throwIfAborted(signal);
      options.onProgress?.({
        phase: "loading-engine",
        message: "Loading PDF engine",
      });

      sourceUrl = URL.createObjectURL(sourceFile);
      const pdfjs = await withAbort(loadPdfJsModule(), signal);

      try {
        document = (await withAbort(
          pdfjs.getDocument({
            url: sourceUrl,
            useWorkerFetch: false,
          }).promise,
          signal,
        )) as unknown as PdfDocumentLike;
      } catch (error) {
        throw normalizeConversionError(error, "input");
      }

      const pageCountError = checkPdfPageCount(document.numPages);
      if (pageCountError) {
        throw conversionUserError("conversion-failed", {
          message: pageCountError,
          technicalMessage: pageCountError,
        });
      }

      const pages: ReconstructedPage[] = [];

      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        throwIfAborted(signal);

        options.onProgress?.({
          phase: "converting",
          message: `Processing page ${pageNumber} of ${document.numPages}`,
        });

        const page = await withAbort(document.getPage(pageNumber), signal);
        const viewport = page.getViewport({ scale: 1, rotation: page.rotate });

        const [textContent, operatorList] = await Promise.all([
          withAbort(
            withPageTimeout(
              page.getTextContent(),
              pageNumber,
              PAGE_OPERATION_TIMEOUT_MS,
              "extract text",
            ),
            signal,
          ),
          withAbort(
            withPageTimeout(
              page.getOperatorList(),
              pageNumber,
              PAGE_OPERATION_TIMEOUT_MS,
              "inspect page graphics",
            ),
            signal,
          ),
        ]);

        let lines = reconstructTextLines(
          textContent.items as never,
          viewport.transform,
          viewport.width,
          viewport.height,
        );

        const imageCount = countImageOperators(pdfjs, operatorList.fnArray);
        const vectorLayoutCount = countVectorLayoutOperators(
          pdfjs,
          operatorList.fnArray,
        );
        const shouldRasterize =
          lines.length === 0 ||
          imageCount >= 2 ||
          (imageCount >= 1 && lines.length < 6) ||
          vectorLayoutCount >= 6;

        let backgroundImage: Blob | File | null = null;
        if (shouldRasterize) {
          const rendered = await renderPageBackground(page, pageNumber, signal);

          if (lines.length === 0 && this.ocrAdapter) {
            const ocrLines = await this.ocrAdapter.recognize(
              rendered,
              pageNumber,
              signal,
            );
            throwIfAborted(signal);
            lines = ocrLinesToReconstructed(
              ocrLines,
              viewport.width,
              viewport.height,
            );
          }

          if (workspace) {
            backgroundImage = await writeBlob(
              workspace.getDirectory("images"),
              `page-${String(pageNumber).padStart(4, "0")}.jpg`,
              rendered,
              signal,
            );
          } else {
            backgroundImage = rendered;
          }
        }

        const reconstructed: ReconstructedPage = {
          pageNumber,
          widthPt: viewport.width,
          heightPt: viewport.height,
          lines,
          backgroundImage,
          backgroundExtension: backgroundImage ? "jpg" : undefined,
        };
        pages.push(reconstructed);

        if (workspace) {
          await writeCheckpoint(workspace, reconstructed);
          await workspace.appendLog(
            `Page ${pageNumber}: ${lines.length} editable lines, ${imageCount} image operators, ${vectorLayoutCount} vector layout operators, raster=${Boolean(backgroundImage)}.`,
          );
        }
      }

      throwIfAborted(signal);
      options.onProgress?.({
        phase: "generating",
        message: "Generating Word document",
      });

      let blob: Blob;
      try {
        blob = await buildReconstructedDocx(pages);
      } catch (error) {
        throw normalizeConversionError(error, "output");
      }

      throwIfAborted(signal);
      options.onProgress?.({
        phase: "finalizing",
        message: "Finalizing file",
      });

      const fileName = `${sanitizeFileStem(input.file.name, "converted")}.docx`;

      try {
        if (workspace) {
          await workspace.writeOutput(fileName, blob, signal);
          await workspace.appendLog(
            `DOCX completed (${blob.size} bytes, ${pages.length} pages).`,
          );
          await workspace.dispose("completed");
          workspace = null;
        }
      } catch (error) {
        throw normalizeConversionError(error, "output");
      }

      return {
        blob,
        fileName,
        mimeType: DOCX_MIME,
        metadata: {
          processingLocation: this.processingLocation,
          engineId: this.id,
        },
      };
    } catch (error) {
      const normalized = normalizeConversionError(error, "conversion");

      if (workspace) {
        await workspace
          .appendLog(
            `Conversion failed [${normalized.code}]: ${normalized.technicalMessage ?? normalized.message}`,
          )
          .catch(() => {});
        await workspace
          .dispose(signal.aborted ? "cancelled" : "failed")
          .catch(() => {});
      }
      throw normalized;
    } finally {
      if (sourceUrl) URL.revokeObjectURL(sourceUrl);
      if (document) {
        await document.destroy?.();
      }
    }
  }
}
