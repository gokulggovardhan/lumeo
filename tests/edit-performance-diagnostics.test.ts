import assert from "node:assert/strict";
import test from "node:test";
import {
  EditPerformanceDiagnostics,
  browserUsedHeapBytes,
  editPerformanceNow,
} from "../lib/pdf/edit/editPerformanceDiagnostics.ts";

test("EditPerformanceDiagnostics keeps only the newest bounded samples", () => {
  const diagnostics = new EditPerformanceDiagnostics(3);
  diagnostics.record("document-open", 10);
  diagnostics.record("page-raster", 20);
  diagnostics.record("text-detection", 30);
  diagnostics.record("native-reconciliation", 40);

  const snapshot = diagnostics.snapshot();
  assert.equal(snapshot.samples.length, 3);
  assert.deepEqual(
    snapshot.samples.map((sample) => sample.metric),
    ["page-raster", "text-detection", "native-reconciliation"],
  );
});

test("EditPerformanceDiagnostics stores metadata only and summarizes timings", () => {
  const diagnostics = new EditPerformanceDiagnostics(8);
  diagnostics.record("thumbnail-render", 12, {
    pageIndex: 4,
    pageCount: 300,
    itemCount: 1,
    byteCount: 2048,
    success: true,
  });
  diagnostics.record("thumbnail-render", 18, {
    pageIndex: 5,
    pageCount: 300,
    itemCount: 1,
    byteCount: 2048,
    success: false,
  });

  const snapshot = diagnostics.snapshot();
  assert.equal(snapshot.samples.length, 2);
  assert.deepEqual(snapshot.samples[0], {
    metric: "thumbnail-render",
    durationMs: 12,
    pageIndex: 4,
    pageCount: 300,
    itemCount: 1,
    byteCount: 2048,
    success: true,
  });

  const summary = snapshot.summaries.find(
    (entry) => entry.metric === "thumbnail-render",
  );
  assert.ok(summary);
  assert.equal(summary.count, 2);
  assert.equal(summary.successCount, 1);
  assert.equal(summary.totalDurationMs, 30);
  assert.equal(summary.averageDurationMs, 15);
  assert.equal(summary.maxDurationMs, 18);
});

test("editPerformanceNow returns a finite monotonic-clock compatible value", () => {
  const value = editPerformanceNow();
  assert.equal(Number.isFinite(value), true);
  assert.equal(value >= 0, true);
});


test("browserUsedHeapBytes is fail-safe when the runtime exposes no memory API", () => {
  const value = browserUsedHeapBytes();
  assert.equal(value === null || (Number.isFinite(value) && value >= 0), true);
});


test("EditPerformanceDiagnostics rejects an invalid bound instead of becoming unbounded", () => {
  assert.throws(
    () => new EditPerformanceDiagnostics(0),
    /positive integer/i,
  );
  assert.throws(
    () => new EditPerformanceDiagnostics(Number.NaN),
    /positive integer/i,
  );
});
