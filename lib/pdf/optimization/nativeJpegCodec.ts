import type { JpegTranscoder } from "./nativeImages.ts";
import { measureSampledRgbFidelity, passesSampledJpegFidelity, scoreSampledJpegCandidate } from "./fidelity.ts";

/**
 * Local browser image re-encoder. Kept in the dedicated PDF worker:
 * no remote document processing, DOM access or large eager WASM bundle.
 * A browser without worker OffscreenCanvas/createImageBitmap will safely
 * skip lossy image work instead of blocking the main thread.
 */
export const transcodeJpegInWorker: JpegTranscoder = async (jpeg, dimensions, settings) => {
  if (typeof OffscreenCanvas === "undefined" || typeof createImageBitmap !== "function") {
    return null;
  }
  if (dimensions.sourceWidth * dimensions.sourceHeight > 24_000_000 ||
      dimensions.width * dimensions.height > 16_000_000) {
    return null;
  }

  const blob = new Blob([new Uint8Array(jpeg)], { type: "image/jpeg" });
  let bitmap: ImageBitmap | null = null;
  let canvas: OffscreenCanvas | null = null;
  try {
    bitmap = await createImageBitmap(blob, { imageOrientation: "none" });
    if (bitmap.width !== dimensions.sourceWidth || bitmap.height !== dimensions.sourceHeight) {
      // A hostile/malformed XObject's declared dimensions are not reliable.
      return null;
    }
    canvas = new OffscreenCanvas(dimensions.width, dimensions.height);
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return null;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const encoded = await canvas.convertToBlob({
      type: "image/jpeg",
      quality: settings.quality,
    });
    if (encoded.type !== "image/jpeg" || encoded.size < 32) return null;
    const data = new Uint8Array(await encoded.arrayBuffer());
    if (data[0] !== 0xff || data[1] !== 0xd8 ||
        data[data.length - 2] !== 0xff || data[data.length - 1] !== 0xd9) {
      return null;
    }
    // Limit visual-comparison allocations to 96 × 96 RGBA pixels. Reject
    // visibly degraded re-encodes; no source-sized pixel array is allocated.
    const sampleWidth = Math.min(96, dimensions.width);
    const sampleHeight = Math.min(96, dimensions.height);
    const sampleCanvas = new OffscreenCanvas(sampleWidth, sampleHeight);
    const sampleCtx = sampleCanvas.getContext("2d", { alpha: false });
    if (!sampleCtx) return null;
    sampleCtx.drawImage(canvas, 0, 0, sampleWidth, sampleHeight);
    const expected = sampleCtx.getImageData(0, 0, sampleWidth, sampleHeight).data;
    const candidateBitmap = await createImageBitmap(encoded, { imageOrientation: "none" });
    try {
      if (candidateBitmap.width !== dimensions.width ||
          candidateBitmap.height !== dimensions.height) return null;
      sampleCtx.clearRect(0, 0, sampleWidth, sampleHeight);
      sampleCtx.drawImage(candidateBitmap, 0, 0, sampleWidth, sampleHeight);
      const actual = sampleCtx.getImageData(0, 0, sampleWidth, sampleHeight).data;
      const evidence = measureSampledRgbFidelity(expected, actual);
      if (!passesSampledJpegFidelity(evidence, settings.quality)) return null;
      // The candidate's ranking evidence is collected from real encoded
      // pixels and downsampled dimensions, never the quality slider alone.
      const sampledFidelityScore = scoreSampledJpegCandidate(
        evidence,
        { width: dimensions.sourceWidth, height: dimensions.sourceHeight },
        { width: dimensions.width, height: dimensions.height },
      );
      return { bytes: data, sampledFidelityScore };
    } finally {
      candidateBitmap.close();
      sampleCanvas.width = 0;
      sampleCanvas.height = 0;
    }
  } catch {
    return null;
  } finally {
    bitmap?.close();
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
};
