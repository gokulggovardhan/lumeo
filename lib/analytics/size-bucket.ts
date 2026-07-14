import type { AnalyticsSizeBucket } from "@/lib/analytics/types";

const MB = 1024 * 1024;

export function bucketFileSize(bytes: number | null | undefined): AnalyticsSizeBucket {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) {
    return "unknown";
  }

  if (bytes < MB) return "under_1mb";
  if (bytes < 5 * MB) return "1mb_to_5mb";
  if (bytes < 20 * MB) return "5mb_to_20mb";
  if (bytes < 50 * MB) return "20mb_to_50mb";
  return "over_50mb";
}
