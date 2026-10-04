import "server-only";

import { createClient } from "@/lib/supabase/server";

export type VerifiedTrafficScope =
  | "real_audience"
  | "synthetic"
  | "automation"
  | "all";

export type VerifiedTrafficSummary = {
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
  averageSuccessfulDurationMs: number | null;
  latestEventAt: string | null;
};

export type VerifiedDailyTraffic = {
  date: string;
  pageViews: number;
  uniqueVisitors: number;
  sessions: number;
  knownLocationPageViews: number;
  unknownLocationPageViews: number;
  toolOpens: number;
  processingSucceeded: number;
  processingFailed: number;
  processingCancelled: number;
};

export type VerifiedGeoRow = {
  countryCode: string;
  region: string | null;
  regionCode: string | null;
  city: string | null;
  pageViews: number;
  visitors: number;
  sessions: number;
};

export type VerifiedPageRow = {
  pagePath: string;
  pageViews: number;
  visitors: number;
  sessions: number;
};

export type VerifiedCountRow = {
  label: string;
  count: number;
};

export type VerifiedToolRow = {
  toolSlug: string;
  count: number;
};

export type VerifiedTechnicalRow = {
  label: string;
  visitors: number;
};

export type VerifiedTrafficClassRow = {
  trafficClass: string;
  events: number;
  pageViews: number;
  visitors: number;
  sessions: number;
};

export type VerifiedTrafficIntegrity = {
  verifiedEvents: number;
  legacyEvents: number;
  legacyPageViews: number;
  cutoverAt: string | null;
  latestVerifiedEventAt: string | null;
  locationCoveragePercent: number | null;
};

export type VerifiedTrafficData = {
  dataStatus: "available";
  trafficScope: VerifiedTrafficScope;
  summary: VerifiedTrafficSummary;
  daily: VerifiedDailyTraffic[];
  locations: VerifiedGeoRow[];
  countries: VerifiedGeoRow[];
  regions: VerifiedGeoRow[];
  cities: VerifiedGeoRow[];
  topPages: VerifiedPageRow[];
  topToolsByOpens: VerifiedToolRow[];
  topToolsBySuccess: VerifiedToolRow[];
  errorSummary: VerifiedCountRow[];
  failureStageSummary: VerifiedCountRow[];
  cancellationStageSummary: VerifiedCountRow[];
  deviceSummary: VerifiedTechnicalRow[];
  browserSummary: VerifiedTechnicalRow[];
  osSummary: VerifiedTechnicalRow[];
  trafficCounts: VerifiedTrafficClassRow[];
  integrity: VerifiedTrafficIntegrity;
};

export type VerifiedRecentEvent = {
  occurredAt: string;
  eventName: string;
  toolSlug: string | null;
  trafficClass: string;
  deviceClass: string;
  browserFamily: string;
  operatingSystem: string;
  city: string | null;
  region: string | null;
  regionCode: string | null;
  countryCode: string | null;
  geoPrecision: string | null;
  pagePath: string | null;
  success: boolean | null;
};

export type VerifiedLiveTrafficSummary = {
  pageViewsLastMinute: number;
  pageViewsLastFiveMinutes: number;
  activeVisitorsLastFiveMinutes: number;
  activeSessionsLastFiveMinutes: number;
  knownLocationPageViewsLastFiveMinutes: number;
  unknownLocationPageViewsLastFiveMinutes: number;
  lastPageViewAt: string | null;
};

export type VerifiedLiveMinuteBucket = {
  minute: string;
  pageViews: number;
  visitors: number;
};

export type VerifiedLiveHit = {
  occurredAt: string;
  pagePath: string | null;
  toolSlug: string | null;
  city: string | null;
  region: string | null;
  regionCode: string | null;
  countryCode: string | null;
};

export type VerifiedLiveTrafficData = {
  schemaVersion: 2;
  trafficScope: VerifiedTrafficScope;
  asOf: string;
  summary: VerifiedLiveTrafficSummary;
  minuteBuckets: VerifiedLiveMinuteBucket[];
  recentHits: VerifiedLiveHit[];
};

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

