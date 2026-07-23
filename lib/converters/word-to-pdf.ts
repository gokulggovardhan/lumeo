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

// Kept just under the route's maxDuration (300s, the Fluid-compute ceiling)
// so a slow conversion aborts with a readable message here instead of being
// hard-killed by the platform mid-response. Large or complex documents on the
// free-tier converter (limited CPU) can legitimately take a couple of minutes,
// so this has to be generous -- the old 55s cap made every big file fail even
// though the converter would have finished given the time.
const CONVERT_TIMEOUT_MS = 285_000;
// The warm-up ping only needs to *reach* the container to trigger a wake --
// we don't wait for it to fully boot.
const WARM_TIMEOUT_MS = 10_000;

function converterBaseUrl(): string | null {
  const url = process.env.WORD_TO_PDF_CONVERTER_URL;
  return url ? url.replace(/\/$/, "") : null;
}

function pdfFileNameFor(originalName: string) {
  const stem = originalName.replace(/\.[^/.]+$/, "").trim() || "document";
  return `${stem}.pdf`;
}

// Render's free tier spins the container down after idle. The first request
// then pays a cold-start tax (container boot + LibreOffice init). Pinging
// /healthz when the user *selects* a file -- before they click Convert --
// overlaps that wake with their think-time so the real conversion is fast.
// Best-effort: warming is an optimization, never a requirement.
export async function warmConverter(): Promise<void> {
  const baseUrl = converterBaseUrl();
  if (!baseUrl) return;
  try {
    await fetch(`${baseUrl}/healthz`, { signal: AbortSignal.timeout(WARM_TIMEOUT_MS) });
  } catch {
    // A cold container may not answer within the window -- the request still
    // reached the platform and triggered the boot, which is the whole point.
  }
}

export async function convertWordToPdf({
  fileUrl,
  fileName,
}: {
  fileUrl: string;
  fileName: string;
}): Promise<WordToPdfResult> {
  const baseUrl = converterBaseUrl();
  const converterSecret = process.env.WORD_TO_PDF_CONVERTER_SECRET;

  if (!baseUrl || !converterSecret) {
    throw new WordToPdfConversionError(
      "The conversion service is not configured yet. Please try again shortly.",
    );
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/convert`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-convert-secret": converterSecret,
      },
      body: JSON.stringify({ fileUrl, fileName }),
      signal: AbortSignal.timeout(CONVERT_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new WordToPdfConversionError(
        "This document took too long to convert. It may be very large or complex for our free converter -- try a smaller or simpler file.",
      );
    }
    throw new WordToPdfConversionError("Could not reach the conversion service. Please try again.");
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new WordToPdfConversionError(
      payload?.message ||
        "Conversion failed. The document may be corrupted, password-protected, or in an unsupported format.",
    );
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  return { buffer, fileName: pdfFileNameFor(fileName) };
}
