export type TargetAttempt = {
  dpi: number;
  quality: number;
  bytes: number;
  fidelityScore: number;
};
export type TargetCandidate = {
  bytes: ArrayBuffer;
  outputBytes: number;
};

export type TargetSearchOutcome = "achieved" | "closest-safe" | "no-benefit";
export type TargetSearchResult = {
  bytes: ArrayBuffer;
  targetBytes: number;
  outcome: TargetSearchOutcome;
  attempts: TargetAttempt[];
};

export type CandidateSettings = { dpi: number; quality: number };
export type CandidateFactory = (settings: CandidateSettings) => Promise<TargetCandidate>;

// A heuristic for candidate ordering, NOT a measured SSIM/visual score.
// Target output is always decided from actual bytes, never this estimate.
export function estimatedFidelity(settings: CandidateSettings): number {
  return Math.round(1000 * (
    0.7 * ((settings.quality - 0.2) / 0.8) +
    0.3 * ((settings.dpi - 48) / 302)
  )) / 1000;
}

export function preferTargetCandidate(
  current: { bytes: number; fidelityScore: number } | null,
  incoming: { bytes: number; fidelityScore: number },
  targetBytes: number,
): boolean {
  if (!current) return true;
  const currentMeets = current.bytes <= targetBytes;
  const incomingMeets = incoming.bytes <= targetBytes;
  if (currentMeets !== incomingMeets) return incomingMeets;
  if (currentMeets) {
    // Once both meet target, prefer the less aggressive image profile.
    return incoming.fidelityScore > current.fidelityScore ||
      (incoming.fidelityScore === current.fidelityScore && incoming.bytes < current.bytes);
  }
  // Neither meets target: offer the smallest valid result without pretending
  // the target was reached.
  return incoming.bytes < current.bytes ||
    (incoming.bytes === current.bytes && incoming.fidelityScore > current.fidelityScore);
}

const PROFILES: readonly CandidateSettings[] = [
  { dpi: 300, quality: 0.92 },
  { dpi: 250, quality: 0.86 },
  { dpi: 200, quality: 0.8 },
  { dpi: 160, quality: 0.73 },
  { dpi: 128, quality: 0.65 },
  { dpi: 110, quality: 0.57 },
  { dpi: 96, quality: 0.48 },
  { dpi: 80, quality: 0.4 },
];

function middleOf(a: CandidateSettings, b: CandidateSettings): CandidateSettings {
  return {
    dpi: Math.round((a.dpi + b.dpi) / 2),
    quality: Math.round(((a.quality + b.quality) / 2) * 100) / 100,
  };
}

/**
 * Adaptive, bounded, byte-measured target search. Inspect better-quality
 * profiles first, then refine at the boundary; all attempts are distinct.
 * The factory is the shared JPEG/resource optimizer used by both Lumeo
 * tools, so target selection cannot silently change page or image semantics.
 */
export async function searchNativePdfTarget(options: {
  originalBytes: ArrayBuffer;
  targetBytes: number;
  makeCandidate: CandidateFactory;
  onProgress?: (completed: number, max: number) => void;
  maxAttempts?: number;
}): Promise<TargetSearchResult> {
  const { originalBytes, targetBytes, makeCandidate, onProgress } = options;
  if (!Number.isSafeInteger(targetBytes) || targetBytes < 20 * 1024) {
    throw new Error("Target size must be at least 20 KB.");
  }
  const maxAttempts = Math.max(1, Math.min(12, Math.floor(options.maxAttempts ?? 8)));
  const attempts: TargetAttempt[] = [];
  const tried = new Set<string>();
  let best: { bytes: ArrayBuffer; outputBytes: number; fidelityScore: number } = {
    bytes: originalBytes.slice(0),
    outputBytes: originalBytes.byteLength,
    fidelityScore: 1,
  };
  let highestFailed: CandidateSettings | null = null;
  let firstSuccess: CandidateSettings | null = null;
  let nextIndex = 0;

  while (attempts.length < maxAttempts) {
    let settings: CandidateSettings | undefined;
    if (firstSuccess && highestFailed) {
      const refined = middleOf(highestFailed, firstSuccess);
      const key = `${refined.dpi}:${refined.quality}`;
      if (!tried.has(key) &&
          Math.abs(refined.quality - firstSuccess.quality) >= 0.01) {
        settings = refined;
      } else {
        // Stop once a meaningful new point at the boundary is impossible.
        break;
      }
    } else {
      settings = PROFILES[nextIndex];
      nextIndex += 1;
    }
    if (!settings) break;
    const key = `${settings.dpi}:${settings.quality}`;
    if (tried.has(key)) break;
    tried.add(key);

    const candidate = await makeCandidate(settings);
    if (!Number.isSafeInteger(candidate.outputBytes) ||
        candidate.outputBytes <= 0 ||
        candidate.outputBytes !== candidate.bytes.byteLength) {
      throw new Error("Invalid PDF candidate length returned by the optimiser.");
    }
    const score = estimatedFidelity(settings);
    attempts.push({ ...settings, bytes: candidate.outputBytes, fidelityScore: score });
    if (preferTargetCandidate(
      { bytes: best.outputBytes, fidelityScore: best.fidelityScore },
      { bytes: candidate.outputBytes, fidelityScore: score },
      targetBytes,
    )) {
      best = { bytes: candidate.bytes, outputBytes: candidate.outputBytes, fidelityScore: score };
    }

    if (candidate.outputBytes <= targetBytes) {
      if (!firstSuccess || score > estimatedFidelity(firstSuccess)) firstSuccess = settings;
    } else if (!highestFailed || score < estimatedFidelity(highestFailed)) {
      // Track the nearest higher-fidelity failing profile for refinement.
      highestFailed = settings;
    }
    onProgress?.(attempts.length, maxAttempts);

    // If no under-target candidate was found, keep exploring stronger
    // profiles rather than assuming monotonicity from JPEG quality/DPI.
    // Refinement occurs when a crossing was observed.
  }

  const outcome: TargetSearchOutcome =
    best.outputBytes <= targetBytes ? "achieved"
      : best.outputBytes < originalBytes.byteLength ? "closest-safe"
        : "no-benefit";
  return {
    bytes: best.bytes,
    targetBytes,
    outcome,
    attempts,
  };
}
