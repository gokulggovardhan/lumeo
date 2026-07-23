// See lib/converters/word-to-pdf.ts for the full rationale (why this is a
// separate service, not soffice in-process on Vercel). This is the
// PDF -> DOCX direction: same converter service, POST /convert-pdf-to-word.

export class PdfToWordConversionError extends Error {}

export type PdfToWordResult = {
  buffer: Buffer;
  fileName: string;
};

// Kept just under the route's maxDuration (300s, the Fluid-compute ceiling)
// so a slow conversion aborts with a readable message here instead of being
// hard-killed by the platform mid-response. Large or image-heavy PDFs on the
// free-tier converter (limited CPU) can legitimately take a couple of minutes,
// so this has to be generous -- the old 55s cap made every big PDF fail even
// though the converter would have finished given the time.
const CONVERT_TIMEOUT_MS = 285_000;

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
        "This PDF took too long to convert. It may be very large or image-heavy for our free converter -- try a smaller or simpler file.",
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
