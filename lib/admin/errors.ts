import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { ErrorLog, ErrorSeverity, ErrorSource, ErrorStatus } from "@/lib/supabase/database.types";

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
  source?: ErrorSource;
  search?: string;
  route?: string;
  sort?: "recent" | "oldest" | "occurrences";
};

export type ErrorLogPage = {
  rows: ErrorLog[];
  total: number;
};

export async function getErrorLogPage(
  limit = 50,
  offset = 0,
  filters: ErrorLogFilters = {},
): Promise<DataResult<ErrorLogPage>> {
  const supabase = await createClient();
  let query = supabase
    .from("error_logs")
    .select("*", { count: "exact" });

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.severity) query = query.eq("severity", filters.severity);
  if (filters.source) query = query.eq("source", filters.source);
  if (filters.search) query = query.ilike("message", `%${filters.search}%`);
  if (filters.route) query = query.ilike("route", `%${filters.route}%`);

  if (filters.sort === "oldest") {
    query = query.order("last_seen_at", { ascending: true });
  } else if (filters.sort === "occurrences") {
    query = query
      .order("occurrence_count", { ascending: false })
      .order("last_seen_at", { ascending: false });
  } else {
    query = query.order("last_seen_at", { ascending: false });
  }

  const { data, error, count } = await query.range(offset, offset + limit - 1);
  return safe(
    {
      rows: (data ?? []) as ErrorLog[],
      total: count ?? 0,
    },
    error,
  );
}

export async function getErrorLogs(
  limit = 50,
  offset = 0,
  filters: ErrorLogFilters = {},
): Promise<DataResult<ErrorLog[]>> {
  const page = await getErrorLogPage(limit, offset, filters);
  return { data: page.data.rows, error: page.error };
}

export async function getUnresolvedErrorLogs(
  limit = 50,
  offset = 0,
): Promise<DataResult<ErrorLog[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("error_logs")
    .select("*")
    .in("status", ["open", "acknowledged", "fixed_pending_verification"])
    .order("last_seen_at", { ascending: false })
    .range(offset, offset + limit - 1);

  return safe((data ?? []) as ErrorLog[], error);
}

export type ErrorLogSummary = {
  openCount: number;
  criticalOpenCount: number;
  verifyingCount: number;
  verifiedResolvedCount: number;
  legacyResolvedCount: number;
  totalOccurrences: number;
};

export async function getErrorLogSummary(): Promise<DataResult<ErrorLogSummary>> {
  const supabase = await createClient();
  const unresolvedStatuses: ErrorStatus[] = [
    "open",
    "acknowledged",
    "fixed_pending_verification",
  ];
  const [
    openResult,
    criticalResult,
    verifyingResult,
    verifiedResolvedResult,
    legacyResolvedResult,
    allResult,
  ] = await Promise.all([
    supabase
      .from("error_logs")
      .select("id", { count: "exact", head: true })
      .in("status", unresolvedStatuses),
    supabase
      .from("error_logs")
      .select("id", { count: "exact", head: true })
      .in("status", unresolvedStatuses)
      .eq("severity", "critical"),
    supabase
      .from("error_logs")
      .select("id", { count: "exact", head: true })
      .eq("status", "fixed_pending_verification"),
    supabase
      .from("error_logs")
      .select("id", { count: "exact", head: true })
      .eq("status", "resolved")
      .in("resolution_provenance", ["verified_fix", "automated_verified_fix"]),
    supabase
      .from("error_logs")
      .select("id", { count: "exact", head: true })
      .eq("status", "resolved")
      .eq("resolution_provenance", "legacy_manual"),
    supabase.from("error_logs").select("occurrence_count"),
  ]);

  const hasError = Boolean(
    openResult.error ||
      criticalResult.error ||
      verifyingResult.error ||
      verifiedResolvedResult.error ||
      legacyResolvedResult.error ||
      allResult.error,
  );
  const totalOccurrences = (allResult.data ?? []).reduce(
    (sum, row) => sum + ((row as { occurrence_count: number }).occurrence_count ?? 0),
    0,
  );

  return safe(
    {
      openCount: openResult.count ?? 0,
      criticalOpenCount: criticalResult.count ?? 0,
      verifyingCount: verifyingResult.count ?? 0,
      verifiedResolvedCount: verifiedResolvedResult.count ?? 0,
      legacyResolvedCount: legacyResolvedResult.count ?? 0,
      totalOccurrences,
    },
    hasError,
  );
}
