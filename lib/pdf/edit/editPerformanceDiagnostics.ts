export type EditPerformanceMetric =
  | "document-open"
  | "page-raster"
  | "text-detection"
  | "native-reconciliation"
  | "thumbnail-render"
  | "thumbnail-scroll"
  | "font-inspection"
  | "memory-snapshot";

export type EditPerformanceSample = {
  metric: EditPerformanceMetric;
  durationMs: number;
  pageIndex: number | null;
  pageCount: number | null;
  itemCount: number | null;
  byteCount: number | null;
  success: boolean;
};

export type EditPerformanceSummary = {
  metric: EditPerformanceMetric;
  count: number;
  successCount: number;
  totalDurationMs: number;
  averageDurationMs: number;
  maxDurationMs: number;
};

export const DEFAULT_EDIT_PERFORMANCE_SAMPLE_LIMIT = 256;

function finiteNonNegative(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

export function editPerformanceNow(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

export function browserUsedHeapBytes(): number | null {
  if (typeof performance === "undefined") return null;
  const memory = (
    performance as Performance & {
      memory?: { usedJSHeapSize?: number };
    }
  ).memory;
  const value = memory?.usedJSHeapSize;
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

/**
 * Bounded, browser-local diagnostics for Edit PDF performance.
 *
 * Samples contain timing/count metadata only: never file names, PDF bytes,
 * extracted text, font bytes, search terms or user-entered content.
 */
export class EditPerformanceDiagnostics {
  private readonly samples: EditPerformanceSample[] = [];
  private readonly maxSamples: number;

  constructor(maxSamples = DEFAULT_EDIT_PERFORMANCE_SAMPLE_LIMIT) {
    this.maxSamples = maxSamples;
  }

  record(
    metric: EditPerformanceMetric,
    durationMs: number,
    {
      pageIndex = null,
      pageCount = null,
      itemCount = null,
      byteCount = null,
      success = true,
    }: Partial<Omit<EditPerformanceSample, "metric" | "durationMs">> = {},
  ): EditPerformanceSample {
    const sample: EditPerformanceSample = {
      metric,
      durationMs: finiteNonNegative(durationMs) ?? 0,
      pageIndex: finiteNonNegative(pageIndex),
      pageCount: finiteNonNegative(pageCount),
      itemCount: finiteNonNegative(itemCount),
      byteCount: finiteNonNegative(byteCount),
      success,
    };
    this.samples.push(sample);
    const overflow = this.samples.length - Math.max(1, this.maxSamples);
    if (overflow > 0) this.samples.splice(0, overflow);
    return sample;
  }

  snapshot(): {
    samples: readonly EditPerformanceSample[];
    summaries: readonly EditPerformanceSummary[];
  } {
    const copied = this.samples.map((sample) => ({ ...sample }));
    const byMetric = new Map<EditPerformanceMetric, EditPerformanceSample[]>();
    for (const sample of copied) {
      const bucket = byMetric.get(sample.metric) ?? [];
      bucket.push(sample);
      byMetric.set(sample.metric, bucket);
    }
    const summaries = [...byMetric.entries()].map(([metric, bucket]) => {
      const totalDurationMs = bucket.reduce(
        (total, sample) => total + sample.durationMs,
        0,
      );
      return {
        metric,
        count: bucket.length,
        successCount: bucket.filter((sample) => sample.success).length,
        totalDurationMs,
        averageDurationMs: totalDurationMs / bucket.length,
        maxDurationMs: Math.max(...bucket.map((sample) => sample.durationMs)),
      };
    });
    return { samples: copied, summaries };
  }

  clear(): void {
    this.samples.length = 0;
  }
}

export const editPerformanceDiagnostics = new EditPerformanceDiagnostics();
