// See lib/converters/word-to-pdf.ts for the full rationale (why this is a
// separate service, not soffice in-process on Vercel). This is the
// PDF -> DOCX direction: same converter service, POST /convert-pdf-to-word.

export class PdfToWordConversionError extends Error {}

export type PdfToWordResult = {
  buffer: Buffer;
  fileName: string;
};

// Kept comfortably under the route's maxDuration (60s) so a slow conversion
// aborts with a readable message here instead of being hard-killed by the
// platform mid-response.
const CONVERT_TIMEOUT_MS = 55_000;

function converterBaseUrl(): string | null {
  const url = process.env.WORD_TO_PDF_CONVERTER_URL;
  return url ? url.replace(/\/$/, "") : null;
}

function docxFileNameFor(originalName: string) {
  const stem = originalName.replace(/\.[^/.]+$/, "").trim() || "document";
  return `${stem}.docx`;
}

export async function convertPdfToWord({
  fileUrl,
  fileName,
}: {
  fileUrl: string;
  fileName: string;
}): Promise<PdfToWordResult> {
  const baseUrl = converterBaseUrl();
  const converterSecret = process.env.WORD_TO_PDF_CONVERTER_SECRET;

  if (!baseUrl || !converterSecret) {
    throw new PdfToWordConversionError(
      "The conversion service is not configured yet. Please try again shortly.",
    );
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/convert-pdf-to-word`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-convert-secret": converterSecret,
      },
      body: JSON.stringify({ fileUrl }),
      signal: AbortSignal.timeout(CONVERT_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new PdfToWordConversionError(
        "The conversion is taking longer than usual -- the service may have been waking up. Please try again.",
      );
    }
    throw new PdfToWordConversionError("Could not reach the conversion service. Please try again.");
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new PdfToWordConversionError(
      payload?.message ||
        "Conversion failed. The document may be corrupted, password-protected, image-only, or in an unsupported format.",
    );
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  return { buffer, fileName: docxFileNameFor(fileName) };
}
