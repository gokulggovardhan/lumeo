import "server-only";

import { formatLocationLabel } from "@/lib/analytics/location-names";
import { createClient } from "@/lib/supabase/server";

export type VerifiedAnalyticsScope = "real_audience" | "synthetic" | "automation" | "all";

export type VerifiedTrafficRow = {
  date: string;
  pageViews: number;
  uniqueVisitors: number;
  sessions: number;
  knownLocationPageViews: number;
  unknownLocationPageViews: number;
  toolOpens: number;
  processingStarted: number;
  processingSucceeded: number;
  processingFailed: number;
  processingCancelled: number;
  downloadsStarted: number;
};

export type VerifiedLocationRow = {
  label: string;
  pageViews: number;
  visitors: number;
  sessions: number;
  unknown?: boolean;
};

export type VerifiedAnalytics = {
  dataStatus: "available" | "unavailable";
  scope: VerifiedAnalyticsScope;
  summary: {
    pageViews: number;
    uniqueVisitors: number;
    sessions: number;
    knownLocationPageViews: number;
    unknownLocationPageViews: number;
    locationCoveragePercent: number | null;
    toolOpens: number;
    processingStarted: number;
    processingSucceeded: number;
    processingFailed: number;
    processingCancelled: number;
    downloadsStarted: number;
    averageDurationMs: number | null;
    latestEventAt: string | null;
  };
  daily: VerifiedTrafficRow[];
  locations: VerifiedLocationRow[];
  countries: VerifiedLocationRow[];
  regions: VerifiedLocationRow[];
  cities: VerifiedLocationRow[];
  topPages: Array<{ path: string; pageViews: number; visitors: number; sessions: number }>;
  topToolsByOpens: Array<{ toolSlug: string; count: number }>;
  topToolsBySuccess: Array<{ toolSlug: string; count: number }>;
  errorSummary: Array<{ label: string; count: number }>;
  failureStageSummary: Array<{ label: string; count: number }>;
  cancellationStageSummary: Array<{ label: string; count: number }>;
  deviceSummary: Array<{ label: string; count: number }>;
  browserSummary: Array<{ label: string; count: number }>;
  osSummary: Array<{ label: string; count: number }>;
  trafficCounts: Array<{ trafficClass: string; pageViews: number; visitors: number; sessions: number }>;
  integrity: {
    legacyPageViews: number;
    excludedAutomationPageViews: number;
    cutoverAt: string | null;
  };
};

export type VerifiedRecentAnalyticsEvent = {
  occurredAt: string;
  eventName: string;
  toolSlug: string | null;
  trafficClass: string;
  deviceClass: string;
  browserFamily: string;
  operatingSystem: string;
  locationLabel: string;
  pagePath: string | null;
  success: boolean | null;
};

type DataResult<T> = { data: T; error: string | null };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function count(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function nullableNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function string(value: unknown) {
  return typeof value === "string" ? value : null;
}

function unavailable(scope: VerifiedAnalyticsScope): VerifiedAnalytics {
  return {
    dataStatus: "unavailable",
    scope,
    summary: {
      pageViews: 0,
      uniqueVisitors: 0,
      sessions: 0,
      knownLocationPageViews: 0,
      unknownLocationPageViews: 0,
      locationCoveragePercent: null,
      toolOpens: 0,
      processingStarted: 0,
      processingSucceeded: 0,
      processingFailed: 0,
      processingCancelled: 0,
      downloadsStarted: 0,
      averageDurationMs: null,
      latestEventAt: null,
    },
    daily: [],
    locations: [],
    countries: [],
    regions: [],
    cities: [],
    topPages: [],
    topToolsByOpens: [],
    topToolsBySuccess: [],
    errorSummary: [],
    failureStageSummary: [],
    cancellationStageSummary: [],
    deviceSummary: [],
    browserSummary: [],
    osSummary: [],
    trafficCounts: [],
    integrity: { legacyPageViews: 0, excludedAutomationPageViews: 0, cutoverAt: null },
  };
}

function parseMetricRows(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    if (!isRecord(row)) return [];
    const label = string(row.label);
    return label ? [{ label, count: count(row.event_count ?? row.visitors) }] : [];
  });
}

