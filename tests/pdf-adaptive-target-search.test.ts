import assert from "node:assert/strict";
import test from "node:test";
import {
  estimatedFidelity, preferTargetCandidate, searchNativePdfTarget,
} from "../lib/pdf/optimization/adaptiveTarget.ts";

test("target candidate scoring prefers a higher-fidelity valid result, not merely the smallest file", () => {
  assert.equal(preferTargetCandidate(
    { bytes: 48_000, fidelityScore: 0.7 },
    { bytes: 53_000, fidelityScore: 0.95 },
    60_000,
  ), true);
  assert.equal(preferTargetCandidate(
    { bytes: 50_000, fidelityScore: 0.9 },
    { bytes: 40_000, fidelityScore: 0.5 },
    60_000,
  ), false);
  assert.equal(preferTargetCandidate(
    { bytes: 70_000, fidelityScore: 0.8 },
    { bytes: 55_000, fidelityScore: 0.3 },
    60_000,
  ), true);
  assert.ok(estimatedFidelity({ dpi: 250, quality: 0.9 }) >
    estimatedFidelity({ dpi: 100, quality: 0.5 }));
});

test("adaptive target search measures real byte lengths and refines between quality settings", async () => {
  const requested = 60_000;
  const seen = new Set<string>();
  const outcome = await searchNativePdfTarget({
    originalBytes: new ArrayBuffer(220_000),
    targetBytes: requested,
    maxAttempts: 7,
    makeCandidate: async (settings) => {
      const key = `${settings.dpi}:${settings.quality}`;
      assert.ok(!seen.has(key), "duplicate settings must not be rebuilt");
      seen.add(key);
      const outputSize = Math.round(25_000 + 420 * settings.dpi * settings.quality);
      return { bytes: new ArrayBuffer(outputSize), outputBytes: outputSize };
    },
  });
  assert.ok(outcome.attempts.length >= 3);
  assert.ok(outcome.attempts.length <= 7);
  assert.equal(outcome.outcome, "achieved");
  assert.ok(outcome.bytes.byteLength <= requested);
  assert.equal(seen.size, outcome.attempts.length);
});

test("impossible target returns the smallest measured candidate and admits the target was missed", async () => {
  const outcome = await searchNativePdfTarget({
    originalBytes: new ArrayBuffer(250_000),
    targetBytes: 20_480,
    maxAttempts: 8,
    makeCandidate: async (settings) => {
      const size = 40_000 + Math.round(settings.quality * 30_000);
      return { bytes: new ArrayBuffer(size), outputBytes: size };
    },
  });
  assert.equal(outcome.outcome, "closest-safe");
  assert.ok(outcome.bytes.byteLength > outcome.targetBytes);
  assert.equal(outcome.bytes.byteLength, Math.min(...outcome.attempts.map((a) => a.bytes)));
});

test("lossless already below target does not require a candidate", async () => {
  // The controller is intentionally byte-based rather than assuming that
  // original size is always too large or that stronger codecs always win.
  const original = new ArrayBuffer(24_000);
  const outcome = await searchNativePdfTarget({
    originalBytes: original,
    targetBytes: 50_000,
    maxAttempts: 1,
    makeCandidate: async () => ({ bytes: new ArrayBuffer(30_000), outputBytes: 30_000 }),
  });
  assert.equal(outcome.outcome, "achieved");
  assert.equal(outcome.bytes.byteLength, original.byteLength);
});

test("invalid targets and inconsistent candidate size reports fail without fake success", async () => {
  const source = new ArrayBuffer(100_000);
  await assert.rejects(searchNativePdfTarget({
    originalBytes: source, targetBytes: 1, makeCandidate: async () => ({ bytes: source, outputBytes: source.byteLength }),
  }), /at least 20 KB/);
  await assert.rejects(searchNativePdfTarget({
    originalBytes: source, targetBytes: 30_000,
    makeCandidate: async () => ({ bytes: source, outputBytes: 1 }),
  }), /Invalid PDF candidate length/);
});

test("measured JPEG fidelity overrides profile guesses when selecting an achieved target", async () => {
  let attempt = 0;
  const outcome = await searchNativePdfTarget({
    originalBytes: new ArrayBuffer(120_000),
    targetBytes: 60_000,
    maxAttempts: 2,
    makeCandidate: async () => {
      attempt++;
      return attempt === 1
        ? { bytes: new ArrayBuffer(54_000), outputBytes: 54_000, fidelityScore: 0.91 }
        : { bytes: new ArrayBuffer(49_000), outputBytes: 49_000, fidelityScore: 0.98 };
    },
  });
  assert.equal(outcome.outcome, "achieved");
  assert.equal(outcome.bytes.byteLength, 49_000,
    "smaller but measurably better candidate must win even when its settings looked more aggressive");
  assert.deepEqual(outcome.attempts.map((item) => item.fidelityScore), [0.91, 0.98]);
});

test("invalid measured fidelity is rejected rather than trusted", async () => {
  await assert.rejects(searchNativePdfTarget({
    originalBytes: new ArrayBuffer(120_000),
    targetBytes: 60_000,
    maxAttempts: 1,
    makeCandidate: async () => ({
      bytes: new ArrayBuffer(49_000), outputBytes: 49_000, fidelityScore: Number.NaN,
    }),
  }), /Invalid measured PDF candidate fidelity/);
});


test("non-monotonic document sizes continue beyond an exhausted refinement boundary", async () => {
  const seen: number[] = [];
  const result = await searchNativePdfTarget({
    originalBytes: new ArrayBuffer(150_000),
    targetBytes: 60_000,
    maxAttempts: 12,
    makeCandidate: async ({ dpi }) => {
      seen.push(dpi);
      // First profile succeeds, second fails, but a later stronger profile
      // succeeds with better measured fidelity than the first success.
      const size = dpi === 300 ? 55_000 : dpi >= 200 ? 90_000 : 51_000;
      const score = dpi === 160 ? 0.98 : dpi === 300 ? 0.8 : 0.4;
      return { bytes: new ArrayBuffer(size), outputBytes: size, fidelityScore: score };
    },
  });
  assert.ok(seen.includes(160), "coarse exploration must continue after boundary refinement");
  assert.equal(result.outcome, "achieved");
  assert.equal(result.bytes.byteLength, 51_000);
  assert.equal(new Set(result.attempts.map(a => a.dpi + ":" + a.quality)).size, result.attempts.length);
});
