import assert from "node:assert/strict";
import test from "node:test";
import { contiguousRunRange } from "../components/pdf/edit/useNativeTextSelectionState.ts";

test("contiguousRunRange starts a fresh single-run selection", () => {
  assert.deepEqual(contiguousRunRange(null, 4, false), [4]);
  assert.deepEqual(contiguousRunRange(2, 4, false), [4]);
});

test("contiguousRunRange extends forward from the existing anchor", () => {
  assert.deepEqual(contiguousRunRange(2, 5, true), [2, 3, 4, 5]);
});

test("contiguousRunRange extends backward while preserving document order", () => {
  assert.deepEqual(contiguousRunRange(5, 2, true), [2, 3, 4, 5]);
});

test("contiguousRunRange without an anchor remains a single-run selection", () => {
  assert.deepEqual(contiguousRunRange(null, 7, true), [7]);
});
