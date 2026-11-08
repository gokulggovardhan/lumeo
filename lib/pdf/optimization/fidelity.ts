/**
 * A bounded, sampled JPEG visual-fidelity safeguard. It compares RGB samples
 * of the ORIGINAL image rendered at the selected output resolution with the
 * actual JPEG candidate, not a prediction from the quality slider.
 *
 * PSNR is a useful distortion check, not proof of semantic readability.
 * Native text/vector/page structure is separately preserved by pdf-lib.
 */
export type SampledFidelity = {
  psnrDb: number;
  meanAbsoluteError: number;
};

export function measureSampledRgbFidelity(
  expected: Uint8ClampedArray,
  actual: Uint8ClampedArray,
): SampledFidelity {
  if (expected.length < 4 || expected.length !== actual.length || expected.length % 4 !== 0) {
    throw new Error("Image fidelity samples have incompatible RGBA dimensions.");
  }
  let totalSquared = 0;
  let totalAbsolute = 0;
  let channels = 0;
  for (let i = 0; i < expected.length; i += 4) {
    for (let channel = 0; channel < 3; channel += 1) {
      const difference = expected[i + channel] - actual[i + channel];
      totalSquared += difference * difference;
      totalAbsolute += Math.abs(difference);
      channels += 1;
    }
  }
  const mse = totalSquared / channels;
  return {
    psnrDb: mse === 0 ? Infinity : 10 * Math.log10((255 * 255) / mse),
    meanAbsoluteError: totalAbsolute / channels,
  };
}

export function passesSampledJpegFidelity(
  evidence: SampledFidelity,
  requestedQuality: number,
): boolean {
  if (!Number.isFinite(requestedQuality) || requestedQuality < 0.2 || requestedQuality > 1) return false;
  if (Number.isNaN(evidence.psnrDb) || evidence.psnrDb < 0 ||
      !Number.isFinite(evidence.meanAbsoluteError) || evidence.meanAbsoluteError < 0) return false;
  const minimumPsnr = requestedQuality >= 0.85 ? 28
    : requestedQuality >= 0.65 ? 25 : 23;
  const maximumMae = requestedQuality >= 0.85 ? 11
    : requestedQuality >= 0.65 ? 16 : 22;
  return evidence.psnrDb >= minimumPsnr &&
    evidence.meanAbsoluteError <= maximumMae;
}
