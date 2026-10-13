import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCompressionIntelligence,
  compressionSamplePageNumbers,
  wasCompressionPassTried,
} from "../lib/pdf/compressionIntelligence.ts";

test("samples first, middle and last without duplicates", () => {
  assert.deepEqual(compressionSamplePageNumbers(1), [1]);
  assert.deepEqual(compressionSamplePageNumbers(2), [1, 2]);
  assert.deepEqual(compressionSamplePageNumbers(20), [1, 10, 20]);
  assert.deepEqual(compressionSamplePageNumbers(0), []);
});

test("mixed text and JPEG content is identified from measured XObjects", () => {
  const result = buildCompressionIntelligence({
    totalBytes: 1_000_000, pageCount: 2, plainJpegPages: 2,
    plainJpegImageCount: 1, uniqueJpegBytes: 700_000,
    sampledTextPages: 2, sampledPages: 2, protectedStructure: false,
  });
  assert.equal(result.kind, "mixed");
  assert.equal(result.opportunity, "High");
  assert.equal(result.recommendation, "balanced");
  assert.equal(result.jpegByteShare, 0.7);
  assert.match(result.evidence, /2 of 2 pages/);
});

test("text-only document defaults to safe high quality", () => {
  const result = buildCompressionIntelligence({
    totalBytes: 300_000, pageCount: 4, plainJpegPages: 0,
    plainJpegImageCount: 0, uniqueJpegBytes: 0,
    sampledTextPages: 3, sampledPages: 3, protectedStructure: false,
  });
  assert.equal(result.kind, "text");
  assert.equal(result.opportunity, "Low");
  assert.equal(result.recommendation, "highQuality");
});

test("a scanned JPEG-only document is distinct from selectable text", () => {
  const result = buildCompressionIntelligence({
    totalBytes: 4_000_000, pageCount: 4, plainJpegPages: 4,
    plainJpegImageCount: 4, uniqueJpegBytes: 3_600_000,
    sampledTextPages: 0, sampledPages: 3, protectedStructure: false,
  });
  assert.equal(result.kind, "scanned");
  assert.equal(result.opportunity, "High");
});

test("protected documents are not promised an unsafe reduction", () => {
  const result = buildCompressionIntelligence({
    totalBytes: 2_000_000, pageCount: 2, plainJpegPages: 2,
    plainJpegImageCount: 2, uniqueJpegBytes: 1_900_000,
    sampledTextPages: 1, sampledPages: 2, protectedStructure: true,
  });
  assert.equal(result.opportunity, "Low");
  assert.equal(result.recommendation, "highQuality");
  assert.match(result.explanation, /retain the original unchanged/);
});

test("invalid signals do not produce NaN or inflated ratios", () => {
  const result = buildCompressionIntelligence({
    totalBytes: 0, pageCount: 0, plainJpegPages: Infinity,
    plainJpegImageCount: 0, uniqueJpegBytes: NaN,
    sampledTextPages: 0, sampledPages: 0, protectedStructure: false,
  });
  assert.equal(result.jpegByteShare, 0);
  assert.equal(result.jpegPageShare, 0);
});

test("skips identical compression settings but allows a new quality or DPI", () => {
  const attempts = [{ dpi: 150, imageQuality: 0.74 }];
  assert.equal(wasCompressionPassTried(attempts, 150, 0.74), true);
  assert.equal(wasCompressionPassTried(attempts, 150, 0.58), false);
  assert.equal(wasCompressionPassTried(attempts, 96, 0.74), false);
});
