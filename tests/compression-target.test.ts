import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_TARGET_PASSES,
  MIN_TARGET_BYTES,
  chooseBetterTargetCandidate,
  chooseTargetOutcome,
  createTargetCompressionRequest,
  initialTargetParameters,
  nextTargetStrength,
  parametersForStrength,
  qualityOutlookForTarget,
  targetValueToBytes,
  validateTargetBytes,
} from "../lib/compressionTarget.ts";
import { compressionProfiles } from "../lib/compressionProfiles.ts";

test("converts KB targets to bytes", () => {
  assert.equal(targetValueToBytes(350, "KB"), 350 * 1024);
});

test("converts whole MB targets to bytes", () => {
  assert.equal(targetValueToBytes(2, "MB"), 2 * 1024 * 1024);
});

test("converts decimal MB targets to bytes", () => {
  assert.equal(targetValueToBytes(1.5, "MB"), 1.5 * 1024 * 1024);
});

test("rejects empty target input", () => {
  assert.match(validateTargetBytes(Number.NaN, 1_000_000), /positive/);
});

test("rejects zero target input", () => {
  assert.match(validateTargetBytes(0, 1_000_000), /positive/);
});

test("rejects negative target input", () => {
  assert.match(validateTargetBytes(-10, 1_000_000), /positive/);
});

test("rejects below-minimum target input", () => {
  assert.match(validateTargetBytes(MIN_TARGET_BYTES - 1, 1_000_000), /at least 20 KB/);
});

test("rejects target equal to original size", () => {
  assert.match(validateTargetBytes(1_000_000, 1_000_000), /not smaller/);
});

test("rejects target larger than original size", () => {
  assert.match(validateTargetBytes(1_100_000, 1_000_000), /not smaller/);
});

test("accepts exact valid target below original size", () => {
  assert.equal(validateTargetBytes(400_000, 1_000_000), "");
});

test("reports achieved only when output is at or below target", () => {
  assert.equal(
    chooseTargetOutcome({
      targetBytes: 400_000,
      originalBytes: 2_000_000,
      bestUnderTargetBytes: 390_000,
      smallestCandidateBytes: 390_000,
    }),
    "achieved",
  );
});

test("reports closest-safe when output remains above target", () => {
  assert.equal(
    chooseTargetOutcome({
      targetBytes: 400_000,
      originalBytes: 2_000_000,
      bestUnderTargetBytes: null,
      smallestCandidateBytes: 470_000,
    }),
    "closest-safe",
  );
});

test("reports compression not beneficial when every candidate is larger", () => {
  assert.equal(
    chooseTargetOutcome({
      targetBytes: 400_000,
      originalBytes: 500_000,
      bestUnderTargetBytes: null,
      smallestCandidateBytes: 510_000,
    }),
    "not-beneficial",
  );
});

test("selects the best under-target candidate", () => {
  assert.equal(
    chooseBetterTargetCandidate({
      currentBytes: 350_000,
      candidateBytes: 390_000,
      targetBytes: 400_000,
    }),
    true,
  );
});

test("does not replace an under-target candidate with an above-target one", () => {
  assert.equal(
    chooseBetterTargetCandidate({
      currentBytes: 390_000,
      candidateBytes: 420_000,
      targetBytes: 400_000,
    }),
    false,
  );
});

test("selects the smallest safe above-target candidate when needed", () => {
  assert.equal(
    chooseBetterTargetCandidate({
      currentBytes: 480_000,
      candidateBytes: 450_000,
      targetBytes: 400_000,
    }),
    true,
  );
});

test("bounded search moves toward stronger compression when output is too large", () => {
  const stronger = nextTargetStrength({
    currentStrength: 0.5,
    outputBytes: 600_000,
    targetBytes: 400_000,
    largestTooLargeStrength: 0.5,
    smallestSuccessfulStrength: null,
  });
  assert.ok(stronger > 0.5);
});

test("bounded search moves toward gentler compression after success", () => {
  const gentler = nextTargetStrength({
    currentStrength: 0.75,
    outputBytes: 350_000,
    targetBytes: 400_000,
    largestTooLargeStrength: 0.5,
    smallestSuccessfulStrength: 0.75,
  });
  assert.ok(gentler > 0.5 && gentler < 0.75);
});

test("maximum target search pass count stays bounded", () => {
  assert.equal(MAX_TARGET_PASSES, 6);
});

test("passes the explicit grayscale choice into a target request", () => {
  assert.deepEqual(createTargetCompressionRequest(400_000, true), {
    targetBytes: 400_000,
    grayscale: true,
  });
});

test("target parameters respect readability floors", () => {
  const strongest = parametersForStrength(1);
  assert.equal(strongest.dpi, 72);
  assert.equal(strongest.imageQuality, 0.37);
});

test("initial target parameters respond to page pressure", () => {
  const easy = initialTargetParameters(1_000_000, 700_000, 1);
  const hard = initialTargetParameters(1_000_000, 100_000, 8);
  assert.ok(hard.strength > easy.strength);
});

test("quality outlook includes the full target brief scale", () => {
  assert.equal(qualityOutlookForTarget(1_000_000, 800_000, 1), "Excellent");
  assert.equal(qualityOutlookForTarget(1_000_000, 500_000, 1), "Good");
  assert.equal(qualityOutlookForTarget(1_000_000, 350_000, 1), "Moderate");
  assert.equal(qualityOutlookForTarget(1_000_000, 260_000, 1), "Aggressive");
  assert.equal(qualityOutlookForTarget(1_000_000, 130_000, 1), "Extreme");
  assert.equal(qualityOutlookForTarget(1_000_000, 80_000, 8), "Unlikely");
});

test("preserves all existing quality profiles and settings", () => {
  assert.deepEqual(Object.keys(compressionProfiles), [
    "highQuality",
    "balanced",
    "smaller",
  ]);
  assert.equal(compressionProfiles.highQuality.label, "High quality");
  assert.equal(compressionProfiles.balanced.label, "Balanced");
  assert.equal(compressionProfiles.smaller.label, "Smaller file");
  assert.equal(compressionProfiles.highQuality.dpi, 220);
  assert.equal(compressionProfiles.balanced.dpi, 150);
  assert.equal(compressionProfiles.smaller.dpi, 96);
});