function parseToolRows(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    if (!isRecord(row)) return [];
    const toolSlug = string(row.tool_slug);
    return toolSlug ? [{ toolSlug, count: count(row.event_count) }] : [];
  });
}

function parseGeoRows(
  value: unknown,
  kind: "location" | "country" | "region" | "city",
): VerifiedLocationRow[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    if (!isRecord(row)) return [];
    const country = string(row.country_code);
    const region = string(row.region) ?? string(row.region_code);
    const city = string(row.city);

    let label = "Unknown Location";
    if (kind === "country" && country) label = formatLocationLabel(null, null, country);
    if (kind === "region" && country && region) label = formatLocationLabel(null, region, country);
    if ((kind === "location" || kind === "city") && country && region && city) {
      label = formatLocationLabel(city, region, country);
    }
    if (label === "Unknown location" || label === "Unknown Location") return [];

    return [{
      label,
      pageViews: count(row.page_views),
      visitors: count(row.visitors),
      sessions: count(row.sessions),
    }];
  });
}

function parseVerifiedAnalytics(value: unknown, scope: VerifiedAnalyticsScope): VerifiedAnalytics | null {
  if (!isRecord(value) || !isRecord(value.summary)) return null;
  const rawSummary = value.summary;
  const pageViews = count(rawSummary.page_views);
  const known = count(rawSummary.known_location_page_views);
  const unknown = count(rawSummary.unknown_location_page_views);
  if (known + unknown !== pageViews) return null;

  const rawDaily = Array.isArray(value.daily) ? value.daily : [];
  const daily: VerifiedTrafficRow[] = [];
  for (const row of rawDaily) {
    if (!isRecord(row) || !string(row.date)) return null;
    const dailyPageViews = count(row.page_views);
    const dailyKnown = count(row.known_location_page_views);
    const dailyUnknown = count(row.unknown_location_page_views);
    if (dailyKnown + dailyUnknown !== dailyPageViews) return null;
    daily.push({
      date: string(row.date)!,
      pageViews: dailyPageViews,
      uniqueVisitors: count(row.unique_visitors),
      sessions: count(row.sessions),
      knownLocationPageViews: dailyKnown,
      unknownLocationPageViews: dailyUnknown,
      toolOpens: count(row.tool_opens),
      processingStarted: count(row.processing_started),
      processingSucceeded: count(row.processing_succeeded),
      processingFailed: count(row.processing_failed),
      processingCancelled: count(row.processing_cancelled),
      downloadsStarted: count(row.downloads_started),
    });
  }

  const geography = isRecord(value.geography) ? value.geography : {};
  const tools = isRecord(value.tools) ? value.tools : {};
  const diagnostics = isRecord(value.diagnostics) ? value.diagnostics : {};
  const technical = isRecord(value.technical) ? value.technical : {};
  const integrity = isRecord(value.integrity) ? value.integrity : {};

  const knownLocations = parseGeoRows(geography.locations, "location");
  const locations =
    unknown > 0
      ? [...knownLocations, { label: "Unknown Location", pageViews: unknown, visitors: 0, sessions: 0, unknown: true }]
      : knownLocations;

  const topPages = Array.isArray(value.top_pages)
    ? value.top_pages.flatMap((row) => {
        if (!isRecord(row)) return [];
        const path = string(row.page_path);
        return path
          ? [{ path, pageViews: count(row.page_views), visitors: count(row.visitors), sessions: count(row.sessions) }]
          : [];
      })
    : [];

  const trafficCounts = Array.isArray(value.traffic_counts)
    ? value.traffic_counts.flatMap((row) => {
        if (!isRecord(row)) return [];
        const trafficClass = string(row.traffic_class);
        return trafficClass
          ? [{ trafficClass, pageViews: count(row.page_views), visitors: count(row.visitors), sessions: count(row.sessions) }]
          : [];
      })
    : [];

  return {
    dataStatus: "available",
    scope,
    summary: {
      pageViews,
      uniqueVisitors: count(rawSummary.unique_visitors),
      sessions: count(rawSummary.sessions),
      knownLocationPageViews: known,
      unknownLocationPageViews: unknown,
      locationCoveragePercent: nullableNumber(rawSummary.location_coverage_percent),
      toolOpens: count(rawSummary.tool_opens),
      processingStarted: count(rawSummary.processing_started),
      processingSucceeded: count(rawSummary.processing_succeeded),
      processingFailed: count(rawSummary.processing_failed),
      processingCancelled: count(rawSummary.processing_cancelled),
      downloadsStarted: count(rawSummary.downloads_started),
      averageDurationMs: nullableNumber(rawSummary.average_successful_duration_ms),
      latestEventAt: string(rawSummary.latest_event_at),
    },
    daily,
    locations,
    countries: parseGeoRows(geography.countries, "country"),
    regions: parseGeoRows(geography.regions, "region"),
    cities: parseGeoRows(geography.cities, "city"),
    topPages,
    topToolsByOpens: parseToolRows(tools.top_tools_by_opens),
    topToolsBySuccess: parseToolRows(tools.top_tools_by_success),
    errorSummary: parseMetricRows(diagnostics.errors),
    failureStageSummary: parseMetricRows(diagnostics.failure_stages),
    cancellationStageSummary: parseMetricRows(diagnostics.cancellation_stages),
    deviceSummary: parseMetricRows(technical.device),
    browserSummary: parseMetricRows(technical.browser),
    osSummary: parseMetricRows(technical.operating_system),
    trafficCounts,
    integrity: {
      legacyPageViews: count(integrity.legacy_page_views),
      excludedAutomationPageViews: count(integrity.excluded_automation_page_views),
      cutoverAt: string(integrity.cutover_at),
    },
  };
}

