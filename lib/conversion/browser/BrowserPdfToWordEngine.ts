import { PDFDocument as PdfLibDocument } from "pdf-lib";
import { PdfFontRegistry } from "@/lib/pdf/edit/fontRegistry";
import { transformPoint2x3 } from "@/lib/pdf/edit/textRuns";
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
import { enrichTextAppearanceFromCanvas } from "@/lib/conversion/browser/pdfToWord/appearance";
import { classifyPageReconstruction } from "@/lib/conversion/browser/pdfToWord/classifier";
import {
  reconcileOperatorRunsWithVisibleText,
} from "@/lib/conversion/browser/pdfToWord/coverage";
import { reconstructOperatorTextRuns } from "@/lib/conversion/browser/pdfToWord/operatorRuns";
import {
  ocrLinesToReconstructed,
  reconstructTextLines,
  type PdfTextStyle,
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
import { validateGeneratedDocx } from "@/lib/conversion/outputValidation";
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

type PdfLinkAnnotation = {
  subtype?: string;
  url?: string;
  unsafeUrl?: string;
  rect?: number[];
};

type PdfPageLike = {
  rotate: number;
  commonObjs?: {
    get(id: string): {
      name?: string;
      fallbackName?: string;
      bold?: boolean;
      italic?: boolean;
    } | undefined;
  };
  getViewport(options: { scale: number; rotation?: number }): {
    width: number;
    height: number;
    transform: number[];
  };
  getTextContent(): Promise<{
    items: unknown[];
    styles?: Record<string, PdfTextStyle>;
  }>;
  getOperatorList(): Promise<{ fnArray: number[] }>;
  getAnnotations?(options?: { intent?: string }): Promise<PdfLinkAnnotation[]>;
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

function applyLinkAnnotations(
  lines: ReconstructedPage["lines"],
  annotations: PdfLinkAnnotation[],
  viewportTransform: number[],
): void {
  for (const annotation of annotations) {
    if (
      annotation.subtype !== "Link" ||
      !annotation.rect ||
      annotation.rect.length < 4
    ) {
      continue;
    }
    const url = annotation.url ?? annotation.unsafeUrl;
    if (!url) continue;

    const [x1, y1, x2, y2] = annotation.rect;
    const p1 = transformPoint2x3(viewportTransform, [1, 0, 0, 1, x1, y1]);
    const p2 = transformPoint2x3(viewportTransform, [1, 0, 0, 1, x2, y2]);
    const left = Math.min(p1[4], p2[4]);
    const top = Math.min(p1[5], p2[5]);
    const right = Math.max(p1[4], p2[4]);
    const bottom = Math.max(p1[5], p2[5]);

    for (const line of lines) {
      if (line.visualOnly) continue;
      const overlapLeft = Math.max(left, line.xPt);
      const overlapTop = Math.max(top, line.yPt);
      const overlapRight = Math.min(right, line.xPt + line.widthPt);
      const overlapBottom = Math.min(bottom, line.yPt + line.heightPt);
      const overlap =
        Math.max(0, overlapRight - overlapLeft) *
        Math.max(0, overlapBottom - overlapTop);
      const area = Math.max(1, line.widthPt * line.heightPt);
      if (overlap / area >= 0.3) {
        line.hyperlinkUrl = url;
      }
    }
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

function enrichTextStyles(
  page: PdfPageLike,
  items: unknown[],
  styles: Record<string, PdfTextStyle> | undefined,
): Record<string, PdfTextStyle> {
  const enriched: Record<string, PdfTextStyle> = { ...(styles ?? {}) };

  for (const item of items) {
    if (
      !item ||
      typeof item !== "object" ||
      !("fontName" in item) ||
      typeof (item as { fontName?: unknown }).fontName !== "string"
    ) {
      continue;
    }

    const fontName = (item as { fontName: string }).fontName;
    let font:
      | {
          name?: string;
          fallbackName?: string;
          bold?: boolean;
          italic?: boolean;
        }
      | undefined;
    try {
      font = page.commonObjs?.get(fontName);
    } catch {
      font = undefined;
    }

    enriched[fontName] = {
      ...enriched[fontName],
      fontName: font?.name ?? font?.fallbackName ?? enriched[fontName]?.fontName,
      bold: font?.bold ?? enriched[fontName]?.bold,
      italic: font?.italic ?? enriched[fontName]?.italic,
    };
  }

  return enriched;
}

function maskEditableTextFromBackground(
  context: CanvasRenderingContext2D,
  lines: ReconstructedPage["lines"],
  scaleX: number,
  scaleY: number,
): void {
  if (!lines.length) return;

  context.save();
  context.fillStyle = "#FFFFFF";

  for (const line of lines) {
    if (line.visualOnly) continue;

    // Keep the horizontal/top over-mask needed to remove anti-aliased source
    // glyph pixels, but use a much tighter bottom pad. PDF underline/rule
    // geometry frequently lives immediately below the glyph box; the old
    // symmetric white rectangle erased it along with the source text.
    const horizontalPaddingPt = Math.max(1.1, line.fontSizePt * 0.09);
    const topPaddingPt = Math.max(1.0, line.fontSizePt * 0.08);
    const bottomPaddingPt = Math.max(0.35, line.fontSizePt * 0.035);
    const x = Math.max(0, (line.xPt - horizontalPaddingPt) * scaleX);
    const y = Math.max(0, (line.yPt - topPaddingPt) * scaleY);
    const width = Math.max(
      1,
      (line.widthPt + horizontalPaddingPt * 2) * scaleX,
    );
    const height = Math.max(
      1,
      (line.heightPt + topPaddingPt + bottomPaddingPt) * scaleY,
    );
    context.fillRect(x, y, width, height);
  }

  context.restore();
}

async function renderPageBackground(
  page: PdfPageLike,
  pageNumber: number,
  signal: AbortSignal,
  editableLines: ReconstructedPage["lines"] = [],
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

    if (editableLines.length > 0) {
      const scaleX = viewport.width / pointViewport.width;
      const scaleY = viewport.height / pointViewport.height;
      enrichTextAppearanceFromCanvas(
        context,
        editableLines,
        scaleX,
        scaleY,
      );
      maskEditableTextFromBackground(
        context,
        editableLines,
        scaleX,
        scaleY,
      );
    }

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
    let sourceStructureDocument: PdfLibDocument | null = null;
    let sourceFontRegistry: PdfFontRegistry | null = null;
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

      // Page count is now known, so make the final memory decision here.
      // A physically small PDF can still be a 150-page document; loading a
      // second full pdf-lib object graph for it on mobile Safari would be an
      // unnecessary peak-memory spike.
      const reconstructionMode = selectConversionProcessingMode({
        fileSizeBytes: input.file.size,
        pageCount: document.numPages,
      });
      if (reconstructionMode === "normal") {
        try {
          const sourceBytes = await withAbort(sourceFile.arrayBuffer(), signal);
          sourceStructureDocument = await PdfLibDocument.load(sourceBytes, {
            updateMetadata: false,
          });
          sourceFontRegistry = new PdfFontRegistry(sourceStructureDocument);
        } catch (structureError) {
          if (signal.aborted) throw structureError;
          sourceStructureDocument = null;
          sourceFontRegistry = null;
        }
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

        const [textContent, operatorList, annotations] = await Promise.all([
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
          page.getAnnotations
            ? withAbort(
                withPageTimeout(
                  page.getAnnotations({ intent: "display" }),
                  pageNumber,
                  PAGE_OPERATION_TIMEOUT_MS,
                  "inspect page links",
                ),
                signal,
              )
            : Promise.resolve([] as PdfLinkAnnotation[]),
        ]);

        const textStyles = enrichTextStyles(
          page,
          textContent.items,
          textContent.styles,
        );
        const pdfJsLines = reconstructTextLines(
          textContent.items as never,
          viewport.transform,
          viewport.width,
          viewport.height,
          textStyles,
        );

        let lines = pdfJsLines;
        let operatorCoverageRatio = 0;

        if (sourceStructureDocument && sourceFontRegistry) {
          try {
            const sourceRuns = reconstructOperatorTextRuns({
              document: sourceStructureDocument,
              registry: sourceFontRegistry,
              pageIndex: pageNumber - 1,
              viewportTransform: viewport.transform,
            });
            const reconciled = reconcileOperatorRunsWithVisibleText(
              pdfJsLines,
              sourceRuns.lines,
            );
            operatorCoverageRatio =
              reconciled.assessment.characterCoverageRatio;
            // Use source operators wherever they are proven equivalent to
            // visible PDF.js text, and retain PDF.js only for unresolved
            // regions. This keeps the page lossless without discarding
            // fixed-layout precision because of one unusual encoded run.
            if (reconciled.assessment.explainedVisibleRuns > 0) {
              lines = reconciled.lines;
            }
          } catch {
            operatorCoverageRatio = 0;
            lines = pdfJsLines;
          }
        }

        const imageCount = countImageOperators(pdfjs, operatorList.fnArray);
        const vectorLayoutCount = countVectorLayoutOperators(
          pdfjs,
          operatorList.fnArray,
        );
        const shouldRasterize =
          lines.length === 0 ||
          lines.some((line) => line.visualOnly) ||
          imageCount >= 2 ||
          (imageCount >= 1 && lines.length < 6) ||
          vectorLayoutCount > 0;

        applyLinkAnnotations(
          lines,
          annotations,
          viewport.transform,
        );

        const classification = classifyPageReconstruction({
          lines,
          imageCount,
          vectorLayoutCount,
          pageWidthPt: viewport.width,
        });
        for (const region of classification.regions) {
          if (
            region.kind !== "fixed-layout-table" &&
            region.kind !== "semantic-table"
          ) {
            continue;
          }
          for (const index of region.lineIndices) {
            if (lines[index]) lines[index].regionKind = region.kind;
          }
        }
        lines.forEach((line) => {
          if (line.regionKind) return;
          if (line.yPt < viewport.height * 0.09) line.regionKind = "header";
          else if (line.yPt + line.heightPt > viewport.height * 0.91)
            line.regionKind = "footer";
          else
            line.regionKind =
              classification.mode === "semantic-text"
                ? "semantic-text"
                : "fixed-layout";
        });

        let backgroundImage: Blob | File | null = null;
        // When a native-text page only needs raster fallback for vector
        // geometry (rules, boxes, diagrams), remove the source glyph pixels
        // from that background and overlay independently positioned editable
        // text. Mixed/image-heavy pages retain the conservative opaque-frame
        // behavior because blindly painting white over an image can be worse
        // than preserving the original raster.
        const backgroundTextMasked =
          shouldRasterize && lines.length > 0 && imageCount === 0;
        if (shouldRasterize) {
          const rendered = await renderPageBackground(
            page,
            pageNumber,
            signal,
            backgroundTextMasked ? lines : [],
          );

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
          backgroundTextMasked,
          regions: classification.regions,
          reconstructionMode: classification.mode,
          operatorCoverageRatio,
        };
        pages.push(reconstructed);

        if (workspace) {
          await writeCheckpoint(workspace, reconstructed);
          await workspace.appendLog(
            `Page ${pageNumber}: ${lines.filter((line) => !line.visualOnly).length} editable lines, ${lines.filter((line) => line.visualOnly).length} visual-only lines, operatorCoverage=${operatorCoverageRatio.toFixed(3)}, mode=${classification.mode}, ${imageCount} image operators, ${vectorLayoutCount} vector layout operators, raster=${Boolean(backgroundImage)}.`,
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
        phase: "validating",
        message: "Validating Word document",
      });

      try {
        await validateGeneratedDocx(blob, {
          expectedPageCount: pages.length,
          minimumEditableTextRuns: pages.reduce(
            (count, page) =>
              count +
              page.lines.filter((line) => !line.visualOnly).length,
            0,
          ),
          expectedBackgroundImages: pages.filter(
            (page) => Boolean(page.backgroundImage),
          ).length,
        });
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
      // pdf-lib has no destroy lifecycle. Drop the read-only structure/font
      // graph explicitly after every job so mobile Safari can reclaim its
      // object graph before the next conversion instead of retaining it
      // through these function-local references.
      sourceFontRegistry = null;
      sourceStructureDocument = null;
    }
  }
}
