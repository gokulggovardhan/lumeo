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
    .map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0"))
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

function pixelAt(data: Uint8ClampedArray, width: number, x: number, y: number): Rgb {
  const offset = (y * width + x) * 4;
  return {
    r: data[offset],
    g: data[offset + 1],
    b: data[offset + 2],
  };
}

function dominantInkColor(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  left: number,
  top: number,
  right: number,
  bottom: number,
): Rgb | null {
  const histogram = new Map<string, { count: number; sum: Rgb }>();
  const x0 = Math.max(0, Math.floor(left));
  const y0 = Math.max(0, Math.floor(top));
  const x1 = Math.min(width - 1, Math.ceil(right));
  const y1 = Math.min(height - 1, Math.ceil(bottom));

  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const pixel = pixelAt(data, width, x, y);
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

  let best: { count: number; sum: Rgb } | null = null;
  for (const entry of histogram.values()) {
    if (!best || entry.count > best.count) best = entry;
  }
  if (!best || best.count < 2) return null;
  return {
    r: best.sum.r / best.count,
    g: best.sum.g / best.count,
    b: best.sum.b / best.count,
  };
}

function hasUnderlineNearBottom(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  line: ReconstructedTextLine,
  scaleX: number,
  scaleY: number,
  preferredColor: Rgb | null,
): boolean {
  const x0 = Math.max(0, Math.floor(line.xPt * scaleX));
  const x1 = Math.min(
    width - 1,
    Math.ceil((line.xPt + line.widthPt) * scaleX),
  );
  if (x1 - x0 < 8) return false;

  const bottom = (line.yPt + line.heightPt) * scaleY;
  // True PDF underlines are typically within about one source point of the
  // text box's visual bottom. Keeping the search this tight avoids confusing
  // invoice/table rules several points below a heading with an underline.
  const y0 = Math.max(0, Math.floor(bottom - 1.25 * scaleY));
  const y1 = Math.min(height - 1, Math.ceil(bottom + 1.25 * scaleY));

  for (let y = y0; y <= y1; y += 1) {
    let matching = 0;
    let longest = 0;
    let current = 0;
    for (let x = x0; x <= x1; x += 1) {
      const pixel = pixelAt(data, width, x, y);
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

    const span = x1 - x0 + 1;
    if (matching / span >= 0.58 || longest / span >= 0.55) return true;
  }

  return false;
}

/**
 * Raster appearance is a verification/enrichment path, not a text extractor.
 * Geometry/text comes from PDF operators/PDF.js; the already-rendered local
 * page bitmap supplies appearance details that PDFs do not encode
 * semantically, notably painted underlines and uncommon colour-space output.
 */
export function enrichTextAppearanceFromCanvas(
  context: CanvasRenderingContext2D,
  lines: ReconstructedTextLine[],
  scaleX: number,
  scaleY: number,
): void {
  if (!lines.length) return;

  const canvas = context.canvas;
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  for (const line of lines) {
    if (line.visualOnly) continue;

    const left = line.xPt * scaleX;
    const top = line.yPt * scaleY;
    const right = (line.xPt + line.widthPt) * scaleX;
    const bottom = (line.yPt + line.heightPt) * scaleY;
    const sampled = dominantInkColor(
      image.data,
      image.width,
      image.height,
      left,
      top,
      right,
      bottom,
    );

    // Content-stream colour is authoritative when available. Sampling fills
    // gaps for custom colour spaces/PDF.js fallback runs.
    if ((!line.colorHex || line.sourceKind !== "operator") && sampled) {
      line.colorHex = toHex(sampled);
    }

    const preferred = parseHex(line.colorHex) ?? sampled;
    if (
      hasUnderlineNearBottom(
        image.data,
        image.width,
        image.height,
        line,
        scaleX,
        scaleY,
        preferred,
      )
    ) {
      line.underline = true;
      line.underlineColorHex = line.colorHex ?? (sampled ? toHex(sampled) : null);
    }
  }
}
