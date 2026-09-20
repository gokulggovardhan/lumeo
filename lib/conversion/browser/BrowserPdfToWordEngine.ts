import {
  BrowserConversionWorkspace,
  estimateLocalConversionStorage,
  hasLocalWorkspaceCapacity,
} from "@/lib/conversion/browser/workspace";
import {
  detectBrowserConversionCapabilities,
  selectConversionProcessingMode,
} from "@/lib/conversion/browser/capabilities";
import {
  buildReconstructedDocx,
} from "@/lib/conversion/browser/pdfToWord/docx";
import {
  ocrLinesToReconstructed,
  reconstructTextLines,
} from "@/lib/conversion/browser/pdfToWord/layout";
import type {
  PdfToWordOcrAdapter,
  ReconstructedPage,
} from "@/lib/conversion/browser/pdfToWord/types";
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

async function writeBlob(
  directory: FileSystemDirectoryHandle,
  name: string,
  blob: Blob,
): Promise<File> {
  const handle = await directory.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  try {
    await blob.stream().pipeTo(writable);
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

function countImageOperators(pdfjs: typeof import("pdfjs-dist"), fnArray: number[]): number {
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

async function renderPageBackground(
  page: PdfPageLike,
  pageNumber: number,
): Promise<Blob> {
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
    await renderPageWithTimeout(task, pageNumber);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
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
    if (sizeError) throw new Error(sizeError);

    const capabilities = await detectBrowserConversionCapabilities();
    const mode = selectConversionProcessingMode({
      fileSizeBytes: input.file.size,
    });

    options.onProgress?.({
      phase: "preparing",
      message:
        mode === "normal"
          ? "Analyzing PDF locally..."
          : "Preparing large PDF workspace...",
    });

    let workspace: BrowserConversionWorkspace | null = null;
    let document: PdfDocumentLike | null = null;
    let sourceUrl = "";

    try {
      let sourceFile = input.file;
      const storageEstimate = capabilities.opfs
        ? await estimateLocalConversionStorage()
        : null;
      const workspaceBytes = input.file.size * 2.5 + 96 * 1024 * 1024;
      const canUseWorkspace =
        capabilities.opfs &&
        (!storageEstimate ||
          hasLocalWorkspaceCapacity(storageEstimate, workspaceBytes));

      if (canUseWorkspace) {
        workspace = await BrowserConversionWorkspace.create("pdf-to-word");
        await workspace.markRunning();
        await workspace.appendLog(
          `Starting PDF to Word reconstruction in ${mode} mode (${input.file.size} bytes).`,
        );
        const handle = await workspace.stageInput(input.file);
        sourceFile = await handle.getFile();
      }

      sourceUrl = URL.createObjectURL(sourceFile);
      const pdfjs = await loadPdfJsModule();
      document = (await pdfjs.getDocument({
        url: sourceUrl,
        useWorkerFetch: false,
      }).promise) as unknown as PdfDocumentLike;

      const pageCountError = checkPdfPageCount(document.numPages);
      if (pageCountError) throw new Error(pageCountError);

      const pages: ReconstructedPage[] = [];

      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        if (signal.aborted) {
          throw signal.reason ?? new DOMException("Conversion cancelled", "AbortError");
        }

        options.onProgress?.({
          phase: "converting",
          message: `Reconstructing page ${pageNumber} of ${document.numPages}...`,
        });

        const page = await document.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 1, rotation: page.rotate });

        const [textContent, operatorList] = await Promise.all([
          withPageTimeout(
            page.getTextContent(),
            pageNumber,
            PAGE_OPERATION_TIMEOUT_MS,
            "extract text",
          ),
          withPageTimeout(
            page.getOperatorList(),
            pageNumber,
            PAGE_OPERATION_TIMEOUT_MS,
            "inspect page graphics",
          ),
        ]);

        let lines = reconstructTextLines(
          textContent.items as never,
          viewport.transform,
          viewport.width,
          viewport.height,
        );

        const imageCount = countImageOperators(pdfjs, operatorList.fnArray);
        const shouldRasterize =
          lines.length === 0 ||
          imageCount >= 2 ||
          (imageCount >= 1 && lines.length < 6);

        let backgroundImage: Blob | File | null = null;
        if (shouldRasterize) {
          const rendered = await renderPageBackground(page, pageNumber);

          if (lines.length === 0 && this.ocrAdapter) {
            const ocrLines = await this.ocrAdapter.recognize(
              rendered,
              pageNumber,
              signal,
            );
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
            `Page ${pageNumber}: ${lines.length} editable lines, ${imageCount} image operators, raster=${Boolean(backgroundImage)}.`,
          );
        }
      }

      options.onProgress?.({
        phase: "finalizing",
        message: "Building editable Word document...",
      });

      const blob = await buildReconstructedDocx(pages);
      const fileName = `${sanitizeFileStem(input.file.name, "converted")}.docx`;

      if (workspace) {
        await workspace.writeOutput(fileName, blob);
        await workspace.appendLog(
          `DOCX completed (${blob.size} bytes, ${pages.length} pages).`,
        );
        await workspace.dispose("completed");
        workspace = null;
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
      const normalized =
        error instanceof Error &&
        (error.name === "PasswordException" || /password/i.test(error.message))
          ? new Error("This PDF is password-protected. Unlock it before converting to Word.")
          : error;

      if (workspace) {
        await workspace.appendLog(
          `Conversion failed: ${normalized instanceof Error ? normalized.message : "unknown error"}`,
        ).catch(() => {});
        await workspace.dispose(signal.aborted ? "cancelled" : "failed").catch(() => {});
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
