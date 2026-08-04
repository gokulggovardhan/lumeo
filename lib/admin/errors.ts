import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { ErrorLog, ErrorSeverity, ErrorStatus } from "@/lib/supabase/database.types";

type DataResult<T> = {
  data: T;
  error: string | null;
};

function safe<T>(data: T, error: unknown): DataResult<T> {
  return {
    data,
    error: error ? "Error log data is temporarily unavailable." : null,
  };
}

export type ErrorLogFilters = {
  status?: ErrorStatus;
  severity?: ErrorSeverity;
  search?: string;
};

export async function getErrorLogs(
  limit = 50,
  offset = 0,
  filters: ErrorLogFilters = {},
): Promise<DataResult<ErrorLog[]>> {
  const supabase = await createClient();
  let query = supabase
    .from("error_logs")
    .select("*")
    .order("last_seen_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.severity) query = query.eq("severity", filters.severity);
  if (filters.search) query = query.ilike("message", `%${filters.search}%`);

  const { data, error } = await query;

  return safe((data ?? []) as ErrorLog[], error);
}

export type ErrorLogSummary = {
  openCount: number;
  criticalOpenCount: number;
  resolvedCount: number;
  totalOccurrences: number;
};

export async function getErrorLogSummary(): Promise<DataResult<ErrorLogSummary>> {
  const supabase = await createClient();
  const [openResult, criticalResult, resolvedResult, allResult] = await Promise.all([
    supabase.from("error_logs").select("id", { count: "exact", head: true }).eq("status", "open"),
    supabase.from("error_logs").select("id", { count: "exact", head: true }).eq("status", "open").eq("severity", "critical"),
    supabase.from("error_logs").select("id", { count: "exact", head: true }).eq("status", "resolved"),
    supabase.from("error_logs").select("occurrence_count"),
  ]);

  const hasError = Boolean(openResult.error || criticalResult.error || resolvedResult.error || allResult.error);
  const totalOccurrences = (allResult.data ?? []).reduce(
    (sum, row) => sum + ((row as { occurrence_count: number }).occurrence_count ?? 0),
    0,
  );

  return safe(
    {
      openCount: openResult.count ?? 0,
      criticalOpenCount: criticalResult.count ?? 0,
      resolvedCount: resolvedResult.count ?? 0,
      totalOccurrences,
    },
    hasError,
  );
}
