import {
  BrowserConversionWorkspace,
  estimateLocalConversionStorage,
  hasLocalWorkspaceCapacity,
} from "@/lib/conversion/browser/workspace";
import {
  canRunThreadedBrowserOffice,
  detectBrowserConversionCapabilities,
  selectConversionProcessingMode,
} from "@/lib/conversion/browser/capabilities";
import { getBrowserLibreOfficeRuntime } from "@/lib/conversion/browser/libreoffice/BrowserLibreOfficeRuntime";
import {
  conversionUserError,
  normalizeConversionError,
} from "@/lib/conversion/errors";
import { validateWordConversionFile } from "@/lib/conversion/fileValidation";
import { validateGeneratedPdf } from "@/lib/conversion/outputValidation";
import { checkBrowserConversionFileSize } from "@/lib/conversion/limits";
import { sanitizeFileStem } from "@/lib/pdf/sanitizeFileName";
import type {
  ConversionEngine,
  ConversionInput,
  ConversionOptions,
  ConversionResult,
} from "@/lib/conversion/types";

const PDF_MIME = "application/pdf";

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw signal.reason ?? new DOMException("Conversion cancelled", "AbortError");
  }
}

export class BrowserWordToPdfEngine implements ConversionEngine {
  readonly id = "browser-libreoffice-word-to-pdf";
  readonly kind = "word-to-pdf" as const;
  readonly processingLocation = "browser" as const;

  constructor(
    private readonly injectedRuntime: ReturnType<
      typeof getBrowserLibreOfficeRuntime
    > | null = null,
  ) {}

  private getRuntime() {
    return this.injectedRuntime ?? getBrowserLibreOfficeRuntime();
  }

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

    const validation = await validateWordConversionFile(input.file);
    if (!validation.ok) {
      throw conversionUserError(validation.code, {
        message: validation.message,
      });
    }

    const capabilities = await detectBrowserConversionCapabilities();
    if (!canRunThreadedBrowserOffice(capabilities)) {
      throw conversionUserError("browser-unsupported", {
        recoverable: false,
        technicalMessage:
          "Threaded browser Office conversion requires WebAssembly, workers, SharedArrayBuffer, cross-origin isolation, shared WASM memory, and worker OffscreenCanvas WebGL.",
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
    let runtime: ReturnType<typeof getBrowserLibreOfficeRuntime> | null = null;
    let completed = false;

    try {
      let conversionFile = input.file;
      const storageEstimate = capabilities.opfs
        ? await estimateLocalConversionStorage(signal)
        : null;
      const workspaceBytes = input.file.size * 2.25 + 64 * 1024 * 1024;
      const canUseWorkspace =
        mode !== "normal" &&
        capabilities.opfs &&
        (!storageEstimate ||
          hasLocalWorkspaceCapacity(storageEstimate, workspaceBytes));

      if (canUseWorkspace) {
        try {
          workspace = await BrowserConversionWorkspace.create(
            "word-to-pdf",
            signal,
          );
          await workspace.markRunning();
          await workspace.appendLog(
            `Starting Word to PDF conversion in ${mode} mode (${input.file.size} bytes).`,
          );
          const inputHandle = await workspace.stageInput(input.file, signal);
          conversionFile = await inputHandle.getFile();
        } catch (workspaceError) {
          if (signal.aborted) throw workspaceError;
          await workspace?.dispose("failed").catch(() => {});
          workspace = null;
          conversionFile = input.file;
        }
      }

      options.onProgress?.({
        phase: "loading-engine",
        message: "Loading conversion engine",
      });

      runtime = this.getRuntime();
      try {
        await runtime.start(signal);
      } catch (error) {
        throw normalizeConversionError(error, "runtime");
      }

      options.onProgress?.({
        phase: "converting",
        message: "Processing document",
      });

      let blob: Blob;
      try {
        blob = await runtime.convertDocumentToPdf(conversionFile, {
          signal,
          onInputReady: () => {
            options.onProgress?.({
              phase: "generating",
              message: "Generating PDF",
            });
          },
        });
      } catch (error) {
        throw normalizeConversionError(error, "conversion");
      }

      options.onProgress?.({
        phase: "validating",
        message: "Validating PDF",
      });

      try {
        await validateGeneratedPdf(blob);
      } catch (error) {
        throw normalizeConversionError(error, "output");
      }

      throwIfAborted(signal);
      options.onProgress?.({
        phase: "finalizing",
        message: "Finalizing file",
      });

      const fileName = `${sanitizeFileStem(input.file.name, "converted")}.pdf`;

      try {
        if (workspace) {
          await workspace.writeOutput(fileName, blob, signal);
          await workspace.appendLog(`Conversion completed (${blob.size} bytes).`);
          await workspace.dispose("completed");
          workspace = null;
        }
      } catch (error) {
        throw normalizeConversionError(error, "output");
      }

      const result: ConversionResult = {
        blob,
        fileName,
        mimeType: PDF_MIME,
        metadata: {
          processingLocation: this.processingLocation,
          engineId: this.id,
        },
      };
      completed = true;
      return result;
    } catch (error) {
      const normalized = normalizeConversionError(error);
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
      // Normal conversions can reuse the already-loaded runtime for a fast
      // second conversion. Large/extreme jobs release WASM threads and memory
      // immediately, and any failed/cancelled job resets the runtime so retry
      // starts from a clean process.
      if (runtime && (mode !== "normal" || !completed)) {
        runtime.destroy();
      }
    }
  }
}
