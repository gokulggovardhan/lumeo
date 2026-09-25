import "server-only";

import { createClient } from "@/lib/supabase/server";
import type {
  AnalyticsAcquisitionRow,
  AnalyticsAudienceSummary,
  AnalyticsCityRow,
  AnalyticsCountryRow,
  AnalyticsDailyAudience,
  AnalyticsFunnel,
  AnalyticsHourlyAudience,
  AnalyticsIntegrity,
  AnalyticsPreviousSummary,
  AnalyticsRegionRow,
  AnalyticsTechnicalRow,
  AnalyticsToolPerformanceRow,
  AnalyticsTrafficCount,
  AnalyticsTrafficScope,
  VerifiedAnalyticsDashboard,
  VerifiedRecentAnalyticsEvent,
} from "@/lib/admin/analytics-types";

type DataResult<T> = { data: T; error: string | null };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function countValue(value: unknown) {
  return numberValue(value) ?? 0;
}

function nullableCount(value: unknown) {
  return value === null ? null : numberValue(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : null;
}

function booleanValue(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function parseSummary(value: unknown): AnalyticsAudienceSummary | null {
  if (!isRecord(value)) return null;
  return {
    uniqueVisitors: countValue(value.unique_visitors),
    newVisitors: nullableCount(value.new_visitors),
    returningVisitors: nullableCount(value.returning_visitors),
    repeatedDailyVisitors: nullableCount(value.repeated_daily_visitors),
    frequentVisitors: nullableCount(value.frequent_visitors),
    pageViews: countValue(value.page_views),
    toolUsers: countValue(value.tool_users),
    toolOpens: countValue(value.tool_opens),
    processingStarted: countValue(value.processing_started),
    processingSucceeded: countValue(value.processing_succeeded),
    processingFailed: countValue(value.processing_failed),
    downloadsStarted: countValue(value.downloads_started),
    averageSuccessfulDurationMs: numberValue(value.average_successful_duration_ms),
    latestEventAt: stringValue(value.latest_event_at),
    activeVisitors: nullableCount(value.active_visitors),
  };
}

function parsePrevious(value: unknown): AnalyticsPreviousSummary | null {
  if (!isRecord(value)) return null;
  return {
    uniqueVisitors: countValue(value.unique_visitors),
    newVisitors: nullableCount(value.new_visitors),
    returningVisitors: nullableCount(value.returning_visitors),
    pageViews: countValue(value.page_views),
    toolOpens: countValue(value.tool_opens),
    processingSucceeded: countValue(value.processing_succeeded),
    downloadsStarted: countValue(value.downloads_started),
  };
}

function parseDaily(value: unknown): AnalyticsDailyAudience[] | null {
  if (!Array.isArray(value)) return null;
  const rows: AnalyticsDailyAudience[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const date = stringValue(item.date);
    if (!date) return null;
    rows.push({
      date,
      uniqueVisitors: countValue(item.unique_visitors),
      newVisitors: nullableCount(item.new_visitors),
      returningVisitors: nullableCount(item.returning_visitors),
      repeatedDailyVisitors: nullableCount(item.repeated_daily_visitors),
      pageViews: countValue(item.page_views),
      toolUsers: countValue(item.tool_users),
      processingSucceeded: countValue(item.processing_succeeded),
      downloadsStarted: countValue(item.downloads_started),
    });
  }
  return rows;
}

function parseHourly(value: unknown): AnalyticsHourlyAudience[] | null {
  if (!Array.isArray(value)) return null;
  const rows: AnalyticsHourlyAudience[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const hour = numberValue(item.hour);
    if (hour === null || hour < 0 || hour > 23) return null;
    rows.push({
      hour,
      uniqueVisitors: countValue(item.unique_visitors),
      pageViews: countValue(item.page_views),
      toolOpens: countValue(item.tool_opens),
      processingSucceeded: countValue(item.processing_succeeded),
      downloadsStarted: countValue(item.downloads_started),
    });
  }
  return rows;
}

function parseGeography(value: unknown) {
  if (!isRecord(value)) return null;

  const countries: AnalyticsCountryRow[] = [];
  if (!Array.isArray(value.countries)) return null;
  for (const item of value.countries) {
    if (!isRecord(item)) return null;
    const countryCode = stringValue(item.country_code);
    if (!countryCode) return null;
    countries.push({ countryCode, visitors: countValue(item.visitors) });
  }

  const regions: AnalyticsRegionRow[] = [];
  if (!Array.isArray(value.regions)) return null;
  for (const item of value.regions) {
    if (!isRecord(item)) return null;
    const countryCode = stringValue(item.country_code);
    if (!countryCode) return null;
    regions.push({
      countryCode,
      region: stringValue(item.region),
      regionCode: stringValue(item.region_code),
      visitors: countValue(item.visitors),
    });
  }

  const cities: AnalyticsCityRow[] = [];
  if (!Array.isArray(value.cities)) return null;
  for (const item of value.cities) {
    if (!isRecord(item)) return null;
    const countryCode = stringValue(item.country_code);
    const city = stringValue(item.city);
    if (!countryCode || !city) return null;
    cities.push({
      countryCode,
      city,
      region: stringValue(item.region),
      regionCode: stringValue(item.region_code),
      visitors: countValue(item.visitors),
    });
  }

  return { countries, regions, cities };
}

function parseAcquisitionRows(value: unknown, key: string): AnalyticsAcquisitionRow[] | null {
  if (!Array.isArray(value)) return null;
  const rows: AnalyticsAcquisitionRow[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const label = stringValue(item[key]);
    if (!label) continue;
    rows.push({
      label,
      sessions: countValue(item.sessions),
      visitors: countValue(item.visitors),
    });
  }
  return rows;
}

function parseAcquisition(value: unknown) {
  if (!isRecord(value)) return null;
  const sources = parseAcquisitionRows(value.sources, "source");
  const referrers = parseAcquisitionRows(value.referrers, "referrer_host");
  const landingPages = parseAcquisitionRows(value.landing_pages, "landing_path");
  const entryTools = parseAcquisitionRows(value.entry_tools, "tool_slug");
  if (!sources || !referrers || !landingPages || !entryTools) return null;
  return { sources, referrers, landingPages, entryTools };
}

function parseTools(value: unknown): AnalyticsToolPerformanceRow[] | null {
  if (!Array.isArray(value)) return null;
  const rows: AnalyticsToolPerformanceRow[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const toolSlug = stringValue(item.tool_slug);
    const lifecycleApplicable = booleanValue(item.lifecycle_applicable);
    if (!toolSlug || lifecycleApplicable === null) return null;
    rows.push({
      toolSlug,
      uniqueUsers: countValue(item.unique_users),
      opens: countValue(item.opens),
      processingStarted: countValue(item.processing_started),
      succeeded: countValue(item.succeeded),
      failed: countValue(item.failed),
      downloads: countValue(item.downloads),
      completionRate: numberValue(item.completion_rate),
      averageSuccessfulDurationMs: numberValue(item.average_successful_duration_ms),
      lifecycleApplicable,
    });
  }
  return rows;
}

function parseFunnel(value: unknown): AnalyticsFunnel | null {
  if (!isRecord(value)) return null;
  return {
    visits: countValue(value.visits),
    toolOpen: countValue(value.tool_open),
    processingStarted: countValue(value.processing_started),
    processingSucceeded: countValue(value.processing_succeeded),
    downloads: countValue(value.downloads),
  };
}

function parseTechnicalRows(value: unknown): AnalyticsTechnicalRow[] | null {
  if (!Array.isArray(value)) return null;
  const rows: AnalyticsTechnicalRow[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const label = stringValue(item.label);
    if (!label) continue;
    rows.push({ label, visitors: countValue(item.visitors) });
  }
  return rows;
}

function parseTechnical(value: unknown) {
  if (!isRecord(value)) return null;
  const device = parseTechnicalRows(value.device);
  const browser = parseTechnicalRows(value.browser);
  const operatingSystem = parseTechnicalRows(value.operating_system);
  if (!device || !browser || !operatingSystem) return null;
  return { device, browser, operatingSystem };
}

function parseTrafficCounts(value: unknown): AnalyticsTrafficCount[] | null {
  if (!Array.isArray(value)) return null;
  const rows: AnalyticsTrafficCount[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const trafficClass = stringValue(item.traffic_class);
    if (!trafficClass) continue;
    rows.push({
      trafficClass,
      events: countValue(item.events),
      visitors: countValue(item.visitors),
    });
  }
  return rows;
}

function parseIntegrity(value: unknown): AnalyticsIntegrity | null {
  if (!isRecord(value)) return null;
  return {
    verifiedEvents: countValue(value.verified_events),
    legacyEvents: countValue(value.legacy_events),
    cutoverAt: stringValue(value.cutover_at),
    latestVerifiedEventAt: stringValue(value.latest_verified_event_at),
    locationEligibleVisitors: countValue(value.location_eligible_visitors),
    locationVerifiedVisitors: countValue(value.location_verified_visitors),
    locationCoveragePercent: numberValue(value.location_coverage_percent),
  };
}

export function parseVerifiedAnalyticsDashboard(
  value: unknown,
): VerifiedAnalyticsDashboard | null {
  if (!isRecord(value) || value.schema_version !== 2) return null;
  const trafficScope = stringValue(value.traffic_scope);
  if (
    trafficScope !== "real_audience" &&
    trafficScope !== "synthetic" &&
    trafficScope !== "automation" &&
    trafficScope !== "all"
  ) {
    return null;
  }

  const summary = parseSummary(value.summary);
  const previousSummary = parsePrevious(value.previous_summary);
  const dailyAudience = parseDaily(value.daily_audience);
  const hourlyAudience = parseHourly(value.hourly_audience);
  const geography = parseGeography(value.geography);
  const acquisition = parseAcquisition(value.acquisition);
  const toolPerformance = parseTools(value.tool_performance);
  const funnel = parseFunnel(value.funnel);
  const technical = parseTechnical(value.technical);
  const trafficCounts = parseTrafficCounts(value.traffic_counts);
  const integrity = parseIntegrity(value.integrity);

  if (
    !summary ||
    !previousSummary ||
    !dailyAudience ||
    !hourlyAudience ||
    !geography ||
    !acquisition ||
    !toolPerformance ||
    !funnel ||
    !technical ||
    !trafficCounts ||
    !integrity
  ) {
    return null;
  }

  return {
    dataStatus: "available",
    trafficScope,
    summary,
    previousSummary,
    dailyAudience,
    hourlyAudience,
    geography,
    acquisition,
    toolPerformance,
    funnel,
    technical,
    trafficCounts,
    integrity,
  };
}

export async function getVerifiedAnalyticsDashboard(
  range: { startDate: string; endDate: string },
  trafficScope: AnalyticsTrafficScope = "real_audience",
): Promise<DataResult<VerifiedAnalyticsDashboard | null>> {
  const supabase = await createClient();
  const result = await supabase.rpc("get_admin_analytics_dashboard", {
    p_start_date: range.startDate,
    p_end_date: range.endDate,
    p_traffic_scope: trafficScope,
  });

  if (result.error) {
    return { data: null, error: "Analytics data is temporarily unavailable." };
  }

  const parsed = parseVerifiedAnalyticsDashboard(result.data);
  return parsed
    ? { data: parsed, error: null }
    : { data: null, error: "Analytics data is temporarily unavailable." };
}

export async function getVerifiedRecentAnalyticsEvents(
  limit: number,
  trafficScope: AnalyticsTrafficScope = "real_audience",
): Promise<DataResult<VerifiedRecentAnalyticsEvent[]>> {
  const supabase = await createClient();
  const result = await supabase.rpc("get_admin_recent_analytics_events_v2", {
    p_limit: Math.max(1, Math.min(limit, 200)),
    p_traffic_scope: trafficScope,
  });

  if (result.error || !Array.isArray(result.data)) {
    return { data: [], error: "Recent analytics are temporarily unavailable." };
  }

  const rows: VerifiedRecentAnalyticsEvent[] = [];
  for (const item of result.data) {
    if (!isRecord(item)) {
      return { data: [], error: "Recent analytics are temporarily unavailable." };
    }
    const occurredAt = stringValue(item.occurred_at);
    const eventName = stringValue(item.event_name);
    const trafficClass = stringValue(item.traffic_class);
    if (!occurredAt || !eventName || !trafficClass) continue;
    rows.push({
      occurredAt,
      eventName,
      toolSlug: stringValue(item.tool_slug),
      trafficClass,
      deviceClass: stringValue(item.device_class),
      browserFamily: stringValue(item.browser_family),
      operatingSystem: stringValue(item.operating_system),
      city: stringValue(item.city),
      region: stringValue(item.region),
      regionCode: stringValue(item.region_code),
      countryCode: stringValue(item.country_code),
      geoPrecision: stringValue(item.geo_precision),
      pagePath: stringValue(item.page_path),
      acquisitionSource: stringValue(item.acquisition_source),
      success: booleanValue(item.success),
    });
  }

  return { data: rows, error: null };
}

export function safeComparisonPercent(current: number, previous: number) {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export function analyticsRate(numerator: number | null, denominator: number) {
  if (numerator === null || denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}
