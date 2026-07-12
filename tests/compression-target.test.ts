import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_TARGET_PASSES,
  chooseBetterTargetCandidate,
  chooseTargetOutcome,
  createTargetCompressionRequest,
  nextTargetStrength,
  targetValueToBytes,
  validateTargetBytes,
} from "../lib/compressionTarget.ts";
import { compressionProfiles } from "../lib/compressionProfiles.ts";

test("converts KB and MB targets to bytes", () => {
  assert.equal(targetValueToBytes(350, "KB"), 350 * 1024);
  assert.equal(targetValueToBytes(1.5, "MB"), 1.5 * 1024 * 1024);
});

test("rejects empty, negative, tiny, and non-reducing targets", () => {
  assert.match(validateTargetBytes(Number.NaN, 1_000_000), /positive/);
  assert.match(validateTargetBytes(-10, 1_000_000), /positive/);
  assert.match(validateTargetBytes(10 * 1024, 1_000_000), /at least 20 KB/);
  assert.match(validateTargetBytes(1_000_000, 1_000_000), /not smaller/);
});

test("only reports achieved when output is at or below target", () => {
  assert.equal(
    chooseTargetOutcome({
      targetBytes: 400_000,
      originalBytes: 2_000_000,
      bestUnderTargetBytes: 390_000,
      smallestCandidateBytes: 390_000,
    }),
    "achieved",
  );
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

test("selects the closest under-target candidate, otherwise the smallest", () => {
  assert.equal(
    chooseBetterTargetCandidate({
      currentBytes: 350_000,
      candidateBytes: 390_000,
      targetBytes: 400_000,
    }),
    true,
  );
  assert.equal(
    chooseBetterTargetCandidate({
      currentBytes: 390_000,
      candidateBytes: 420_000,
      targetBytes: 400_000,
    }),
    false,
  );
  assert.equal(
    chooseBetterTargetCandidate({
      currentBytes: 480_000,
      candidateBytes: 450_000,
      targetBytes: 400_000,
    }),
    true,
  );
});

test("bounded search moves toward stronger or gentler compression", () => {
  const stronger = nextTargetStrength({
    currentStrength: 0.5,
    outputBytes: 600_000,
    targetBytes: 400_000,
    largestTooLargeStrength: 0.5,
    smallestSuccessfulStrength: null,
  });
  const gentler = nextTargetStrength({
    currentStrength: 0.75,
    outputBytes: 350_000,
    targetBytes: 400_000,
    largestTooLargeStrength: 0.5,
    smallestSuccessfulStrength: 0.75,
  });
  assert.ok(stronger > 0.5);
  assert.ok(gentler > 0.5 && gentler < 0.75);
  assert.equal(MAX_TARGET_PASSES, 6);
});

test("passes the explicit grayscale choice into a target request", () => {
  assert.deepEqual(createTargetCompressionRequest(400_000, true), {
    targetBytes: 400_000,
    grayscale: true,
  });
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
