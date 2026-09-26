export type PixelRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type RgbaVisualDiff = {
  width: number;
  height: number;
  totalPixels: number;
  changedPixels: number;
  changedPixelsInsideMask: number;
  changedPixelsOutsideMask: number;
  maxChannelDelta: number;
  changedBounds: PixelRect | null;
  changedOutsideMaskBounds: PixelRect | null;
};

function normalizedRect(
  rect: PixelRect,
  width: number,
  height: number,
): PixelRect | null {
  const x0 = Math.max(0, Math.floor(rect.x));
  const y0 = Math.max(0, Math.floor(rect.y));
  const x1 = Math.min(width, Math.ceil(rect.x + rect.width));
  const y1 = Math.min(height, Math.ceil(rect.y + rect.height));
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

function inRect(x: number, y: number, rect: PixelRect): boolean {
  return (
    x >= rect.x &&
    y >= rect.y &&
    x < rect.x + rect.width &&
    y < rect.y + rect.height
  );
}

function boundsFromExtents(
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): PixelRect | null {
  return Number.isFinite(minX)
    ? {
        x: minX,
        y: minY,
        width: maxX - minX + 1,
        height: maxY - minY + 1,
      }
    : null;
}

/**
 * Exact RGBA pixel comparison used by Edit PDF fidelity tests.
 *
 * channelTolerance defaults to 0 deliberately. The compared images are
 * rendered by the SAME PDF.js build at the SAME fixed scale in one process,
 * so there is no cross-browser/GPU source of expected noise to excuse.
 *
 * maskRects are the only pixels allowed to change. They must be derived
 * from a proven edited PDF region; a caller should also assert that some
 * pixels INSIDE the mask changed, otherwise an accidentally skipped edit
 * would make the test vacuously pass.
 */
export function compareRgbaImages({
  before,
  after,
  width,
  height,
  maskRects = [],
  channelTolerance = 0,
}: {
  before: Uint8ClampedArray;
  after: Uint8ClampedArray;
  width: number;
  height: number;
  maskRects?: readonly PixelRect[];
  channelTolerance?: number;
}): RgbaVisualDiff {
  if (!Number.isInteger(width) || width <= 0) {
    throw new Error("Visual diff width must be a positive integer.");
  }
  if (!Number.isInteger(height) || height <= 0) {
    throw new Error("Visual diff height must be a positive integer.");
  }
  if (!Number.isFinite(channelTolerance) || channelTolerance < 0) {
    throw new Error("Visual diff channel tolerance must be a non-negative finite number.");
  }

  const expectedLength = width * height * 4;
  if (before.length !== expectedLength || after.length !== expectedLength) {
    throw new Error(
      "RGBA buffers must both contain width × height × 4 bytes (" +
        expectedLength +
        ").",
    );
  }

  const masks = maskRects
    .map((rect) => normalizedRect(rect, width, height))
    .filter((rect): rect is PixelRect => rect !== null);

  let changedPixels = 0;
  let changedPixelsInsideMask = 0;
  let changedPixelsOutsideMask = 0;
  let maxChannelDelta = 0;

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  let outsideMinX = Number.POSITIVE_INFINITY;
  let outsideMinY = Number.POSITIVE_INFINITY;
  let outsideMaxX = Number.NEGATIVE_INFINITY;
  let outsideMaxY = Number.NEGATIVE_INFINITY;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      let pixelChanged = false;

      for (let channel = 0; channel < 4; channel += 1) {
        const delta = Math.abs(before[offset + channel] - after[offset + channel]);
        if (delta > maxChannelDelta) maxChannelDelta = delta;
        if (delta > channelTolerance) pixelChanged = true;
      }

      if (!pixelChanged) continue;
      changedPixels += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);

      const masked = masks.some((rect) => inRect(x, y, rect));
      if (masked) {
        changedPixelsInsideMask += 1;
      } else {
        changedPixelsOutsideMask += 1;
        outsideMinX = Math.min(outsideMinX, x);
        outsideMinY = Math.min(outsideMinY, y);
        outsideMaxX = Math.max(outsideMaxX, x);
        outsideMaxY = Math.max(outsideMaxY, y);
      }
    }
  }

  return {
    width,
    height,
    totalPixels: width * height,
    changedPixels,
    changedPixelsInsideMask,
    changedPixelsOutsideMask,
    maxChannelDelta,
    changedBounds: boundsFromExtents(minX, minY, maxX, maxY),
    changedOutsideMaskBounds: boundsFromExtents(
      outsideMinX,
      outsideMinY,
      outsideMaxX,
      outsideMaxY,
    ),
  };
}