export async function getVerifiedAnalytics(
  range: { startDate: string; endDate: string },
  scope: VerifiedAnalyticsScope = "real_audience",
): Promise<DataResult<VerifiedAnalytics>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_admin_verified_analytics", {
    p_start_date: range.startDate,
    p_end_date: range.endDate,
    p_traffic_scope: scope,
  });

  if (error) {
    return { data: unavailable(scope), error: "Verified analytics are temporarily unavailable." };
  }

  const parsed = parseVerifiedAnalytics(data, scope);
  return parsed
    ? { data: parsed, error: null }
    : { data: unavailable(scope), error: "Verified analytics returned inconsistent data." };
}

export async function getVerifiedRecentAnalyticsEvents(
  limit = 100,
  scope: VerifiedAnalyticsScope = "real_audience",
): Promise<DataResult<VerifiedRecentAnalyticsEvent[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_admin_recent_analytics_events_v2", {
    p_limit: limit,
    p_traffic_scope: scope,
  });
  if (error || !Array.isArray(data)) {
    return { data: [], error: "Verified recent analytics are temporarily unavailable." };
  }

  const rows: VerifiedRecentAnalyticsEvent[] = [];
  for (const raw of data) {
    if (!isRecord(raw)) continue;
    const occurredAt = string(raw.occurred_at);
    const eventName = string(raw.event_name);
    if (!occurredAt || !eventName) continue;
    const country = string(raw.country_code);
    const region = string(raw.region) ?? string(raw.region_code);
    const city = string(raw.city);
    const complete = Boolean(country && region && city && string(raw.geo_precision) === "city");

    rows.push({
      occurredAt,
      eventName,
      toolSlug: string(raw.tool_slug),
      trafficClass: string(raw.traffic_class) ?? scope,
      deviceClass: string(raw.device_class) ?? "unknown",
      browserFamily: string(raw.browser_family) ?? "Unknown",
      operatingSystem: string(raw.operating_system) ?? "Unknown",
      locationLabel: complete ? formatLocationLabel(city, region, country) : "Unknown Location",
      pagePath: string(raw.page_path),
      success: typeof raw.success === "boolean" ? raw.success : null,
    });
  }

  return { data: rows, error: null };
}
