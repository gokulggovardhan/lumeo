import "server-only";

import { createClient } from "@/lib/supabase/server";
import { istIsoDate } from "@/lib/admin/timezone";
import { getVerifiedAnalytics, type VerifiedAnalytics } from "@/lib/admin/verified-analytics";
import type { AdminRole } from "@/lib/admin/types";
import type {
  Announcement,
  AuditLog,
  DailyToolMetric,
  FeedbackQuery,
  PdfTool,
  SeoSetting,
  SiteSetting,
  ToolCategory,
} from "@/lib/supabase/database.types";

type DataResult<T> = {
  data: T;
  error: string | null;
};

export type ToolWithCategory = PdfTool & {
  category_name: string | null;
  category_slug: string | null;
};

export type OverviewData = {
  enabledTools: number;
  maintenanceTools: number;
  activeAnnouncements: number;
  analyticsEventsToday: number;
  analyticsPageViewsToday: number;
  analyticsToolOpensToday: number;
  mostUsedTool: string | null;
  analyticsEnabled: boolean;
  analyticsDataStatus: "available" | "unavailable";
  latestAnalyticsEventAt: string | null;
  databaseReachable: boolean;
  recentAuditLogs: AuditLog[];
  tools: ToolWithCategory[];
};

export type AnalyticsSummary = {
  dataStatus: "available" | "unavailable";
  eventsToday: number;
  uniqueVisitorsToday: number;
  pageViewsToday: number;
  toolOpens: number;
  processingStarted: number;
  processingSucceeded: number;
  processingFailed: number;
  processingCancelled: number;
  unreconciledStarts: number;
  downloadsStarted: number;
  successRate: number | null;
  averageDurationMs: number | null;
  latestEventAt: string | null;
  dailyMetrics: DailyToolMetric[];
  sevenDayTotals: Array<{
    date: string;
    events: number;
    uniqueVisitors: number;
    pageViews: number;
    toolOpens: number;
    succeeded: number;
    failed: number;
    cancelled: number;
  }>;
  topToolsByOpens: Array<{ toolSlug: string; count: number }>;
  topToolsBySuccess: Array<{ toolSlug: string; count: number }>;
  errorSummary: Array<{ errorCode: string; count: number }>;
  failureStageSummary: Array<{ label: string; count: number }>;
  cancellationStageSummary: Array<{ label: string; count: number }>;
  deviceSummary: Array<{ label: string; count: number }>;
  browserSummary: Array<{ label: string; count: number }>;
  osSummary: Array<{ label: string; count: number }>;
  locationSummary: Array<{ label: string; count: number }>;
};

function safe<T>(data: T, error: unknown): DataResult<T> {
  return {
    data,
    error: error ? "Control Center data is temporarily unavailable." : null,
  };
}

function todayIsoDate() {
  return istIsoDate();
}

function sixDaysAgoIsoDate() {
  return istIsoDate(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000));
}

function isPublicAnalyticsEnabled(setting: SiteSetting | null | undefined) {
  const value = setting?.value;
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      "enabled" in value &&
      value.enabled === true,
  );
}

export async function getToolCategories(): Promise<DataResult<ToolCategory[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tool_categories")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  return safe((data ?? []) as ToolCategory[], error);
}

export async function getPdfTools(): Promise<DataResult<ToolWithCategory[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pdf_tools")
    .select("*, tool_categories(name, slug)")
    .order("name", { ascending: true });

  const tools = (data ?? []).map((row) => {
    const tool = row as PdfTool & { tool_categories?: { name?: string; slug?: string } | null };
    return {
      ...tool,
      category_name: tool.tool_categories?.name ?? null,
      category_slug: tool.tool_categories?.slug ?? null,
    };
  });

  return safe(tools, error);
}

export async function getAnnouncements(): Promise<DataResult<Announcement[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("announcements")
    .select("*")
    .order("created_at", { ascending: false });

  return safe((data ?? []) as Announcement[], error);
}

