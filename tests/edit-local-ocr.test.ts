import assert from "node:assert/strict";
import test from "node:test";
import {
  LOCAL_OCR_MAX_PIXELS,
  LOCAL_OCR_TARGET_DPI,
  localOcrAssetConfig,
  localOcrConfidenceLabel,
  localOcrRenderScale,
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

test("local OCR targets 300 DPI but clamps oversized page pixel cost", () => {
  const a4Scale = localOcrRenderScale(595, 842);
  assert.ok(Math.abs(a4Scale - LOCAL_OCR_TARGET_DPI / 72) < 1e-9);
  const hugeScale = localOcrRenderScale(5000, 5000);
  assert.ok(hugeScale < a4Scale);
  assert.ok(5000 * hugeScale * 5000 * hugeScale <= LOCAL_OCR_MAX_PIXELS + 1);
});
