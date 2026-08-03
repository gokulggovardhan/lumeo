export type CompressionMode = "quality" | "target";
export type TargetUnit = "KB" | "MB";
export type TargetOutcome =
  | "achieved"
  | "closest-safe"
  | "not-beneficial"
  | "failed";
export type TargetQualityOutlook =
  | "Excellent"
  | "Good"
  | "Aggressive"
  | "Extreme"
  | "Unlikely";

export type TargetCompressionAttempt = {
  pass: number;
  dpi: number;
  imageQuality: number;
  outputBytes: number;
};

export type TargetCompressionRequest = {
  targetBytes: number;
  grayscale: boolean;
};

export type TargetCompressionResult = {
  outcome: TargetOutcome;
  requestedBytes: number;
  outputBytes: number;
  attempts: TargetCompressionAttempt[];
  qualityOutlook: TargetQualityOutlook;
};

export type TargetParameters = {
  strength: number;
  dpi: number;
  imageQuality: number;
};

export const MIN_TARGET_BYTES = 20 * 1024;
export const MAX_TARGET_PASSES = 6;
export const TARGET_MIN_DPI = 72;
export const TARGET_MAX_DPI = 220;
export const TARGET_MIN_QUALITY = 0.37;
export const TARGET_MAX_QUALITY = 0.86;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function targetValueToBytes(value: number, unit: TargetUnit) {
  if (!Number.isFinite(value)) return Number.NaN;
  const multiplier = unit === "MB" ? 1024 * 1024 : 1024;
  return Math.round(value * multiplier);
}

export function createTargetCompressionRequest(
  targetBytes: number,
  grayscale: boolean,
): TargetCompressionRequest {
  return { targetBytes, grayscale };
}

export function validateTargetBytes(targetBytes: number, originalBytes: number) {
  if (!Number.isFinite(targetBytes) || targetBytes <= 0) {
    return "Enter a positive target size.";
  }
  if (targetBytes < MIN_TARGET_BYTES) {
    return "Choose a target of at least 20 KB.";
  }
  if (targetBytes >= originalBytes) {
    return "This target is not smaller than the original file.";
  }
  return "";
}

export function requiredReductionPercent(
  originalBytes: number,
  targetBytes: number,
) {
  if (originalBytes <= 0 || targetBytes >= originalBytes) return 0;
  return ((originalBytes - targetBytes) / originalBytes) * 100;
}

export function qualityOutlookForTarget(
  originalBytes: number,
  targetBytes: number,
  pageCount: number,
): TargetQualityOutlook {
  if (originalBytes <= 0 || targetBytes <= 0 || targetBytes >= originalBytes) {
    return "Excellent";
  }

  const ratio = targetBytes / originalBytes;
  const bytesPerPage = targetBytes / Math.max(1, pageCount);
  if (ratio >= 0.68 && bytesPerPage >= 110_000) return "Excellent";
  if (ratio >= 0.42 && bytesPerPage >= 70_000) return "Good";
  if (ratio >= 0.24 && bytesPerPage >= 45_000) return "Aggressive";
  if (ratio >= 0.12 && bytesPerPage >= 28_000) return "Extreme";
  return "Unlikely";
}

export function parametersForStrength(strength: number): TargetParameters {
  const normalized = clamp(strength, 0, 1);
  return {
    strength: normalized,
    dpi: Math.round(
      TARGET_MAX_DPI - (TARGET_MAX_DPI - TARGET_MIN_DPI) * normalized,
    ),
    imageQuality:
      Math.round(
        (TARGET_MAX_QUALITY -
          (TARGET_MAX_QUALITY - TARGET_MIN_QUALITY) * normalized) *
          100,
      ) / 100,
  };
}

export function initialTargetParameters(
  originalBytes: number,
  targetBytes: number,
  pageCount: number,
) {
  const ratio = clamp(targetBytes / Math.max(1, originalBytes), 0.01, 0.99);
  const perPagePressure = clamp(
    1 - targetBytes / Math.max(1, pageCount * 100_000),
    0,
    0.25,
  );
  return parametersForStrength(clamp(1 - ratio + perPagePressure, 0.08, 0.92));
}

export function nextTargetStrength({
  currentStrength,
  outputBytes,
  targetBytes,
  largestTooLargeStrength,
  smallestSuccessfulStrength,
}: {
  currentStrength: number;
  outputBytes: number;
  targetBytes: number;
  largestTooLargeStrength: number | null;
  smallestSuccessfulStrength: number | null;
}) {
  if (outputBytes > targetBytes) {
    const lower = Math.max(currentStrength, largestTooLargeStrength ?? 0);
    const upper = smallestSuccessfulStrength ?? 1;
    return clamp((lower + upper) / 2, 0, 1);
  }

  const lower = largestTooLargeStrength ?? 0;
  const upper = Math.min(currentStrength, smallestSuccessfulStrength ?? 1);
  return clamp((lower + upper) / 2, 0, 1);
}

export function chooseTargetOutcome({
  targetBytes,
  originalBytes,
  bestUnderTargetBytes,
  smallestCandidateBytes,
}: {
  targetBytes: number;
  originalBytes: number;
  bestUnderTargetBytes: number | null;
  smallestCandidateBytes: number;
}): TargetOutcome {
  if (bestUnderTargetBytes !== null && bestUnderTargetBytes <= targetBytes) {
    return "achieved";
  }
  if (smallestCandidateBytes >= originalBytes) return "not-beneficial";
  return "closest-safe";
}

export function chooseBetterTargetCandidate({
  currentBytes,
  candidateBytes,
  targetBytes,
}: {
  currentBytes: number | null;
  candidateBytes: number;
  targetBytes: number;
}) {
  if (currentBytes === null) return true;
  const currentUnder = currentBytes <= targetBytes;
  const candidateUnder = candidateBytes <= targetBytes;
  if (candidateUnder && !currentUnder) return true;
  if (!candidateUnder && currentUnder) return false;
  if (candidateUnder) return candidateBytes > currentBytes;
  return candidateBytes < currentBytes;
}

// Recompression can legitimately grow a file (an already-optimized scan, or
// a document where re-encoding overhead outweighs any savings), and neither
// compression mode in CompressPdfTool.tsx compares its candidate against
// the original before finalizing. Compression should never ship a result
// bigger than what the user started with -- this is the single check that
// enforces that guarantee, in both quality and target mode.
export function shouldFallbackToOriginal(outputBytes: number, originalBytes: number): boolean {
  return outputBytes >= originalBytes;
}
