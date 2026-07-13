import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { AdminContext } from "@/lib/admin/types";
import type {
  Announcement,
  AuditLog,
  DailyToolMetric,
  FeatureFlag,
  HomepageToolSlot,
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

export type HomepageSlotView = HomepageToolSlot & {
  tool: PdfTool | null;
};

export type OverviewData = {
  enabledTools: number;
  maintenanceTools: number;
  activeAnnouncements: number;
  enabledFeatureFlags: number;
  auditActions24h: number;
  analyticsEventsToday: number;
  processingSuccessRate: number | null;
  recentAuditLogs: AuditLog[];
  tools: ToolWithCategory[];
  homepageSlots: HomepageSlotView[];
};

export type AnalyticsSummary = {
  eventsToday: number;
  toolOpens: number;
  processingStarted: number;
  processingSucceeded: number;
  processingFailed: number;
  successRate: number | null;
  averageDurationMs: number | null;
  latestEventAt: string | null;
  dailyMetrics: DailyToolMetric[];
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
  latestAnalyticsEventAt: string | null;
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
  return new Date().toISOString().slice(0, 10);
}

function yesterdayIso() {
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
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
    .order("sort_order", { ascending: true })
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

export async function getHomepageSlots(): Promise<DataResult<HomepageSlotView[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("homepage_tool_slots")
    .select("*, pdf_tools(*)")
    .order("slot_number", { ascending: true });

  const slots = (data ?? []).map((row) => {
    const slot = row as HomepageToolSlot & { pdf_tools?: PdfTool | null };
    return {
      slot_number: slot.slot_number,
      tool_id: slot.tool_id,
      updated_by: slot.updated_by,
      updated_at: slot.updated_at,
      tool: slot.pdf_tools ?? null,
    };
  });

  return safe(slots, error);
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

export async function getAuditLogs(limit = 50, offset = 0): Promise<DataResult<AuditLog[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("audit_logs")
    .select("id, actor_user_id, actor_role, action, entity_type, entity_id, summary, changes, created_at")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  return safe((data ?? []) as AuditLog[], error);
}

export async function getAnalyticsSummary(): Promise<DataResult<AnalyticsSummary>> {
  const supabase = await createClient();
  const today = todayIsoDate();
  const since = `${today}T00:00:00.000Z`;

  const [{ count: eventsToday, error: eventError }, { data: latest }, { data: metrics, error: metricError }] =
    await Promise.all([
      supabase
        .from("analytics_events")
        .select("id", { count: "exact", head: true })
        .gte("occurred_at", since),
      supabase
        .from("analytics_events")
        .select("occurred_at")
        .order("occurred_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("daily_tool_metrics")
        .select("*")
        .gte("metric_date", new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10))
        .order("metric_date", { ascending: false }),
    ]);

  const dailyMetrics = (metrics ?? []) as DailyToolMetric[];
  const todayMetrics = dailyMetrics.filter((metric) => metric.metric_date === today);
  const processingStarted = todayMetrics.reduce((sum, metric) => sum + metric.processing_started, 0);
  const processingSucceeded = todayMetrics.reduce((sum, metric) => sum + metric.processing_succeeded, 0);
  const processingFailed = todayMetrics.reduce((sum, metric) => sum + metric.processing_failed, 0);
  const totalDuration = todayMetrics.reduce((sum, metric) => sum + metric.total_duration_ms, 0);
  const completed = processingSucceeded + processingFailed;

  return safe(
    {
      eventsToday: eventsToday ?? 0,
      toolOpens: todayMetrics.reduce((sum, metric) => sum + metric.tool_opens, 0),
      processingStarted,
      processingSucceeded,
      processingFailed,
      successRate: completed > 0 ? Math.round((processingSucceeded / completed) * 1000) / 10 : null,
      averageDurationMs: completed > 0 ? Math.round(totalDuration / completed) : null,
      latestEventAt: (latest as { occurred_at?: string } | null)?.occurred_at ?? null,
      dailyMetrics,
    },
    eventError ?? metricError,
  );
}

export async function getOverviewData(): Promise<DataResult<OverviewData>> {
  const supabase = await createClient();
  const [toolsResult, announcementsResult, flagsResult, auditResult, analyticsResult, slotsResult] =
    await Promise.all([
      getPdfTools(),
      getAnnouncements(),
      getFeatureFlags(),
      getAuditLogs(5),
      getAnalyticsSummary(),
      getHomepageSlots(),
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
      processingSuccessRate: analyticsResult.data.successRate,
      recentAuditLogs: auditResult.data,
      tools,
      homepageSlots: slotsResult.data,
    },
    toolsResult.error ??
      announcementsResult.error ??
      flagsResult.error ??
      auditResult.error ??
      analyticsResult.error ??
      slotsResult.error ??
      auditCountError,
  );
}

export async function getSystemStatus(admin: AdminContext): Promise<DataResult<SystemStatus>> {
  const supabase = await createClient();
  const [{ count: toolCount, error: toolError }, { count: slotCount, error: slotError }, auditResult, analyticsResult] =
    await Promise.all([
      supabase.from("pdf_tools").select("id", { count: "exact", head: true }),
      supabase.from("homepage_tool_slots").select("slot_number", { count: "exact", head: true }),
      supabase
        .from("audit_logs")
        .select("created_at")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("analytics_events")
        .select("occurred_at")
        .order("occurred_at", { ascending: false })
        .limit(1)
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
      latestAnalyticsEventAt: (analyticsResult.data as { occurred_at?: string } | null)?.occurred_at ?? null,
      latestAuditAt: (auditResult.data as { created_at?: string } | null)?.created_at ?? null,
      toolCatalogCount: toolCount ?? 0,
      homepageSlotCount: slotCount ?? 0,
    },
    toolError ?? slotError ?? auditResult.error ?? analyticsResult.error,
  );
}
