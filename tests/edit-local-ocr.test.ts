import assert from "node:assert/strict";
import test from "node:test";
import {
  localOcrAssetConfig,
  localOcrConfidenceLabel,
} from "../lib/pdf/edit/localOcr.ts";

test("local OCR runtime assets are pinned to the supplied Lumeo origin", () => {
  const config = localOcrAssetConfig("https://lumeo.in/some/path");
  assert.equal(config.workerPath, "https://lumeo.in/tesseract/worker.min.js");
  assert.equal(config.corePath, "https://lumeo.in/tesseract/core");
  assert.equal(config.langPath, "https://lumeo.in/tesseract/lang");
  for (const value of Object.values(config)) {
    assert.equal(new URL(value).origin, "https://lumeo.in");
  }
});

test("local OCR confidence copy stays cautious rather than authorizing edits", () => {
  assert.equal(localOcrConfidenceLabel(95), "High confidence");
  assert.equal(localOcrConfidenceLabel(80), "Review recommended");
  assert.equal(localOcrConfidenceLabel(42), "Low confidence · review carefully");
  assert.equal(localOcrConfidenceLabel(null), "Confidence unavailable");
});
