import assert from "node:assert/strict";
import test from "node:test";
import { hasRasterImageEvidence } from "../lib/pdf/edit/rasterImageEvidence.ts";

const OPS = {
  paintImageXObject: 10,
  paintInlineImageXObject: 11,
  paintImageMaskXObject: 12,
  paintSolidColorImageMask: 13,
};

test("raster image evidence requires an actually painted image operator", () => {
  assert.equal(hasRasterImageEvidence([1, 2, 10, 3], OPS), true);
  assert.equal(hasRasterImageEvidence([1, 2, 11, 3], OPS), true);
  assert.equal(hasRasterImageEvidence([1, 2, 12, 3], OPS), true);
  assert.equal(hasRasterImageEvidence([1, 2, 13, 3], OPS), true);
});

test("vector/text operator lists do not masquerade as scanned image evidence", () => {
  assert.equal(hasRasterImageEvidence([1, 2, 3, 4], OPS), false);
  assert.equal(hasRasterImageEvidence([], OPS), false);
});

test("missing optional PDF.js image op ids fail closed", () => {
  assert.equal(
    hasRasterImageEvidence([10, 11, 12, 13], {
      paintImageXObject: undefined,
      paintInlineImageXObject: undefined,
      paintImageMaskXObject: undefined,
      paintSolidColorImageMask: undefined,
    }),
    false,
  );
});
