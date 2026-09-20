import { sanitizeFileStem } from "@/lib/pdf/sanitizeFileName";
import {
  removePdfUpload,
  uploadPdfFileForConversion,
} from "@/lib/supabase/pdfToWordStorage";
import type {
  ConversionEngine,
  ConversionInput,
  ConversionOptions,
  ConversionResult,
} from "@/lib/conversion/types";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * Temporary adapter around Lumeo's previous Supabase -> API -> LibreOffice
 * service flow. It lets the existing UI migrate to ConversionEngine now while
 * browser-native PDF reconstruction is developed independently later.
 */
export class LegacyServerPdfToWordEngine implements ConversionEngine {
  readonly id = "legacy-server-pdf-to-word";
  readonly kind = "pdf-to-word" as const;
  readonly processingLocation = "server" as const;

  async convert(
    input: ConversionInput,
    options: ConversionOptions,
    signal: AbortSignal,
  ): Promise<ConversionResult> {
    if (signal.aborted) throw signal.reason ?? new DOMException("Conversion cancelled", "AbortError");

    const { file } = input;
    options.onProgress?.({ phase: "uploading", message: "Uploading to secure cloud..." });

    let uploadPath = "";
    try {
      const upload = await uploadPdfFileForConversion(file);
      uploadPath = upload.path;
      if (signal.aborted) throw signal.reason ?? new DOMException("Conversion cancelled", "AbortError");

      options.onProgress?.({ phase: "converting", message: "Converting layout..." });
      const response = await fetch("/api/tools/pdf-to-word", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, filePathInSupabase: upload.path }),
        signal,
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.message || "Conversion failed. Please try again.");
      }

      options.onProgress?.({ phase: "finalizing", message: "Finalizing document..." });
      const blob = await response.blob();
      const fileName = `${sanitizeFileStem(file.name, "converted")}.docx`;

      return {
        blob,
        fileName,
        mimeType: DOCX_MIME,
        metadata: { processingLocation: this.processingLocation, engineId: this.id },
      };
    } catch (error) {
      if (uploadPath) await removePdfUpload(uploadPath).catch(() => {});
      throw error;
    }
  }
}
