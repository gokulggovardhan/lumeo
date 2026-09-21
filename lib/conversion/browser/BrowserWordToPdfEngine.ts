import { BrowserConversionWorkspace } from "@/lib/conversion/browser/workspace";
import {
  detectBrowserConversionCapabilities,
  selectConversionProcessingMode,
} from "@/lib/conversion/browser/capabilities";
import { getBrowserLibreOfficeRuntime } from "@/lib/conversion/browser/libreoffice/BrowserLibreOfficeRuntime";
import { checkBrowserConversionFileSize } from "@/lib/conversion/limits";
import { sanitizeFileStem } from "@/lib/pdf/sanitizeFileName";
import type {
  ConversionEngine,
  ConversionInput,
  ConversionOptions,
  ConversionResult,
} from "@/lib/conversion/types";

const PDF_MIME = "application/pdf";

export class BrowserWordToPdfEngine implements ConversionEngine {
  readonly id = "browser-libreoffice-word-to-pdf";
  readonly kind = "word-to-pdf" as const;
  readonly processingLocation = "browser" as const;

  async convert(
    input: ConversionInput,
    options: ConversionOptions,
    signal: AbortSignal,
  ): Promise<ConversionResult> {
    const sizeError = checkBrowserConversionFileSize(input.file);
    if (sizeError) throw new Error(sizeError);

    const capabilities = await detectBrowserConversionCapabilities();
    if (
      !capabilities.webAssembly ||
      !capabilities.webWorkers ||
      !capabilities.sharedArrayBuffer ||
      !capabilities.crossOriginIsolated ||
      !capabilities.wasmThreadsReady
    ) {
      throw new Error(
        "This browser cannot run local Word to PDF conversion. Update the browser and try again on a device that supports isolated WebAssembly workers.",
      );
    }

    const mode = selectConversionProcessingMode({
      fileSizeBytes: input.file.size,
    });
    options.onProgress?.({
      phase: "preparing",
      message:
        mode === "normal"
          ? "Preparing local conversion..."
          : "Preparing large document workspace...",
    });

    let workspace: BrowserConversionWorkspace | null = null;
    try {
      let conversionFile = input.file;

      if (capabilities.opfs) {
        workspace = await BrowserConversionWorkspace.create("word-to-pdf");
        await workspace.markRunning();
        await workspace.appendLog(
          `Starting Word to PDF conversion in ${mode} mode (${input.file.size} bytes).`,
        );
        const inputHandle = await workspace.stageInput(input.file);
        conversionFile = await inputHandle.getFile();
      }

      options.onProgress?.({
        phase: "converting",
        message: "Converting locally in your browser...",
      });

      const runtime = getBrowserLibreOfficeRuntime();
      const blob = await runtime.convertDocumentToPdf(conversionFile, {
        signal,
        onInputProgress: (loaded, total) => {
          const pct = total > 0 ? Math.min(99, Math.floor((loaded / total) * 100)) : 0;
          options.onProgress?.({
            phase: "converting",
            message: `Preparing document for LibreOffice... ${pct}%`,
          });
        },
      });

      options.onProgress?.({
        phase: "finalizing",
        message: "Finalizing PDF...",
      });

      const fileName = `${sanitizeFileStem(input.file.name, "converted")}.pdf`;
      if (workspace) {
        await workspace.writeOutput(fileName, blob);
        await workspace.appendLog(`Conversion completed (${blob.size} bytes).`);
        await workspace.dispose("completed");
        workspace = null;
      }

      return {
        blob,
        fileName,
        mimeType: PDF_MIME,
        metadata: {
          processingLocation: this.processingLocation,
          engineId: this.id,
        },
      };
    } catch (error) {
      if (workspace) {
        await workspace.appendLog(
          `Conversion failed: ${error instanceof Error ? error.message : "unknown error"}`,
        ).catch(() => {});
        await workspace.dispose(signal.aborted ? "cancelled" : "failed").catch(() => {});
      }
      throw error;
    }
  }
}
