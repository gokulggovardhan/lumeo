import type { JpegTranscoder } from "./nativeImages.ts";

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
    bitmap = await createImageBitmap(blob);
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
    return data;
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
