export const EDIT_PDF_PERFORMANCE_SCHEMA_VERSION = 1 as const;

export type EditPdfPerformanceDurationKind =
  | "document-open"
  | "page-raster"
  | "text-detection"
  | "native-match"
  | "thumbnail-batch"
  | "scroll-raf";

export type EditPdfPerformanceDurationSummary = {
  count: number;
  totalMs: number;
  averageMs: number;
  maxMs: number;
  lastMs: number;
};

export type EditPdfMemorySample = {
  atMs: number;
  usedJsHeapBytes: number | null;
  totalJsHeapBytes: number | null;
  jsHeapLimitBytes: number | null;
};

export type EditPdfPerformanceEvent = {
  kind: EditPdfPerformanceDurationKind;
  durationMs: number;
  pageNumber: number | null;
  detail: Record<string, number | string | boolean | null>;
};

export type EditPdfFontRegistryPerformanceSnapshot = {
  resolveCalls: number;
  profileCacheHits: number;
  profileCacheMisses: number;
  programCacheHits: number;
  programCacheMisses: number;
  intelligenceCacheHits: number;
  intelligenceCacheMisses: number;
  browserFaceCacheHits: number;
  browserFaceAttempts: number;
  browserFaceLoads: number;
  browserFaceFailures: number;
};

export type EditPdfPerformanceReport = {
  schemaVersion: typeof EDIT_PDF_PERFORMANCE_SCHEMA_VERSION;
  generatedAtIso: string | null;
  document: {
    fileSizeBytes: number | null;
    pageCount: number | null;
  };
  durations: Record<
    EditPdfPerformanceDurationKind,
    EditPdfPerformanceDurationSummary
  >;
  recentEvents: readonly EditPdfPerformanceEvent[];
  memory: {
    latest: EditPdfMemorySample | null;
    peakUsedJsHeapBytes: number | null;
    samples: readonly EditPdfMemorySample[];
  };
  fontRegistry: EditPdfFontRegistryPerformanceSnapshot | null;
};

const DURATION_KINDS: readonly EditPdfPerformanceDurationKind[] = [
  "document-open",
  "page-raster",
  "text-detection",
  "native-match",
  "thumbnail-batch",
  "scroll-raf",
];

