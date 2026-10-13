import type { CompressProfile } from "../compressionProfiles.ts";

/**
 * Local, deterministic guidance. The numbers describe only plain JPEG
 * XObjects visible in the PDF resource dictionaries; they are NOT a
 * promise about resulting file size or all possible image encodings.
 */
export type CompressionContentKind = "scanned" | "mixed" | "text" | "unknown";
export type CompressionOpportunity = "Low" | "Moderate" | "High";

export type CompressionDocumentSignals = {
  totalBytes: number;
  pageCount: number;
  plainJpegPages: number;
  plainJpegImageCount: number;
  uniqueJpegBytes: number;
  sampledTextPages: number;
  sampledPages: number;
  protectedStructure: boolean;
};

export type CompressionIntelligence = {
  kind: CompressionContentKind;
  opportunity: CompressionOpportunity;
  recommendation: CompressProfile;
  jpegPageShare: number;
  jpegByteShare: number;
  sampledTextPages: number;
  sampledPages: number;
  explanation: string;
  evidence: string;
};

function finiteNonnegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function buildCompressionIntelligence(
  input: CompressionDocumentSignals,
): CompressionIntelligence {
  const totalBytes = finiteNonnegative(input.totalBytes);
  const pages = Math.max(1, Math.floor(finiteNonnegative(input.pageCount)));
  const jpegPages = Math.min(pages, Math.floor(finiteNonnegative(input.plainJpegPages)));
  const jpegBytes = finiteNonnegative(input.uniqueJpegBytes);
  const sampledPages = Math.min(pages, Math.floor(finiteNonnegative(input.sampledPages)));
  const textPages = Math.min(sampledPages, Math.floor(finiteNonnegative(input.sampledTextPages)));
  const jpegPageShare = jpegPages / pages;
  const jpegByteShare = totalBytes > 0 ? Math.min(1, jpegBytes / totalBytes) : 0;
  const hasText = textPages > 0;
  const kind: CompressionContentKind =
    jpegPages > 0 && hasText ? "mixed"
      : jpegPages > 0 && sampledPages > 0 && textPages === 0 ? "scanned"
        : jpegPages === 0 && hasText ? "text" : "unknown";

  let opportunity: CompressionOpportunity;
  let recommendation: CompressProfile;
  let explanation: string;
  if (input.protectedStructure) {
    opportunity = "Low";
    recommendation = "highQuality";
    explanation = "Interactive or archival structure detected. The engine may retain the original unchanged to protect document features.";
  } else if (jpegByteShare >= 0.4 || (jpegPageShare >= 0.65 && totalBytes / pages >= 250_000)) {
    opportunity = "High";
    recommendation = "balanced";
    explanation = "Large embedded JPEG resources were found. Balanced compression is a useful first attempt while preserving searchable text.";
  } else if (jpegBytes > 0 && (jpegByteShare >= 0.15 || jpegPageShare >= 0.3)) {
    opportunity = "Moderate";
    recommendation = "balanced";
    explanation = "Embedded JPEG resources provide some measurable compression opportunity, although the final reduction is not guaranteed.";
  } else {
    opportunity = "Low";
    recommendation = "highQuality";
    explanation = "Few safe embedded JPEGs were found. Text and already-optimised PDFs may have little room for further reduction.";
  }

  const evidence = `${jpegPages} of ${pages} pages contain plain JPEG resources · ${Math.round(jpegBytes / 1024)} KB distinct JPEG data · selectable text sampled on ${sampledPages} page${sampledPages === 1 ? "" : "s"}`;
  return {
    kind, opportunity, recommendation, jpegPageShare, jpegByteShare,
    sampledTextPages: textPages, sampledPages, explanation, evidence,
  };
}

/** Three deterministic samples, avoiding a full text extraction on huge PDFs. */
export function compressionSamplePageNumbers(pageCount: number): number[] {
  if (!Number.isFinite(pageCount) || pageCount < 1) return [];
  const pages = Math.floor(pageCount);
  return [...new Set([1, Math.ceil(pages / 2), pages])].sort((a, b) => a - b);
}

/** A target cannot be reached more accurately by rerunning the same settings. */
export function wasCompressionPassTried(
  attempts: readonly { dpi: number; imageQuality: number }[],
  dpi: number,
  imageQuality: number,
): boolean {
  return attempts.some((attempt) => attempt.dpi === dpi &&
    Math.abs(attempt.imageQuality - imageQuality) < 0.001);
}