export async function getSeoSettings(): Promise<DataResult<SeoSetting[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("seo_settings")
    .select("*")
    .order("route", { ascending: true });

  return safe((data ?? []) as SeoSetting[], error);
}

export async function getSiteSettings(): Promise<DataResult<SiteSetting[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("site_settings")
    .select("*")
    .order("key", { ascending: true });

  return safe((data ?? []) as SiteSetting[], error);
}

export type AuditLogFilters = {
  action?: string;
  entityType?: string;
  startDate?: string;
  endDate?: string;
};

export async function getAuditLogs(
  limit = 50,
  offset = 0,
  filters: AuditLogFilters = {},
): Promise<DataResult<AuditLog[]>> {
  const supabase = await createClient();
  let query = supabase
    .from("audit_logs")
    .select("id, actor_user_id, actor_role, action, entity_type, entity_id, summary, changes, created_at")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (filters.action) query = query.ilike("action", `%${filters.action}%`);
  if (filters.entityType) query = query.eq("entity_type", filters.entityType);
  if (filters.startDate) query = query.gte("created_at", filters.startDate);
  if (filters.endDate) query = query.lt("created_at", filters.endDate);

  const { data, error } = await query;

  return safe((data ?? []) as AuditLog[], error);
}

export async function resolveAdminEmails(userIds: string[]): Promise<Record<string, string>> {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  if (uniqueIds.length === 0) return {};

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("resolve_admin_emails", { p_user_ids: uniqueIds });
  if (error || !Array.isArray(data)) return {};

  const map: Record<string, string> = {};
  for (const row of data) {
    if (isRecord(row)) {
      const userId = stringValue(row.user_id);
      const email = stringValue(row.email);
      if (userId && email) map[userId] = email;
    }
  }
  return map;
}

