import "server-only";

import { createClient } from "@/lib/supabase/server";
import { formatLocationLabel } from "@/lib/analytics/location-names";
import { istIsoDate } from "@/lib/admin/timezone";
import type { AdminContext, AdminRole } from "@/lib/admin/types";
import type {
  Announcement,
  AdminAnalyticsSummaryResult,
  AuditLog,
  DailyToolMetric,
  FeatureFlag,
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
  enabledFeatureFlags: number;
  auditActions24h: number;
  analyticsEventsToday: number;
  analyticsPageViewsToday: number;
  analyticsToolOpensToday: number;
  mostUsedTool: string | null;
  analyticsEnabled: boolean;
  analyticsDataStatus: "available" | "unavailable";
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
  }>;
  topToolsByOpens: Array<{ toolSlug: string; count: number }>;
  topToolsBySuccess: Array<{ toolSlug: string; count: number }>;
  errorSummary: Array<{ errorCode: string; count: number }>;
  deviceSummary: Array<{ label: string; count: number }>;
  browserSummary: Array<{ label: string; count: number }>;
  osSummary: Array<{ label: string; count: number }>;
  locationSummary: Array<{ label: string; count: number }>;
};

export type SystemStatus = {
  supabaseConfigured: boolean;
  supabaseReachable: boolean;
  authenticatedAdmin: boolean;
  activeRole: string | null;
  appVersion: string;
  deploymentEnvironment: string;
  currentTimestamp: string;
  analyticsCollectionStatus: "schema-ready";
  analyticsEnabled: boolean;
  adminAnalyticsRpcStatus: "available" | "unavailable";
  latestAnalyticsEventAt: string | null;
  latestDailyMetricDate: string | null;
  latestAuditAt: string | null;
  toolCatalogCount: number;
  homepageSlotCount: number;
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

function yesterdayIso() {
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
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

export async function getFeatureFlags(): Promise<DataResult<FeatureFlag[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("feature_flags")
    .select("*")
    .order("environment", { ascending: true })
    .order("key", { ascending: true });

  return safe((data ?? []) as FeatureFlag[], error);
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
    downloadsStarted: 0,
    successRate: null,
    averageDurationMs: null,
    latestEventAt: null,
    dailyMetrics: [],
    sevenDayTotals: [],
    topToolsByOpens: [],
    topToolsBySuccess: [],
    errorSummary: [],
    deviceSummary: [],
    browserSummary: [],
    osSummary: [],
    locationSummary: [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : null;
}

function parseCount(value: unknown) {
  return numberValue(value) ?? 0;
}

function parseToolRows(value: unknown) {
  if (!Array.isArray(value)) return null;
  const rows: Array<{ toolSlug: string; count: number }> = [];
  for (const row of value) {
    if (!isRecord(row)) return null;
    const toolSlug = stringValue(row.tool_slug);
    const count = numberValue(row.event_count);
    if (!toolSlug || count === null) return null;
    rows.push({ toolSlug, count });
  }
  return rows;
}

function parseCategoryRows(value: unknown, key: string) {
  if (!Array.isArray(value)) return null;
  const rows: Array<{ label: string; count: number }> = [];
  for (const row of value) {
    if (!isRecord(row)) return null;
    const label = stringValue(row[key]);
    const count = numberValue(row.event_count);
    if (!label || count === null) return null;
    rows.push({ label, count });
  }
  return rows;
}

function parseLocationRows(value: unknown) {
  if (!Array.isArray(value)) return null;
  const rows: Array<{ label: string; count: number }> = [];
  for (const row of value) {
    if (!isRecord(row)) return null;
    const count = numberValue(row.visitor_count);
    if (count === null) return null;
    const city = stringValue(row.city);
    const region = stringValue(row.region);
    const country = stringValue(row.country_code);
    const label = formatLocationLabel(city, region, country);
    rows.push({ label, count });
  }
  return rows;
}

function parseErrorRows(value: unknown) {
  if (!Array.isArray(value)) return null;
  const rows: Array<{ errorCode: string; count: number }> = [];
  for (const row of value) {
    if (!isRecord(row)) return null;
    const errorCode = stringValue(row.error_code);
    const count = numberValue(row.event_count);
    if (!errorCode || count === null) return null;
    rows.push({ errorCode, count });
  }
  return rows;
}

function parseDailyRows(value: unknown) {
  if (!Array.isArray(value)) return null;
  const rows: Array<{
    date: string;
    events: number;
    uniqueVisitors: number;
    succeeded: number;
    failed: number;
    toolOpens: number;
    processingStarted: number;
    downloadsStarted: number;
    pageViews: number;
  }> = [];
  for (const row of value) {
    if (!isRecord(row)) return null;
    const date = stringValue(row.date);
    if (!date) return null;
    const events = parseCount(row.total_events);
    const uniqueVisitors = parseCount(row.unique_visitors);
    const toolOpens = parseCount(row.tool_opens);
    const processingStarted = parseCount(row.processing_started);
    const succeeded = parseCount(row.processing_succeeded);
    const failed = parseCount(row.processing_failed);
    const downloadsStarted = parseCount(row.downloads_started);
    rows.push({
      date,
      events,
      uniqueVisitors,
      succeeded,
      failed,
      toolOpens,
      processingStarted,
      downloadsStarted,
      pageViews: Math.max(
        0,
        events -
          toolOpens -
          processingStarted -
          succeeded -
          failed -
          downloadsStarted,
      ),
    });
  }
  return rows;
}

function parseAdminAnalyticsSummary(value: unknown): AnalyticsSummary | null {
  if (!isRecord(value) || !isRecord(value.summary)) return null;

  const dailyRows = parseDailyRows(value.daily_trend);
  const topToolsByOpens = parseToolRows(value.top_tools_by_opens);
  const topToolsBySuccess = parseToolRows(value.top_tools_by_success);
  const errorSummary = parseErrorRows(value.error_summary);
  const deviceSummary = parseCategoryRows(value.device_summary, "device_class");
  const browserSummary = parseCategoryRows(value.browser_summary, "browser_family");
  const osSummary = parseCategoryRows(value.operating_system_summary, "operating_system");
  // Falls back to [] rather than failing the whole parse: this field only
  // exists after 20260719_017 is applied, and an unrelated-but-unmigrated
  // database shouldn't take the rest of a working analytics page down.
  const locationSummary = parseLocationRows(value.location_summary) ?? [];

  if (
    !dailyRows ||
    !topToolsByOpens ||
    !topToolsBySuccess ||
    !errorSummary ||
    !deviceSummary ||
    !browserSummary ||
    !osSummary
  ) {
    return null;
  }

  const processingSucceeded = parseCount(value.summary.processing_succeeded);
  const processingFailed = parseCount(value.summary.processing_failed);
  const eventsToday = parseCount(value.summary.total_events);
  const uniqueVisitorsToday = parseCount(value.summary.unique_visitors);
  const toolOpens = parseCount(value.summary.tool_opens);
  const processingStarted = parseCount(value.summary.processing_started);
  const downloadsStarted = parseCount(value.summary.downloads_started);
  const completed = processingSucceeded + processingFailed;
  const averageDuration = value.summary.average_successful_duration_ms;
  const successfulDurationTotal = parseCount(value.summary.successful_duration_total_ms);
  const pageViewsToday = Math.max(
    0,
    eventsToday -
      toolOpens -
      processingStarted -
      processingSucceeded -
      processingFailed -
      downloadsStarted,
  );

  return {
    dataStatus: "available",
    eventsToday,
    uniqueVisitorsToday,
    pageViewsToday,
    toolOpens,
    processingStarted,
    processingSucceeded,
    processingFailed,
    downloadsStarted,
    successRate: completed > 0 ? Math.round((processingSucceeded / completed) * 1000) / 10 : null,
    averageDurationMs: numberValue(averageDuration),
    latestEventAt: stringValue(value.summary.latest_event_at),
    dailyMetrics: dailyRows.map((row) => ({
      metric_date: row.date,
      tool_slug: "all",
      tool_opens: row.toolOpens,
      processing_started: row.processingStarted,
      processing_succeeded: row.succeeded,
      processing_failed: row.failed,
      total_duration_ms: successfulDurationTotal,
    })),
    sevenDayTotals: dailyRows.map((row) => ({
      date: row.date,
      events: row.events,
      uniqueVisitors: row.uniqueVisitors,
      pageViews: row.pageViews,
      toolOpens: row.toolOpens,
      succeeded: row.succeeded,
      failed: row.failed,
    })),
    topToolsByOpens: topToolsByOpens.map((row) => ({
      toolSlug: row.toolSlug,
      count: row.count,
    })),
    topToolsBySuccess: topToolsBySuccess.map((row) => ({
      toolSlug: row.toolSlug,
      count: row.count,
    })),
    errorSummary: errorSummary.map((row) => ({
      errorCode: row.errorCode,
      count: row.count,
    })),
    deviceSummary: deviceSummary.map((row) => ({
      label: row.label,
      count: row.count,
    })),
    browserSummary: browserSummary.map((row) => ({
      label: row.label,
      count: row.count,
    })),
    osSummary: osSummary.map((row) => ({
      label: row.label,
      count: row.count,
    })),
    locationSummary: locationSummary.map((row) => ({
      label: row.label,
      count: row.count,
    })),
  };
}

export async function getAnalyticsSummary(): Promise<DataResult<AnalyticsSummary>> {
  const supabase = await createClient();
  const today = todayIsoDate();
  const sevenDaysAgo = sixDaysAgoIsoDate();

  // Two calls, not one: the RPC scopes both its "today" summary numbers and its
  // daily_trend array off the same start/end range. A single 7-day-wide call
  // would silently turn "Events Today" into a 7-day sum; a single today-only
  // call (the prior behavior) silently turned "seven-day trend" into one day.
  const [todayResult, trendResult] = await Promise.all([
    supabase.rpc("get_admin_analytics_summary", { p_start_date: today, p_end_date: today }),
    supabase.rpc("get_admin_analytics_summary", { p_start_date: sevenDaysAgo, p_end_date: today }),
  ]);

  if (todayResult.error) {
    return safe(unavailableAnalyticsSummary(), todayResult.error);
  }

  const parsedToday = parseAdminAnalyticsSummary(todayResult.data as AdminAnalyticsSummaryResult | unknown);
  if (!parsedToday) {
    return safe(unavailableAnalyticsSummary(), new Error("Malformed admin analytics aggregate."));
  }

  // The trend call is best-effort: if it fails or is malformed, still return
  // today's real numbers rather than hiding the whole dashboard behind it.
  const parsedTrend = trendResult.error
    ? null
    : parseAdminAnalyticsSummary(trendResult.data as AdminAnalyticsSummaryResult | unknown);

  return safe(
    {
      ...parsedToday,
      sevenDayTotals: parsedTrend?.sevenDayTotals ?? parsedToday.sevenDayTotals,
      dailyMetrics: parsedTrend?.dailyMetrics ?? parsedToday.dailyMetrics,
      // Locations are sparse per-day -- scope this to the same 7-day window
      // as the trend, not the single "today" range, or the panel reads empty
      // on any day with little UTC-day traffic yet.
      locationSummary: parsedTrend?.locationSummary ?? parsedToday.locationSummary,
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

function parseRecentEvents(value: unknown): RecentAnalyticsEvent[] {
  if (!Array.isArray(value)) return [];
  const rows: RecentAnalyticsEvent[] = [];
  for (const row of value) {
    if (!isRecord(row)) continue;
    const occurredAt = stringValue(row.occurred_at);
    const eventName = stringValue(row.event_name);
    if (!occurredAt || !eventName) continue;

    rows.push({
      occurredAt,
      eventName,
      toolSlug: stringValue(row.tool_slug),
      deviceClass: stringValue(row.device_class) ?? "unknown",
      browserFamily: stringValue(row.browser_family) ?? "Unknown",
      operatingSystem: stringValue(row.operating_system) ?? "Unknown",
      locationLabel: formatLocationLabel(
        stringValue(row.city),
        stringValue(row.region),
        stringValue(row.country_code),
      ),
      success: typeof row.success === "boolean" ? row.success : null,
    });
  }
  return rows;
}

// The aggregate `location_summary` in getAnalyticsSummary answers "where are
// visitors from, in general" (top 15, grouped, distinct-visitor-ranked).
// This answers "where did each individual recent click come from" -- a raw,
// most-recent-first feed, capped at `limit`. Same privacy scope as
// everywhere else: no session id, no IP, no precise coordinates.
export async function getRecentAnalyticsEvents(limit = 200): Promise<DataResult<RecentAnalyticsEvent[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_admin_recent_analytics_events", { p_limit: limit });

  if (error) return safe([], error);
  return safe(parseRecentEvents(data), null);
}

export type RecentActivityRow =
  | { kind: "event"; event: RecentAnalyticsEvent }
  | { kind: "unknown_location_burst"; count: number; latestAt: string; earliestAt: string };

// Bots, ad blockers, and requests that arrive without the geo cookie yet
// (first hit before it's set, or non-Vercel environments) all land as
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
  const [toolsResult, announcementsResult, flagsResult, auditResult, analyticsResult] =
    await Promise.all([
      getPdfTools(),
      getAnnouncements(),
      getFeatureFlags(),
      getAuditLogs(5),
      getAnalyticsSummary(),
    ]);

  const tools = toolsResult.data;
  const announcements = announcementsResult.data;
  const flags = flagsResult.data;
  const since = yesterdayIso();
  const { count: auditActions24h, error: auditCountError } = await supabase
    .from("audit_logs")
    .select("id", { count: "exact", head: true })
    .gte("created_at", since);

  return safe(
    {
      enabledTools: tools.filter((tool) => tool.is_enabled).length,
      maintenanceTools: tools.filter((tool) => tool.status === "maintenance").length,
      activeAnnouncements: announcements.filter((announcement) => announcement.is_active).length,
      enabledFeatureFlags: flags.filter((flag) => flag.is_enabled).length,
      auditActions24h: auditActions24h ?? 0,
      analyticsEventsToday: analyticsResult.data.eventsToday,
      analyticsPageViewsToday: analyticsResult.data.pageViewsToday,
      analyticsToolOpensToday: analyticsResult.data.toolOpens,
      mostUsedTool: analyticsResult.data.topToolsByOpens[0]?.toolSlug ?? null,
      analyticsEnabled: analyticsResult.data.dataStatus === "available",
      analyticsDataStatus: analyticsResult.data.dataStatus,
      recentAuditLogs: auditResult.data,
      tools,
    },
    toolsResult.error ??
      announcementsResult.error ??
      flagsResult.error ??
      auditResult.error ??
      analyticsResult.error ??
      auditCountError,
  );
}

export async function getSystemStatus(admin: AdminContext): Promise<DataResult<SystemStatus>> {
  const supabase = await createClient();
  const [
    { count: toolCount, error: toolError },
    { count: slotCount, error: slotError },
    auditResult,
    analyticsSummaryResult,
    dailyMetricResult,
    analyticsSettingResult,
  ] =
    await Promise.all([
      supabase.from("pdf_tools").select("id", { count: "exact", head: true }),
      supabase.from("homepage_tool_slots").select("slot_number", { count: "exact", head: true }),
      supabase
        .from("audit_logs")
        .select("created_at")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      getAnalyticsSummary(),
      supabase
        .from("daily_tool_metrics")
        .select("metric_date")
        .order("metric_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("site_settings")
        .select("key, value, description, is_public, updated_by, updated_at")
        .eq("key", "public_analytics_enabled")
        .maybeSingle(),
    ]);

  return safe(
    {
      supabaseConfigured: true,
      supabaseReachable: !toolError && !slotError,
      authenticatedAdmin: admin.authenticated && admin.authorized,
      activeRole: admin.role,
      appVersion: process.env.npm_package_version ?? "0.1.0",
      deploymentEnvironment: process.env.VERCEL_ENV ?? "local",
      currentTimestamp: new Date().toISOString(),
      analyticsCollectionStatus: "schema-ready",
      analyticsEnabled: isPublicAnalyticsEnabled(analyticsSettingResult.data as SiteSetting | null),
      adminAnalyticsRpcStatus: analyticsSummaryResult.data.dataStatus,
      latestAnalyticsEventAt: analyticsSummaryResult.data.latestEventAt,
      latestDailyMetricDate: (dailyMetricResult.data as { metric_date?: string } | null)?.metric_date ?? null,
      latestAuditAt: (auditResult.data as { created_at?: string } | null)?.created_at ?? null,
      toolCatalogCount: toolCount ?? 0,
      homepageSlotCount: slotCount ?? 0,
    },
    toolError ??
      slotError ??
      auditResult.error ??
      analyticsSummaryResult.error ??
      dailyMetricResult.error ??
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
