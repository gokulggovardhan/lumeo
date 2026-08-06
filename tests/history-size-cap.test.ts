import test from "node:test";
import assert from "node:assert/strict";
import { trimHistoryToSizeBudget } from "../lib/sign/useHistoryState.ts";

// Regression for Phase 9.3's production-readiness audit finding: Edit PDF's
// undo history can hold one full re-saved-PDF-bytes copy per text edit
// (unlike overlay-element edits, which reuse the same ArrayBuffer reference
// and cost nothing extra). The pre-existing entry-count cap (MAX_HISTORY=50
// in useHistoryState.ts) bounds the number of entries, but not their total
// byte footprint -- a session of many text edits on a large file could still
// grow undo memory unboundedly. trimHistoryToSizeBudget is the fix: drop the
// OLDEST entries first once the total exceeds a byte budget, same "oldest
// out first" eviction order the entry-count cap already uses.

test("trimHistoryToSizeBudget is a no-op when the stack is already under budget", () => {
  const stack = [10, 20, 30];
  const trimmed = trimHistoryToSizeBudget(stack, 1000, (n) => n);
  assert.deepEqual(trimmed, [10, 20, 30]);
});

test("trimHistoryToSizeBudget drops the oldest entries first until under budget", () => {
  const stack = [50, 50, 50, 50];
  const trimmed = trimHistoryToSizeBudget(stack, 120, (n) => n);
  // Dropping the two oldest (50, 50) brings the total from 200 to 100, which
  // fits; the two most recent entries survive, in their original order.
  assert.deepEqual(trimmed, [50, 50]);
});

test("trimHistoryToSizeBudget always keeps at least the single most recent entry, even over budget", () => {
  const stack = [10, 20, 500];
  const trimmed = trimHistoryToSizeBudget(stack, 50, (n) => n);
  assert.deepEqual(trimmed, [500]);
});

test("trimHistoryToSizeBudget never removes anything from a single-entry stack", () => {
  const stack = [999];
  const trimmed = trimHistoryToSizeBudget(stack, 1, (n) => n);
  assert.deepEqual(trimmed, [999]);
});

test("trimHistoryToSizeBudget on an empty stack returns an empty stack", () => {
  assert.deepEqual(trimHistoryToSizeBudget([], 1000, (n: number) => n), []);
});