function stringValue(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function parseSummary(value: unknown): VerifiedTrafficSummary | null {
  if (!isRecord(value)) return null;
  const pageViews = countValue(value.page_views);
  const known = countValue(value.known_location_page_views);
  const unknown = countValue(value.unknown_location_page_views);
  if (known + unknown !== pageViews) return null;

  return {
    pageViews,
    uniqueVisitors: countValue(value.unique_visitors),
    sessions: countValue(value.sessions),
    knownLocationPageViews: known,
    unknownLocationPageViews: unknown,
    toolOpens: countValue(value.tool_opens),
    processingStarted: countValue(value.processing_started),
    processingSucceeded: countValue(value.processing_succeeded),
    processingFailed: countValue(value.processing_failed),
    processingCancelled: countValue(value.processing_cancelled),
    downloadsStarted: countValue(value.downloads_started),
    averageSuccessfulDurationMs: numberValue(value.average_successful_duration_ms),
    latestEventAt: stringValue(value.latest_event_at),
  };
}

function parseDaily(value: unknown): VerifiedDailyTraffic[] | null {
  if (!Array.isArray(value)) return null;
  const rows: VerifiedDailyTraffic[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const date = stringValue(item.date);
    if (!date) return null;
    const pageViews = countValue(item.page_views);
    const known = countValue(item.known_location_page_views);
    const unknown = countValue(item.unknown_location_page_views);
    if (known + unknown !== pageViews) return null;

    rows.push({
      date,
      pageViews,
      uniqueVisitors: countValue(item.unique_visitors),
      sessions: countValue(item.sessions),
      knownLocationPageViews: known,
      unknownLocationPageViews: unknown,
      toolOpens: countValue(item.tool_opens),
      processingSucceeded: countValue(item.processing_succeeded),
      processingFailed: countValue(item.processing_failed),
      processingCancelled: countValue(item.processing_cancelled),
    });
  }
  return rows;
}

function parseGeoRows(value: unknown): VerifiedGeoRow[] | null {
  if (!Array.isArray(value)) return null;
  const rows: VerifiedGeoRow[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const countryCode = stringValue(item.country_code);
    if (!countryCode) continue;
    rows.push({
      countryCode,
      region: stringValue(item.region),
      regionCode: stringValue(item.region_code),
      city: stringValue(item.city),
      pageViews: countValue(item.page_views),
      visitors: countValue(item.visitors),
      sessions: countValue(item.sessions),
    });
  }
  return rows;
}

function parsePageRows(value: unknown): VerifiedPageRow[] | null {
  if (!Array.isArray(value)) return null;
  const rows: VerifiedPageRow[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const pagePath = stringValue(item.page_path);
    if (!pagePath) continue;
    rows.push({
      pagePath,
      pageViews: countValue(item.page_views),
      visitors: countValue(item.visitors),
      sessions: countValue(item.sessions),
    });
  }
  return rows;
}

function parseCountRows(value: unknown): VerifiedCountRow[] | null {
  if (!Array.isArray(value)) return null;
  const rows: VerifiedCountRow[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const label = stringValue(item.label);
    if (!label) continue;
    rows.push({ label, count: countValue(item.event_count) });
  }
  return rows;
}

function parseToolRows(value: unknown): VerifiedToolRow[] | null {
  if (!Array.isArray(value)) return null;
  const rows: VerifiedToolRow[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const toolSlug = stringValue(item.tool_slug);
    if (!toolSlug) continue;
    rows.push({ toolSlug, count: countValue(item.event_count) });
  }
  return rows;
}

function parseTechnicalRows(value: unknown): VerifiedTechnicalRow[] | null {
  if (!Array.isArray(value)) return null;
  const rows: VerifiedTechnicalRow[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const label = stringValue(item.label);
    if (!label) continue;
    rows.push({ label, visitors: countValue(item.visitors) });
  }
  return rows;
}

function parseTrafficCounts(value: unknown): VerifiedTrafficClassRow[] | null {
  if (!Array.isArray(value)) return null;
  const rows: VerifiedTrafficClassRow[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const trafficClass = stringValue(item.traffic_class);
    if (!trafficClass) continue;
    rows.push({
      trafficClass,
      events: countValue(item.events),
      pageViews: countValue(item.page_views),
      visitors: countValue(item.visitors),
      sessions: countValue(item.sessions),
    });
  }
  return rows;
}

function parseIntegrity(value: unknown): VerifiedTrafficIntegrity | null {
  if (!isRecord(value)) return null;
  return {
    verifiedEvents: countValue(value.verified_events),
    legacyEvents: countValue(value.legacy_events),
    legacyPageViews: countValue(value.legacy_page_views),
    cutoverAt: stringValue(value.cutover_at),
    latestVerifiedEventAt: stringValue(value.latest_verified_event_at),
    locationCoveragePercent: numberValue(value.location_coverage_percent),
  };
}

export function parseVerifiedTraffic(value: unknown): VerifiedTrafficData | null {
  if (!isRecord(value) || value.schema_version !== 2) return null;
  const scope = stringValue(value.traffic_scope);
  if (
    scope !== "real_audience" &&
    scope !== "synthetic" &&
    scope !== "automation" &&
    scope !== "all"
  ) {
    return null;
  }

  const summary = parseSummary(value.summary);
  const daily = parseDaily(value.daily);
  const locations = parseGeoRows(value.locations);
  const countries = parseGeoRows(value.countries);
  const regions = parseGeoRows(value.regions);
  const cities = parseGeoRows(value.cities);
  const topPages = parsePageRows(value.top_pages);
  const topToolsByOpens = parseToolRows(value.top_tools_by_opens);
  const topToolsBySuccess = parseToolRows(value.top_tools_by_success);
  const errorSummary = parseCountRows(value.error_summary);
  const failureStageSummary = parseCountRows(value.failure_stage_summary);
  const cancellationStageSummary = parseCountRows(value.cancellation_stage_summary);
  const deviceSummary = parseTechnicalRows(value.device_summary);
  const browserSummary = parseTechnicalRows(value.browser_summary);
  const osSummary = parseTechnicalRows(value.operating_system_summary);
  const trafficCounts = parseTrafficCounts(value.traffic_counts);
  const integrity = parseIntegrity(value.integrity);

  if (
    !summary ||
    !daily ||
    !locations ||
    !countries ||
    !regions ||
    !cities ||
    !topPages ||
    !topToolsByOpens ||
    !topToolsBySuccess ||
    !errorSummary ||
    !failureStageSummary ||
    !cancellationStageSummary ||
    !deviceSummary ||
    !browserSummary ||
    !osSummary ||
    !trafficCounts ||
    !integrity
  ) {
    return null;
  }

  return {
    dataStatus: "available",
    trafficScope: scope,
    summary,
    daily,
    locations,
    countries,
    regions,
    cities,
    topPages,
    topToolsByOpens,
    topToolsBySuccess,
    errorSummary,
    failureStageSummary,
    cancellationStageSummary,
    deviceSummary,
    browserSummary,
    osSummary,
    trafficCounts,
    integrity,
  };
}

function parseVerifiedLiveTraffic(value: unknown): VerifiedLiveTrafficData | null {
  if (!isRecord(value) || value.schema_version !== 2) return null;

  const scope = stringValue(value.traffic_scope);
  if (
    scope !== "real_audience" &&
    scope !== "synthetic" &&
    scope !== "automation" &&
    scope !== "all"
  ) {
    return null;
  }

  const asOf = stringValue(value.as_of);
  const summaryValue = value.summary;
  const minuteValue = value.minute_buckets;
  const hitsValue = value.recent_hits;
  if (!asOf || !isRecord(summaryValue) || !Array.isArray(minuteValue) || !Array.isArray(hitsValue)) {
    return null;
  }

  const pageViewsLastFiveMinutes = countValue(summaryValue.page_views_last_five_minutes);
  const knownLocationPageViewsLastFiveMinutes = countValue(
    summaryValue.known_location_page_views_last_five_minutes,
  );
  const unknownLocationPageViewsLastFiveMinutes = countValue(
    summaryValue.unknown_location_page_views_last_five_minutes,
  );
  if (
    knownLocationPageViewsLastFiveMinutes + unknownLocationPageViewsLastFiveMinutes !==
    pageViewsLastFiveMinutes
  ) {
    return null;
  }

  const minuteBuckets: VerifiedLiveMinuteBucket[] = [];
  for (const item of minuteValue) {
    if (!isRecord(item)) return null;
    const minute = stringValue(item.minute);
    if (!minute) return null;
    minuteBuckets.push({
      minute,
      pageViews: countValue(item.page_views),
      visitors: countValue(item.visitors),
    });
  }

  const recentHits: VerifiedLiveHit[] = [];
  for (const item of hitsValue) {
    if (!isRecord(item)) return null;
    const occurredAt = stringValue(item.occurred_at);
    if (!occurredAt) return null;
    recentHits.push({
      occurredAt,
      pagePath: stringValue(item.page_path),
      toolSlug: stringValue(item.tool_slug),
      city: stringValue(item.city),
      region: stringValue(item.region),
      regionCode: stringValue(item.region_code),
      countryCode: stringValue(item.country_code),
    });
  }

  return {
    schemaVersion: 2,
    trafficScope: scope,
    asOf,
    summary: {
      pageViewsLastMinute: countValue(summaryValue.page_views_last_minute),
      pageViewsLastFiveMinutes,
      activeVisitorsLastFiveMinutes: countValue(
        summaryValue.active_visitors_last_five_minutes,
      ),
      activeSessionsLastFiveMinutes: countValue(
        summaryValue.active_sessions_last_five_minutes,
      ),
      knownLocationPageViewsLastFiveMinutes,
      unknownLocationPageViewsLastFiveMinutes,
      lastPageViewAt: stringValue(summaryValue.last_page_view_at),
    },
    minuteBuckets,
    recentHits,
  };
}

export async function getVerifiedLiveTraffic(
  trafficScope: VerifiedTrafficScope = "real_audience",
): Promise<DataResult<VerifiedLiveTrafficData | null>> {
  const supabase = await createClient();
  const result = await supabase.rpc("get_admin_live_analytics_v2", {
    p_traffic_scope: trafficScope,
  });

  if (result.error) {
    return {
      data: null,
      error: "Live verified analytics are temporarily unavailable.",
    };
  }

  const parsed = parseVerifiedLiveTraffic(result.data);
  return parsed
    ? { data: parsed, error: null }
    : {
        data: null,
        error: "Live verified analytics returned an invalid response.",
      };
}

export async function getVerifiedTraffic(
  range: { startDate: string; endDate: string },
  trafficScope: VerifiedTrafficScope = "real_audience",
): Promise<DataResult<VerifiedTrafficData | null>> {
  const supabase = await createClient();
  const result = await supabase.rpc("get_admin_verified_traffic", {
    p_start_date: range.startDate,
    p_end_date: range.endDate,
    p_traffic_scope: trafficScope,
  });

  if (result.error) {
    return {
      data: null,
      error: "Verified analytics are temporarily unavailable.",
    };
  }

  const parsed = parseVerifiedTraffic(result.data);
  return parsed
    ? { data: parsed, error: null }
    : {
        data: null,
        error: "Verified analytics returned an invalid response.",
      };
}

export async function getVerifiedRecentEvents(
  limit = 100,
  trafficScope: VerifiedTrafficScope = "real_audience",
): Promise<DataResult<VerifiedRecentEvent[]>> {
  const supabase = await createClient();
  const result = await supabase.rpc("get_admin_recent_analytics_events_v2", {
    p_limit: Math.max(1, Math.min(limit, 200)),
    p_traffic_scope: trafficScope,
  });

  if (result.error || !Array.isArray(result.data)) {
    return {
      data: [],
      error: "Verified recent analytics are temporarily unavailable.",
    };
  }

  const rows: VerifiedRecentEvent[] = [];
  for (const value of result.data) {
    if (!isRecord(value)) continue;
    const occurredAt = stringValue(value.occurred_at);
    const eventName = stringValue(value.event_name);
    const trafficClass = stringValue(value.traffic_class);
    if (!occurredAt || !eventName || !trafficClass) continue;

    rows.push({
      occurredAt,
      eventName,
      toolSlug: stringValue(value.tool_slug),
      trafficClass,
      deviceClass: stringValue(value.device_class) ?? "unknown",
      browserFamily: stringValue(value.browser_family) ?? "Unknown",
      operatingSystem: stringValue(value.operating_system) ?? "Unknown",
      city: stringValue(value.city),
      region: stringValue(value.region),
      regionCode: stringValue(value.region_code),
      countryCode: stringValue(value.country_code),
      geoPrecision: stringValue(value.geo_precision),
      pagePath: stringValue(value.page_path),
      success: typeof value.success === "boolean" ? value.success : null,
    });
  }

  return { data: rows, error: null };
}
