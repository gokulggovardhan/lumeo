import { sanitizeFileStem } from "@/lib/pdf/sanitizeFileName";
import {
  removeWordUpload,
  uploadWordFileForConversion,
} from "@/lib/supabase/wordToPdfStorage";
import type {
  ConversionEngine,
  ConversionInput,
  ConversionOptions,
  ConversionResult,
} from "@/lib/conversion/types";

const PDF_MIME = "application/pdf";

/**
 * Temporary adapter around Lumeo's previous Supabase -> API -> LibreOffice
 * service flow. This remains only to preserve the existing implementation
 * while browser-native Word -> PDF is developed behind the same interface.
 */
export class LegacyServerWordToPdfEngine implements ConversionEngine {
  readonly id = "legacy-server-word-to-pdf";
  readonly kind = "word-to-pdf" as const;
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
      const upload = await uploadWordFileForConversion(file);
      uploadPath = upload.path;
      if (signal.aborted) throw signal.reason ?? new DOMException("Conversion cancelled", "AbortError");

      options.onProgress?.({ phase: "converting", message: "Converting layout..." });
      const response = await fetch("/api/tools/word-to-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, filePathInSupabase: upload.path }),
        signal,
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.message || "Conversion failed. Please try again.");
      }

      options.onProgress?.({ phase: "finalizing", message: "Finalizing PDF..." });
      const blob = await response.blob();
      const fileName = `${sanitizeFileStem(file.name, "converted")}.pdf`;

      return {
        blob,
        fileName,
        mimeType: PDF_MIME,
        metadata: { processingLocation: this.processingLocation, engineId: this.id },
      };
    } catch (error) {
      if (uploadPath) await removeWordUpload(uploadPath).catch(() => {});
      throw error;
    }
  }
}
