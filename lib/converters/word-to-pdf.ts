// Delegates to a standalone LibreOffice-backed converter service (see
// services/word-to-pdf-converter/) instead of running soffice in-process.
// Vercel's standard Next.js deployment does not build a Dockerfile for this
// app, so there is no LibreOffice binary available in this runtime -- the
// conversion has to happen on a real container host that this function
// calls over HTTP.

export class WordToPdfConversionError extends Error {}

export type WordToPdfResult = {
  buffer: Buffer;
  fileName: string;
};

function pdfFileNameFor(originalName: string) {
  const stem = originalName.replace(/\.[^/.]+$/, "").trim() || "document";
  return `${stem}.pdf`;
}

export async function convertWordToPdf({
  fileUrl,
  fileName,
}: {
  fileUrl: string;
  fileName: string;
}): Promise<WordToPdfResult> {
  const converterUrl = process.env.WORD_TO_PDF_CONVERTER_URL;
  const converterSecret = process.env.WORD_TO_PDF_CONVERTER_SECRET;

  if (!converterUrl || !converterSecret) {
    throw new WordToPdfConversionError(
      "The conversion service is not configured yet. Please try again shortly.",
    );
  }

  let response: Response;
  try {
    response = await fetch(`${converterUrl.replace(/\/$/, "")}/convert`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-convert-secret": converterSecret,
      },
      body: JSON.stringify({ fileUrl, fileName }),
      // Cold starts on a free-tier host plus a real LibreOffice pass can
      // legitimately take a while -- longer than this app's own default
      // fetch timeout would otherwise allow.
      signal: AbortSignal.timeout(100_000),
    });
  } catch {
    throw new WordToPdfConversionError("Could not reach the conversion service. Please try again.");
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new WordToPdfConversionError(
      payload?.message || "Conversion failed. The document may be corrupted, password-protected, or in an unsupported format.",
    );
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  return { buffer, fileName: pdfFileNameFor(fileName) };
}
