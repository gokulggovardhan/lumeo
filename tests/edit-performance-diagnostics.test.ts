import assert from "node:assert/strict";
import test from "node:test";
import {
  EditPdfPerformanceCollector,
  readBrowserMemorySample,
} from "../lib/pdf/edit/performanceDiagnostics.ts";

test("EditPdfPerformanceCollector summarizes timings without changing document behavior", () => {
  const collector = new EditPdfPerformanceCollector(3, 2);
  collector.resetDocument({ fileSizeBytes: 4096, pageCount: 120 });
  collector.recordDuration("page-raster", 12, {
    pageNumber: 1,
    detail: { pixelCount: 1000 },
  });
  collector.recordDuration("page-raster", 18, { pageNumber: 2 });
  collector.recordDuration("text-detection", 7, { pageNumber: 2 });
  collector.setFontRegistrySnapshot({
    resolveCalls: 5,
    profileCacheHits: 3,
    profileCacheMisses: 2,
    programCacheHits: 1,
    programCacheMisses: 1,
    intelligenceCacheHits: 0,
    intelligenceCacheMisses: 0,
    browserFaceCacheHits: 1,
    browserFaceAttempts: 1,
    browserFaceLoads: 1,
    browserFaceFailures: 0,
  });

  const report = collector.report("2026-09-27T00:00:00.000Z");
  assert.equal(report.document.fileSizeBytes, 4096);
  assert.equal(report.document.pageCount, 120);
  assert.equal(report.durations["page-raster"].count, 2);
  assert.equal(report.durations["page-raster"].totalMs, 30);
  assert.equal(report.durations["page-raster"].averageMs, 15);
  assert.equal(report.durations["page-raster"].maxMs, 18);
  assert.equal(report.durations["text-detection"].lastMs, 7);
  assert.equal(report.fontRegistry?.profileCacheHits, 3);
  assert.equal(report.recentEvents.length, 3);
});

test("EditPdfPerformanceCollector bounds recent events and memory samples", () => {
  const collector = new EditPdfPerformanceCollector(2, 2);
  collector.resetDocument({ fileSizeBytes: 1 });
  collector.recordDuration("scroll-raf", 1);
  collector.recordDuration("scroll-raf", 2);
  collector.recordDuration("scroll-raf", 3);
  collector.recordMemory({
    atMs: 1,
    usedJsHeapBytes: 10,
    totalJsHeapBytes: 20,
    jsHeapLimitBytes: 100,
  });
  collector.recordMemory({
    atMs: 2,
    usedJsHeapBytes: 30,
    totalJsHeapBytes: 40,
    jsHeapLimitBytes: 100,
  });
  collector.recordMemory({
    atMs: 3,
    usedJsHeapBytes: 25,
    totalJsHeapBytes: 40,
    jsHeapLimitBytes: 100,
  });

  const report = collector.report();
  assert.deepEqual(
    report.recentEvents.map((event) => event.durationMs),
    [2, 3],
  );
  assert.equal(report.memory.samples.length, 2);
  assert.equal(report.memory.latest?.atMs, 3);
  assert.equal(report.memory.peakUsedJsHeapBytes, 30);
});

test("readBrowserMemorySample is fail-soft where performance.memory is unavailable", () => {
  const fake = {
    now: () => 42,
  } as unknown as Performance;
  assert.deepEqual(readBrowserMemorySample(fake), {
    atMs: 42,
    usedJsHeapBytes: null,
    totalJsHeapBytes: null,
    jsHeapLimitBytes: null,
  });
});
