import assert from "node:assert/strict";
import test from "node:test";
import { contiguousNativeTextSelectionRange } from "../components/pdf/edit/useNativeTextSelectionState.ts";

test("plain native-text selection always selects exactly the requested run", () => {
  assert.deepEqual(contiguousNativeTextSelectionRange(null, 4, false), [4]);
  assert.deepEqual(contiguousNativeTextSelectionRange(1, 4, false), [4]);
});

test("extended native-text selection grows inclusively from the anchor", () => {
  assert.deepEqual(contiguousNativeTextSelectionRange(2, 5, true), [2, 3, 4, 5]);
});

test("reverse extended native-text selection stays in document order", () => {
  assert.deepEqual(contiguousNativeTextSelectionRange(5, 2, true), [2, 3, 4, 5]);
});

test("extended selection without an anchor degrades to one run", () => {
  assert.deepEqual(contiguousNativeTextSelectionRange(null, 3, true), [3]);
});
