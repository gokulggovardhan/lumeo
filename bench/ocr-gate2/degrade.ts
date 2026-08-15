// bench/ocr-gate2/degrade.ts
//
// Image degradations for the class-b and class-c fixtures, implemented on
// raw pixel buffers so the corpus can be regenerated from this repo alone
// with no image-processing native dependency beyond the canvas already
// needed to draw the pages.
//
// IMPORTANT: these SIMULATE scanner skew and phone-camera capture. They are
// not the real thing. A real scan carries sensor noise with its own spatial
// correlation, a real photo carries lens distortion, rolling shutter, and
// compression tuned by the phone's ISP. Error rates measured against these
// fixtures are honest for COMPARING configurations and for showing how the
// rate moves as quality drops; they are not a substitute for real captures
// when setting a shippable absolute threshold. See README.md.

/** Deterministic PRNG so a regenerated corpus is byte-identical. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Separable box blur, run `passes` times. Three passes of a box blur
 * approximate a Gaussian closely enough for this purpose and stay O(n) per
 * pass regardless of radius, which matters on a 2480x3508 page where a
 * naive convolution would be minutes rather than milliseconds.
 */
export function boxBlur(data: Uint8ClampedArray, width: number, height: number, radius: number, passes = 3): void {
  if (radius < 1) return;
  const temp = new Uint8ClampedArray(data.length);
  for (let pass = 0; pass < passes; pass += 1) {
    blurAxis(data, temp, width, height, radius, true);
    blurAxis(temp, data, width, height, radius, false);
  }
}

function blurAxis(
  source: Uint8ClampedArray,
  target: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
  horizontal: boolean,
): void {
  const outer = horizontal ? height : width;
  const inner = horizontal ? width : height;
  const window = radius * 2 + 1;

  for (let o = 0; o < outer; o += 1) {
    const at = (i: number) => (horizontal ? (o * width + i) * 4 : (i * width + o) * 4);
    let r = 0;
    let g = 0;
    let b = 0;
    // Prime the running sum with the clamped left/top edge.
    for (let k = -radius; k <= radius; k += 1) {
      const idx = at(Math.min(inner - 1, Math.max(0, k)));
      r += source[idx];
      g += source[idx + 1];
      b += source[idx + 2];
    }
    for (let i = 0; i < inner; i += 1) {
      const out = at(i);
      target[out] = r / window;
      target[out + 1] = g / window;
      target[out + 2] = b / window;
      target[out + 3] = 255;

      const leaving = at(Math.min(inner - 1, Math.max(0, i - radius)));
      const entering = at(Math.min(inner - 1, Math.max(0, i + radius + 1)));
      r += source[entering] - source[leaving];
      g += source[entering + 1] - source[leaving + 1];
      b += source[entering + 2] - source[leaving + 2];
    }
  }
}

/**
 * Additive luminance noise. Sum of four uniforms approximates a normal
 * distribution (central limit), which is closer to sensor noise than a
 * single uniform's flat distribution.
 */
export function addNoise(data: Uint8ClampedArray, amount: number, random: () => number): void {
  for (let i = 0; i < data.length; i += 4) {
    const n = ((random() + random() + random() + random()) / 2 - 1) * amount;
    data[i] += n;
    data[i + 1] += n;
    data[i + 2] += n;
  }
}

/**
 * Uneven illumination: a soft off-centre falloff, the thing every phone
 * photo of a page has and no scan does. Applied multiplicatively so white
 * paper goes grey rather than clipping to black.
 */
export function applyVignette(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  strength: number,
  centreX = 0.42,
  centreY = 0.38,
): void {
  const cx = width * centreX;
  const cy = height * centreY;
  const maxDistance = Math.hypot(Math.max(cx, width - cx), Math.max(cy, height - cy));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const t = Math.hypot(x - cx, y - cy) / maxDistance;
      const factor = 1 - strength * t * t;
      const i = (y * width + x) * 4;
      data[i] *= factor;
      data[i + 1] *= factor;
      data[i + 2] *= factor;
    }
  }
}
