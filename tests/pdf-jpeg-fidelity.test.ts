import assert from "node:assert/strict";
import test from "node:test";
import { measureSampledRgbFidelity, passesSampledJpegFidelity, scoreSampledJpegCandidate } from "../lib/pdf/optimization/fidelity.ts";

function pixel(r: number, g: number, b: number) {
  return new Uint8ClampedArray([r, g, b, 255]);
}

test("identical sampled images have infinite PSNR and zero distortion", () => {
  const score = measureSampledRgbFidelity(pixel(50, 100, 150), pixel(50, 100, 150));
  assert.equal(score.psnrDb, Infinity);
  assert.equal(score.meanAbsoluteError, 0);
  assert.equal(passesSampledJpegFidelity(score, 0.92), true);
});

test("large image distortions fail at every compression profile", () => {
  const score = measureSampledRgbFidelity(pixel(12, 12, 12), pixel(240, 240, 240));
  assert.ok(score.psnrDb < 5);
  assert.ok(score.meanAbsoluteError > 200);
  for (const quality of [0.4, 0.65, 0.85, 0.95]) {
    assert.equal(passesSampledJpegFidelity(score, quality), false);
  }
});

test("high-quality JPEG settings enforce tighter fidelity than maximum compression", () => {
  const score = { psnrDb: 25.5, meanAbsoluteError: 13 };
  assert.equal(passesSampledJpegFidelity(score, 0.95), false);
  assert.equal(passesSampledJpegFidelity(score, 0.74), true);
  assert.equal(passesSampledJpegFidelity(score, 0.49), true);
});

test("malformed PSNR input never qualifies as quality-preserving", () => {
  assert.throws(() => measureSampledRgbFidelity(pixel(1, 2, 3), new Uint8ClampedArray(3)));
  assert.equal(passesSampledJpegFidelity({ psnrDb: Number.NaN, meanAbsoluteError: 0 }, 0.5), false);
  assert.equal(passesSampledJpegFidelity({ psnrDb: 30, meanAbsoluteError: Number.POSITIVE_INFINITY }, 0.5), false);
  assert.equal(passesSampledJpegFidelity({ psnrDb: 30, meanAbsoluteError: 0 }, 2), false);
});

test("sampled quality ranking accounts for measured distortion and downsampling", () => {
  const identical = scoreSampledJpegCandidate(
    { psnrDb: Infinity, meanAbsoluteError: 0 },
    { width: 1200, height: 800 },
    { width: 1200, height: 800 },
  );
  const resized = scoreSampledJpegCandidate(
    { psnrDb: Infinity, meanAbsoluteError: 0 },
    { width: 1200, height: 800 },
    { width: 600, height: 400 },
  );
  const distorted = scoreSampledJpegCandidate(
    { psnrDb: 26, meanAbsoluteError: 13 },
    { width: 1200, height: 800 },
    { width: 1200, height: 800 },
  );
  assert.equal(identical, 1);
  assert.ok(resized < identical);
  assert.ok(distorted < identical);
  assert.throws(() => scoreSampledJpegCandidate(
    { psnrDb: 30, meanAbsoluteError: 2 },
    { width: 500, height: 400 },
    { width: 600, height: 400 },
  ), /Invalid sampled JPEG fidelity/);
});