function unavailableAnalyticsSummary(): AnalyticsSummary {
  return {
    dataStatus: "unavailable",
    eventsToday: 0,
    uniqueVisitorsToday: 0,
    pageViewsToday: 0,
    toolOpens: 0,
    processingStarted: 0,
    processingSucceeded: 0,
    processingFailed: 0,
    processingCancelled: 0,
    unreconciledStarts: 0,
    downloadsStarted: 0,
    successRate: null,
    averageDurationMs: null,
    latestEventAt: null,
    dailyMetrics: [],
    sevenDayTotals: [],
    topToolsByOpens: [],
    topToolsBySuccess: [],
    errorSummary: [],
    failureStageSummary: [],
    cancellationStageSummary: [],
    deviceSummary: [],
    browserSummary: [],
    osSummary: [],
    locationSummary: [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : null;
}

function verifiedToLegacySummary(data: VerifiedAnalytics): AnalyticsSummary {
  const summary = data.summary;
  const completed = summary.processingSucceeded + summary.processingFailed;
  const totalEvents =
    summary.pageViews +
    summary.toolOpens +
    summary.processingStarted +
    summary.processingSucceeded +
    summary.processingFailed +
    summary.processingCancelled +
    summary.downloadsStarted;

  return {
    dataStatus: data.dataStatus,
    eventsToday: totalEvents,
    uniqueVisitorsToday: summary.uniqueVisitors,
    pageViewsToday: summary.pageViews,
    toolOpens: summary.toolOpens,
    processingStarted: summary.processingStarted,
    processingSucceeded: summary.processingSucceeded,
    processingFailed: summary.processingFailed,
    processingCancelled: summary.processingCancelled,
    unreconciledStarts: Math.max(
      0,
      summary.processingStarted -
        summary.processingSucceeded -
        summary.processingFailed -
        summary.processingCancelled,
    ),
    downloadsStarted: summary.downloadsStarted,
    successRate:
      completed > 0
        ? Math.round((summary.processingSucceeded / completed) * 1000) / 10
        : null,
    averageDurationMs: summary.averageDurationMs,
    latestEventAt: summary.latestEventAt,
    dailyMetrics: data.daily.map((row) => ({
      metric_date: row.date,
      tool_slug: "all",
      tool_opens: row.toolOpens,
      processing_started: row.processingStarted,
      processing_succeeded: row.processingSucceeded,
      processing_failed: row.processingFailed,
      total_duration_ms: 0,
    })),
    sevenDayTotals: data.daily.map((row) => ({
      date: row.date,
      events:
        row.pageViews +
        row.toolOpens +
        row.processingStarted +
        row.processingSucceeded +
        row.processingFailed +
        row.processingCancelled +
        row.downloadsStarted,
      uniqueVisitors: row.uniqueVisitors,
      pageViews: row.pageViews,
      toolOpens: row.toolOpens,
      succeeded: row.processingSucceeded,
      failed: row.processingFailed,
      cancelled: row.processingCancelled,
    })),
    topToolsByOpens: data.topToolsByOpens,
    topToolsBySuccess: data.topToolsBySuccess,
    errorSummary: data.errorSummary.map((item) => ({
      errorCode: item.label,
      count: item.count,
    })),
    failureStageSummary: data.failureStageSummary,
    cancellationStageSummary: data.cancellationStageSummary,
    deviceSummary: data.deviceSummary,
    browserSummary: data.browserSummary,
    osSummary: data.osSummary,
    locationSummary: data.locations.map((item) => ({
      label: item.label,
      count: item.pageViews,
    })),
  };
}

export async function getAnalyticsSummary(
  range?: { startDate: string; endDate: string },
): Promise<DataResult<AnalyticsSummary>> {
  if (range) {
    const verified = await getVerifiedAnalytics(range, "real_audience");
    return verified.error
      ? safe(unavailableAnalyticsSummary(), verified.error)
      : safe(verifiedToLegacySummary(verified.data), null);
  }

  const today = todayIsoDate();
  const sevenDaysAgo = sixDaysAgoIsoDate();
  const [todayResult, trendResult] = await Promise.all([
    getVerifiedAnalytics({ startDate: today, endDate: today }, "real_audience"),
    getVerifiedAnalytics({ startDate: sevenDaysAgo, endDate: today }, "real_audience"),
  ]);

  if (todayResult.error) {
    return safe(unavailableAnalyticsSummary(), todayResult.error);
  }

  const todaySummary = verifiedToLegacySummary(todayResult.data);
  const trendSummary = trendResult.error
    ? todaySummary
    : verifiedToLegacySummary(trendResult.data);

  return safe(
    {
      ...todaySummary,
      sevenDayTotals: trendSummary.sevenDayTotals,
      dailyMetrics: trendSummary.dailyMetrics,
      locationSummary: trendSummary.locationSummary,
    },
    null,
  );
}

export type RecentAnalyticsEvent = {
  occurredAt: string;
  eventName: string;
  toolSlug: string | null;
  deviceClass: string;
  browserFamily: string;
  operatingSystem: string;
  locationLabel: string;
  success: boolean | null;
};

export type RecentActivityRow =
  | { kind: "event"; event: RecentAnalyticsEvent }
  | { kind: "unknown_location_burst"; count: number; latestAt: string; earliestAt: string };

// Bots, ad blockers, and requests that arrive without the geo cookie yet
// (first hit before it's set, or requests without Cloudflare geo metadata) all land as
// "Unknown location" -- in bursts, they drown out the events that actually
// have somewhere to show. Collapses each consecutive run of unknown-location
// events (list is already newest-first) into one summary row instead of
// listing every one individually; events with a real location are always
// shown on their own.
export function collapseUnknownLocationRuns(events: RecentAnalyticsEvent[]): RecentActivityRow[] {
  const rows: RecentActivityRow[] = [];
  let i = 0;

  while (i < events.length) {
    const event = events[i];
    if (event.locationLabel !== "Unknown location") {
      rows.push({ kind: "event", event });
      i += 1;
      continue;
    }

    let j = i;
    while (j < events.length && events[j].locationLabel === "Unknown location") j += 1;
    const run = events.slice(i, j);

    if (run.length === 1) {
      rows.push({ kind: "event", event: run[0] });
    } else {
      rows.push({
        kind: "unknown_location_burst",
        count: run.length,
        latestAt: run[0].occurredAt,
        earliestAt: run[run.length - 1].occurredAt,
      });
    }
    i = j;
  }

  return rows;
}

export async function getOverviewData(): Promise<DataResult<OverviewData>> {
  const supabase = await createClient();
  const [
    toolsResult,
    announcementsResult,
    auditResult,
    analyticsResult,
    analyticsSettingResult,
  ] = await Promise.all([
    getPdfTools(),
    getAnnouncements(),
    getAuditLogs(5),
    getAnalyticsSummary(),
    supabase
      .from("site_settings")
      .select("value")
      .eq("key", "public_analytics_enabled")
      .maybeSingle(),
  ]);

  const tools = toolsResult.data;
  const announcements = announcementsResult.data;

  return safe(
    {
      enabledTools: tools.filter((tool) => tool.is_enabled).length,
      maintenanceTools: tools.filter((tool) => tool.status === "maintenance").length,
      activeAnnouncements: announcements.filter((announcement) => announcement.is_active).length,
      analyticsEventsToday: analyticsResult.data.eventsToday,
      analyticsPageViewsToday: analyticsResult.data.pageViewsToday,
      analyticsToolOpensToday: analyticsResult.data.toolOpens,
      mostUsedTool: analyticsResult.data.topToolsByOpens[0]?.toolSlug ?? null,
      analyticsEnabled: isPublicAnalyticsEnabled(
        analyticsSettingResult.data as SiteSetting | null,
      ),
      analyticsDataStatus: analyticsResult.data.dataStatus,
      latestAnalyticsEventAt: analyticsResult.data.latestEventAt,
      databaseReachable: !toolsResult.error,
      recentAuditLogs: auditResult.data,
      tools,
    },
    toolsResult.error ??
      announcementsResult.error ??
      auditResult.error ??
      analyticsResult.error ??
      analyticsSettingResult.error,
  );
}

export type AdminMemberView = {
  userId: string;
  email: string | null;
  role: AdminRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  lastSignInAt: string | null;
};

function parseAdminMembers(value: unknown): AdminMemberView[] {
  if (!Array.isArray(value)) return [];
  const rows: AdminMemberView[] = [];
  for (const row of value) {
    if (!isRecord(row)) continue;
    const userId = stringValue(row.user_id);
    const role = row.role;
    if (!userId || (role !== "owner" && role !== "admin" && role !== "analyst")) continue;
    rows.push({
      userId,
      email: stringValue(row.email),
      role,
      isActive: row.is_active === true,
      createdAt: stringValue(row.created_at) ?? "",
      updatedAt: stringValue(row.updated_at) ?? "",
      lastSignInAt: stringValue(row.last_sign_in_at),
    });
  }
  return rows;
}

export async function getAdminMembers(): Promise<DataResult<AdminMemberView[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_admin_members");

  if (error) return safe([], error);
  return safe(parseAdminMembers(data), null);
}

export async function getFeedbackQueries(limit = 25, offset = 0): Promise<DataResult<FeedbackQuery[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("feedback_queries")
    .select("id, type, name, email, phone, subject, message, location, is_read, created_at")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    // The client only ever sees a generic "unavailable" message (safe() below
    // strips detail by design); the real cause -- most commonly the table
    // missing because a migration didn't apply -- goes to server logs only.
    console.error("getFeedbackQueries failed:", error.message);
  }

  return safe((data ?? []) as FeedbackQuery[], error);
}

export async function getUnreadInboxCount(): Promise<DataResult<number>> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("feedback_queries")
    .select("id", { count: "exact", head: true })
    .eq("is_read", false);

  if (error) {
    console.error("getUnreadInboxCount failed:", error.message);
  }

  return safe(count ?? 0, error);
}