function emptySummary(): EditPdfPerformanceDurationSummary {
  return {
    count: 0,
    totalMs: 0,
    averageMs: 0,
    maxMs: 0,
    lastMs: 0,
  };
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

export class EditPdfPerformanceCollector {
  private readonly durations = new Map<
    EditPdfPerformanceDurationKind,
    EditPdfPerformanceDurationSummary
  >();
  private readonly events: EditPdfPerformanceEvent[] = [];
  private readonly memorySamples: EditPdfMemorySample[] = [];
  private fileSizeBytes: number | null = null;
  private pageCount: number | null = null;
  private fontRegistrySnapshot: EditPdfFontRegistryPerformanceSnapshot | null =
    null;

  private readonly maxRecentEvents: number;
  private readonly maxMemorySamples: number;

  constructor(maxRecentEvents = 200, maxMemorySamples = 100) {
    this.maxRecentEvents = maxRecentEvents;
    this.maxMemorySamples = maxMemorySamples;
    for (const kind of DURATION_KINDS) this.durations.set(kind, emptySummary());
  }

  resetDocument({
    fileSizeBytes,
    pageCount = null,
  }: {
    fileSizeBytes: number;
    pageCount?: number | null;
  }): void {
    this.fileSizeBytes = Math.max(0, fileSizeBytes);
    this.pageCount =
      pageCount === null ? null : Math.max(0, Math.floor(pageCount));
    this.events.length = 0;
    this.memorySamples.length = 0;
    this.fontRegistrySnapshot = null;
    for (const kind of DURATION_KINDS) {
      this.durations.set(kind, emptySummary());
    }
  }

  setPageCount(pageCount: number): void {
    this.pageCount = Math.max(0, Math.floor(pageCount));
  }

  recordDuration(
    kind: EditPdfPerformanceDurationKind,
    durationMs: number,
    {
      pageNumber = null,
      detail = {},
    }: {
      pageNumber?: number | null;
      detail?: Record<string, number | string | boolean | null>;
    } = {},
  ): void {
    const duration = finiteNonNegative(durationMs);
    const current = this.durations.get(kind) ?? emptySummary();
    const count = current.count + 1;
    const totalMs = current.totalMs + duration;
    this.durations.set(kind, {
      count,
      totalMs,
      averageMs: totalMs / count,
      maxMs: Math.max(current.maxMs, duration),
      lastMs: duration,
    });
    this.events.push({
      kind,
      durationMs: duration,
      pageNumber,
      detail: { ...detail },
    });
    if (this.events.length > this.maxRecentEvents) {
      this.events.splice(0, this.events.length - this.maxRecentEvents);
    }
  }

  recordMemory(sample: EditPdfMemorySample): void {
    this.memorySamples.push({
      atMs: finiteNonNegative(sample.atMs),
      usedJsHeapBytes:
        sample.usedJsHeapBytes === null
          ? null
          : finiteNonNegative(sample.usedJsHeapBytes),
      totalJsHeapBytes:
        sample.totalJsHeapBytes === null
          ? null
          : finiteNonNegative(sample.totalJsHeapBytes),
      jsHeapLimitBytes:
        sample.jsHeapLimitBytes === null
          ? null
          : finiteNonNegative(sample.jsHeapLimitBytes),
    });
    if (this.memorySamples.length > this.maxMemorySamples) {
      this.memorySamples.splice(
        0,
        this.memorySamples.length - this.maxMemorySamples,
      );
    }
  }

  setFontRegistrySnapshot(
    snapshot: EditPdfFontRegistryPerformanceSnapshot | null,
  ): void {
    this.fontRegistrySnapshot = snapshot ? { ...snapshot } : null;
  }

  report(generatedAtIso: string | null = null): EditPdfPerformanceReport {
    const durationReport = Object.fromEntries(
      DURATION_KINDS.map((kind) => [
        kind,
        { ...(this.durations.get(kind) ?? emptySummary()) },
      ]),
    ) as Record<
      EditPdfPerformanceDurationKind,
      EditPdfPerformanceDurationSummary
    >;
    const samples = this.memorySamples.map((sample) => ({ ...sample }));
    const used = samples
      .map((sample) => sample.usedJsHeapBytes)
      .filter((value): value is number => value !== null);

    return {
      schemaVersion: EDIT_PDF_PERFORMANCE_SCHEMA_VERSION,
      generatedAtIso,
      document: {
        fileSizeBytes: this.fileSizeBytes,
        pageCount: this.pageCount,
      },
      durations: durationReport,
      recentEvents: this.events.map((event) => ({
        ...event,
        detail: { ...event.detail },
      })),
      memory: {
        latest: samples.at(-1) ?? null,
        peakUsedJsHeapBytes: used.length > 0 ? Math.max(...used) : null,
        samples,
      },
      fontRegistry: this.fontRegistrySnapshot
        ? { ...this.fontRegistrySnapshot }
        : null,
    };
  }
}

export function readBrowserMemorySample(
  performanceObject: Performance,
): EditPdfMemorySample {
  const memory = (
    performanceObject as Performance & {
      memory?: {
        usedJSHeapSize?: number;
        totalJSHeapSize?: number;
        jsHeapSizeLimit?: number;
      };
    }
  ).memory;
  return {
    atMs: performanceObject.now(),
    usedJsHeapBytes:
      typeof memory?.usedJSHeapSize === "number" ? memory.usedJSHeapSize : null,
    totalJsHeapBytes:
      typeof memory?.totalJSHeapSize === "number"
        ? memory.totalJSHeapSize
        : null,
    jsHeapLimitBytes:
      typeof memory?.jsHeapSizeLimit === "number"
        ? memory.jsHeapSizeLimit
        : null,
  };
}


export function downloadEditPdfPerformanceReport(
  report: EditPdfPerformanceReport,
  fileName = "lumeo-edit-performance-diagnostics.json",
): void {
  if (
    typeof document === "undefined" ||
    typeof URL === "undefined" ||
    typeof Blob === "undefined"
  ) {
    throw new Error("Performance diagnostic downloads are only available in a browser.");
  }
  const blob = new Blob([JSON.stringify(report, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  anchor.click();
  URL.revokeObjectURL(url);
}
