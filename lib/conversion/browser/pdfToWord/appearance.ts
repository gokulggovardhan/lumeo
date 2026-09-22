import type { ReconstructedTextLine } from "./types.ts";

type Rgb = { r: number; g: number; b: number };

function parseHex(value: string | null | undefined): Rgb | null {
  if (!value || !/^#[0-9A-Fa-f]{6}$/.test(value)) return null;
  return {
    r: Number.parseInt(value.slice(1, 3), 16),
    g: Number.parseInt(value.slice(3, 5), 16),
    b: Number.parseInt(value.slice(5, 7), 16),
  };
}

function toHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b]
    .map((value) =>
      Math.max(0, Math.min(255, Math.round(value)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")
    .toUpperCase()}`;
}

function colorDistance(a: Rgb, b: Rgb): number {
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
}

function isInk(pixel: Rgb): boolean {
  return pixel.r < 238 || pixel.g < 238 || pixel.b < 238;
}

function quantizedKey(pixel: Rgb): string {
  const q = (value: number) => Math.round(value / 16) * 16;
  return `${q(pixel.r)},${q(pixel.g)},${q(pixel.b)}`;
}

function pixelAt(
  data: Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
): Rgb {
  const offset = (y * width + x) * 4;
  return {
    r: data[offset],
    g: data[offset + 1],
    b: data[offset + 2],
  };
}

function dominantInkColor(
  image: ImageData,
  textBottomPx: number,
): Rgb | null {
  const histogram = new Map<string, { count: number; sum: Rgb }>();
  const bottom = Math.max(
    0,
    Math.min(image.height - 1, Math.ceil(textBottomPx)),
  );

  for (let y = 0; y <= bottom; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const pixel = pixelAt(image.data, image.width, x, y);
      if (!isInk(pixel)) continue;
      const key = quantizedKey(pixel);
      const entry = histogram.get(key) ?? {
        count: 0,
        sum: { r: 0, g: 0, b: 0 },
      };
      entry.count += 1;
      entry.sum.r += pixel.r;
      entry.sum.g += pixel.g;
      entry.sum.b += pixel.b;
      histogram.set(key, entry);
    }
  }

  let best:
    | { count: number; sum: Rgb; paintStrength: number }
    | null = null;

  for (const entry of histogram.values()) {
    if (entry.count < 2) continue;
    const average = {
      r: entry.sum.r / entry.count,
      g: entry.sum.g / entry.count,
      b: entry.sum.b / entry.count,
    };

    // Anti-aliasing blends source ink with the white page background. The
    // most frequent cluster is therefore often a lighter fringe (for
    // example #4040F1 around source #0000ED). Recover the source paint by
    // selecting the supported cluster furthest from white; use frequency only
    // as a tie-breaker. This also preserves black/gray text faithfully.
    const paintStrength = Math.hypot(
      255 - average.r,
      255 - average.g,
      255 - average.b,
    );

    if (
      !best ||
      paintStrength > best.paintStrength + 1 ||
      (Math.abs(paintStrength - best.paintStrength) <= 1 &&
        entry.count > best.count)
    ) {
      best = {
        count: entry.count,
        sum: entry.sum,
        paintStrength,
      };
    }
  }

  if (!best) return null;
  return {
    r: best.sum.r / best.count,
    g: best.sum.g / best.count,
    b: best.sum.b / best.count,
  };
}

function hasUnderlineNearBaseline(
  image: ImageData,
  baselinePx: number,
  preferredColor: Rgb | null,
  scaleY: number,
): boolean {
  if (image.width < 8) return false;

  // PDF underline geometry is baseline-relative, not text-box-bottom-relative.
  // Typical producers paint the rule roughly 0.5-2 pt below the baseline.
  // Keep the search band tight so invoice/table rules farther below a label
  // are not misclassified as character underlines.
  const y0 = Math.max(
    0,
    Math.floor(baselinePx + 0.25 * scaleY),
  );
  const y1 = Math.min(
    image.height - 1,
    Math.ceil(baselinePx + 2.5 * scaleY),
  );

  for (let y = y0; y <= y1; y += 1) {
    let matching = 0;
    let longest = 0;
    let current = 0;
    for (let x = 0; x < image.width; x += 1) {
      const pixel = pixelAt(image.data, image.width, x, y);
      const matches =
        isInk(pixel) &&
        (!preferredColor || colorDistance(pixel, preferredColor) <= 72);
      if (matches) {
        matching += 1;
        current += 1;
        longest = Math.max(longest, current);
      } else {
        current = 0;
      }
    }

    if (
      matching / image.width >= 0.58 ||
      longest / image.width >= 0.55
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Raster appearance is an enrichment/verification path, not a text
 * extractor. Geometry and text still come from source PDF operators/PDF.js.
 *
 * Memory note: do not call getImageData for the full rendered page. Safari
 * can otherwise hold a second multi-megabyte RGBA page buffer while the
 * original canvas is still live. Each run samples only its own small local
 * rectangle, and that ImageData becomes unreachable before the next page.
 */
export function enrichTextAppearanceFromCanvas(
  context: CanvasRenderingContext2D,
  lines: ReconstructedTextLine[],
  scaleX: number,
  scaleY: number,
): void {
  const canvas = context.canvas;

  for (const line of lines) {
    if (line.visualOnly) continue;

    const left = Math.max(0, Math.floor(line.xPt * scaleX));
    const top = Math.max(0, Math.floor(line.yPt * scaleY));
    const right = Math.min(
      canvas.width,
      Math.ceil((line.xPt + line.widthPt) * scaleX),
    );
    const textBottom = (line.yPt + line.heightPt) * scaleY;
    const baseline =
      typeof line.baselinePt === "number"
        ? line.baselinePt * scaleY
        : textBottom - Math.max(1, line.fontSizePt * 0.15 * scaleY);
    const underlineBottom = baseline + 2.5 * scaleY;
    const bottom = Math.min(
      canvas.height,
      Math.ceil(Math.max(textBottom, underlineBottom)),
    );
    const width = right - left;
    const height = bottom - top;
    if (width <= 0 || height <= 0) continue;

    let local: ImageData;
    try {
      local = context.getImageData(left, top, width, height);
    } catch {
      // Canvas security/allocation failures must never block conversion.
      continue;
    }

    const localTextBottom = Math.min(
      local.height - 1,
      Math.max(0, textBottom - top),
    );
    const localBaseline = Math.min(
      local.height - 1,
      Math.max(0, baseline - top),
    );
    const sampled = dominantInkColor(local, localTextBottom);

    // Content-stream colour is authoritative when available. Sampling fills
    // gaps for custom colour spaces/PDF.js fallback runs.
    if ((!line.colorHex || line.sourceKind !== "operator") && sampled) {
      line.colorHex = toHex(sampled);
    }

    const preferred = parseHex(line.colorHex) ?? sampled;
    if (
      hasUnderlineNearBaseline(
        local,
        localBaseline,
        preferred,
        scaleY,
      )
    ) {
      line.underline = true;
      line.underlineColorHex =
        line.colorHex ?? (sampled ? toHex(sampled) : null);
    }
  }
}
