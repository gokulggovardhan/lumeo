import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  MAX_TARGET_PASSES,
  chooseBetterTargetCandidate,
  chooseTargetOutcome,
  createTargetCompressionRequest,
  nextTargetStrength,
  shouldFallbackToOriginal,
  targetValueToBytes,
  validateTargetBytes,
} from "../lib/compressionTarget.ts";
import { compressionProfiles } from "../lib/compressionProfiles.ts";

const compressToolSource = readFileSync("components/pdf/CompressPdfTool.tsx", "utf8");

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

test("preserves Target Size Studio presets and profile quality values", () => {
  assert.ok(compressToolSource.includes("Target Size Studio"));
  assert.ok(compressToolSource.includes("Under 100 KB"));
  assert.ok(compressToolSource.includes("Under 200 KB"));
  assert.ok(compressToolSource.includes("Under 400 KB"));
  assert.ok(compressToolSource.includes("Target achieved"));
  assert.ok(compressToolSource.includes("Closest safe result"));
  assert.ok(compressToolSource.includes("Compression not beneficial"));
  assert.ok(compressToolSource.includes("Unable to process"));
  assert.ok(compressToolSource.includes("Grayscale"));
  assert.equal(compressionProfiles.highQuality.quality, 0.86);
  assert.equal(compressionProfiles.balanced.quality, 0.74);
  assert.equal(compressionProfiles.smaller.quality, 0.58);
});

test("shouldFallbackToOriginal flags any candidate that is not strictly smaller than the original", () => {
  assert.equal(shouldFallbackToOriginal(900_000, 1_000_000), false); // genuinely smaller
  assert.equal(shouldFallbackToOriginal(1_000_000, 1_000_000), true); // identical size -- no benefit, prefer the untouched original
  assert.equal(shouldFallbackToOriginal(1_500_000, 1_000_000), true); // the reported bug: recompression grew the file
});

test("CompressPdfTool falls back to the original bytes when a candidate is not smaller (regression for the reported 1MB -> 1.5MB bug)", () => {
  assert.ok(compressToolSource.includes("shouldFallbackToOriginal(outputBytes.byteLength, analysis.size)"));
  assert.ok(compressToolSource.includes("new Uint8Array(copyArrayBuffer(analysis.bytes))"));
});

test("CompressPdfTool preserves real text by copying text pages instead of rasterizing them (regression: compressing a text PDF then converting to Word produced an image-only, textless result)", () => {
  assert.ok(compressToolSource.includes("const textContent = await page.getTextContent();"));
  assert.ok(
    compressToolSource.includes(
      'item.str.trim().length > 0',
    ),
  );
  assert.ok(compressToolSource.includes("output.copyPages(sourcePdf, [pageIndex - 1])"));
});

test("CompressPdfTool explains a missed target size when it was caused by preserving real text", () => {
  assert.ok(compressToolSource.includes("textPagesPreserved: bestCandidateTextPagesPreserved"));
  assert.ok(
    compressToolSource.includes(
      "kept as-is instead of",
    ),
  );
});
