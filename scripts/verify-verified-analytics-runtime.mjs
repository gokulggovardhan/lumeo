import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const adminEmail = process.env.ADMIN_E2E_EMAIL;
const adminPassword = process.env.ADMIN_E2E_PASSWORD;

if (!url || !anonKey || !serviceRoleKey || !adminEmail || !adminPassword) {
  throw new Error("Missing disposable Supabase/admin environment for verified analytics runtime checks.");
}

function isoDateInIst(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function shiftIsoDate(value, days) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function noonIst(value) {
  return `${value}T06:30:00.000Z`;
}

function analyticsKey(label) {
  return createHash("sha256").update(label).digest("base64url");
}

function pageView({
  date,
  visitor,
  session,
  path,
  city = null,
  region = null,
  regionCode = null,
  country = null,
  trafficClass = "real_audience",
}) {
  const resolved = Boolean(country);
  const precision = city ? "city" : region || regionCode ? "region" : resolved ? "country" : "unresolved";
  return {
    event_name: "page_view",
    tool_slug: null,
    anonymous_session_id: null,
    occurred_at: noonIst(date),
    duration_ms: null,
    input_size_bucket: "unknown",
    output_size_bucket: "unknown",
    device_class: "desktop",
    browser_family: "Chrome",
    operating_system: "Linux",
    country_code: country,
    success: null,
    error_code: null,
    failure_stage: null,
    metadata: {},
    region,
    region_code: regionCode,
    city,
    visitor_key: analyticsKey(`visitor:${visitor}`),
    session_key: analyticsKey(`session:${session}`),
    traffic_class: trafficClass,
    traffic_class_reason:
      trafficClass === "synthetic" ? "lumeo_owned_production_test" : "default_real_audience",
    geo_source: resolved ? "cloudflare" : "unresolved",
    geo_precision: precision,
    page_path: path,
    referrer_host: null,
    landing_path: null,
    acquisition_source: "direct",
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    analytics_schema_version: 2,
  };
}

function lifecycleEvent({
  date,
  eventName,
  tool,
  visitor,
  session,
  minuteOffset,
  durationMs = null,
  success = null,
  errorCode = null,
  failureStage = null,
}) {
  const occurredAt = new Date(noonIst(date));
  occurredAt.setUTCMinutes(occurredAt.getUTCMinutes() + minuteOffset);
  return {
    event_name: eventName,
    tool_slug: tool,
    anonymous_session_id: null,
    occurred_at: occurredAt.toISOString(),
    duration_ms: durationMs,
    input_size_bucket: "unknown",
    output_size_bucket: "unknown",
    device_class: "desktop",
    browser_family: "Chrome",
    operating_system: "Linux",
    country_code: "IN",
    success,
    error_code: errorCode,
    failure_stage: failureStage,
    metadata: {},
    region: "Maharashtra",
    region_code: "MH",
    city: "Pune",
    visitor_key: analyticsKey(`visitor:${visitor}`),
    session_key: analyticsKey(`session:${session}`),
    traffic_class: "real_audience",
    traffic_class_reason: "default_real_audience",
    geo_source: "cloudflare",
    geo_precision: "city",
    page_path: `/pdf/${tool}`,
    referrer_host: null,
    landing_path: null,
    acquisition_source: "direct",
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    analytics_schema_version: 2,
    operation_attempt_id: null,
  };
}

function summaryOf(data) {
  assert.ok(data && typeof data === "object" && !Array.isArray(data));
  assert.equal(data.schema_version, 2);
  assert.ok(data.summary && typeof data.summary === "object");
  return data.summary;
}

function assertReconciles(data) {
  const summary = summaryOf(data);
  assert.equal(
    summary.known_location_page_views + summary.unknown_location_page_views,
    summary.page_views,
    "Known + Unknown location page views must equal Page Views.",
  );
  for (const day of data.daily ?? []) {
    assert.equal(
      day.known_location_page_views + day.unknown_location_page_views,
      day.page_views,
      `Daily location reconciliation failed for ${day.date}.`,
    );
  }
  const locationTotal = (data.locations ?? []).reduce(
    (total, row) => total + Number(row.page_views ?? 0),
    0,
  );
  assert.ok(
    locationTotal <= summary.page_views,
    "Ranked complete locations must never exceed Page Views.",
  );
}

const service = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const admin = createClient(url, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const { error: signInError } = await admin.auth.signInWithPassword({
  email: adminEmail,
  password: adminPassword,
});
if (signInError) throw signInError;

const today = isoDateInIst();
const dayMinus6 = shiftIsoDate(today, -6);
const dayMinus29 = shiftIsoDate(today, -29);
const dayMinus31 = shiftIsoDate(today, -31);

const { error: cleanError } = await service
  .from("analytics_events")
  .delete()
  .gte("id", 0);
if (cleanError) throw cleanError;

const rows = [
  pageView({
    date: today, visitor: "a", session: "a1", path: "/",
    city: "Pune", region: "Maharashtra", regionCode: "MH", country: "IN",
  }),
  // Same visitor/session/page again is a legitimate rapid reload and must
  // remain a second page view rather than being time-window deduplicated.
  pageView({
    date: today, visitor: "a", session: "a1", path: "/",
    city: "Pune", region: "Maharashtra", regionCode: "MH", country: "IN",
  }),
  {
    ...pageView({
      date: today, visitor: "a", session: "a2", path: "/pdf",
      city: "Pune", region: "Maharashtra", regionCode: "MH", country: "IN",
    }),
    occurred_at: new Date(
      new Date(noonIst(today)).getTime() + 2 * 60_000,
    ).toISOString(),
    device_class: "mobile",
    browser_family: "Safari",
    operating_system: "iOS",
  },
  pageView({
    date: today, visitor: "b", session: "b1", path: "/pdf/merge",
    city: "Omaha", region: "Nebraska", regionCode: "NE", country: "US",
  }),
  pageView({
    date: today, visitor: "c", session: "c1", path: "/pdf",
  }),
  pageView({
    date: today, visitor: "d", session: "d1", path: "/pdf",
    region: "Maharashtra", regionCode: "MH", country: "IN",
  }),
  pageView({
    date: today, visitor: "synthetic", session: "synthetic", path: "/pdf",
    city: "Des Moines", region: "Iowa", regionCode: "IA", country: "US",
    trafficClass: "synthetic",
  }),
  pageView({
    date: dayMinus6, visitor: "f", session: "f1", path: "/pdf/split",
    city: "Bengaluru", region: "Karnataka", regionCode: "KA", country: "IN",
  }),
  pageView({
    date: dayMinus29, visitor: "g", session: "g1", path: "/pdf/compress",
    city: "Tirupati", region: "Andhra Pradesh", regionCode: "AP", country: "IN",
  }),
  pageView({
    date: dayMinus31, visitor: "h", session: "h1", path: "/pdf/sign",
    city: "Mumbai", region: "Maharashtra", regionCode: "MH", country: "IN",
  }),
];

const { error: insertError } = await service.from("analytics_events").insert(rows);
if (insertError) throw insertError;

const lifecycleRows = [
  lifecycleEvent({
    date: today,
    eventName: "processing_started",
    tool: "merge",
    visitor: "op",
    session: "op",
    minuteOffset: 10,
  }),
  lifecycleEvent({
    date: today,
    eventName: "processing_succeeded",
    tool: "merge",
    visitor: "op",
    session: "op",
    minuteOffset: 11,
    durationMs: 1200,
    success: true,
  }),
  lifecycleEvent({
    date: today,
    eventName: "processing_started",
    tool: "compress",
    visitor: "op",
    session: "op",
    minuteOffset: 12,
  }),
  lifecycleEvent({
    date: today,
    eventName: "processing_failed",
    tool: "compress",
    visitor: "op",
    session: "op",
    minuteOffset: 13,
    durationMs: 900,
    success: false,
    errorCode: "processing_error",
    failureStage: "converting",
  }),
  lifecycleEvent({
    date: today,
    eventName: "processing_started",
    tool: "split",
    visitor: "op",
    session: "op",
    minuteOffset: 14,
  }),
  lifecycleEvent({
    date: today,
    eventName: "processing_started",
    tool: "organize",
    visitor: "op",
    session: "op",
    minuteOffset: 15,
  }),
  lifecycleEvent({
    date: today,
    eventName: "processing_cancelled",
    tool: "organize",
    visitor: "op",
    session: "op",
    minuteOffset: 16,
    durationMs: 400,
    success: false,
    errorCode: "user_cancelled",
    failureStage: "converting",
  }),
];

for (const row of lifecycleRows) {
  const { error } = await service.from("analytics_events").insert(row);
  if (error) throw error;
}

// Preserve one historical-style uncorrelated terminal event. Primary operation
// metrics must ignore it and diagnostics must surface it.
const { error: uncorrelatedError } = await service
  .from("analytics_events")
  .insert(
    lifecycleEvent({
      date: today,
      eventName: "processing_succeeded",
      tool: "merge",
      visitor: "legacy-op",
      session: "legacy-op",
      minuteOffset: 17,
      durationMs: 500,
      success: true,
    }),
  );
if (uncorrelatedError) throw uncorrelatedError;

// Preserve one legacy row to prove pre-cutover browser events are retained but
// excluded from every verified audience metric.
const { error: legacyInsertError } = await service.from("analytics_events").insert({
  event_name: "page_view",
  tool_slug: null,
  anonymous_session_id: randomUUID(),
  occurred_at: noonIst(today),
  duration_ms: null,
  input_size_bucket: "unknown",
  output_size_bucket: "unknown",
  device_class: "desktop",
  browser_family: "Chrome",
  operating_system: "Linux",
  country_code: "US",
  success: null,
  error_code: null,
  failure_stage: null,
  metadata: {},
  region: "Virginia",
  city: "Boydton",
  visitor_key: null,
  session_key: null,
  traffic_class: null,
  traffic_class_reason: null,
  geo_source: null,
  geo_precision: null,
  region_code: null,
  page_path: null,
  referrer_host: null,
  landing_path: null,
  acquisition_source: null,
  utm_source: null,
  utm_medium: null,
  utm_campaign: null,
  analytics_schema_version: 1,
});
if (legacyInsertError) throw legacyInsertError;

// The verified writer intentionally obeys the live public analytics switch.
// The disposable test database starts with analytics disabled, so enable it
// explicitly before testing accepted server-side writes.
const { error: enableAnalyticsError } = await service
  .from("site_settings")
  .upsert(
    {
      key: "public_analytics_enabled",
      value: { enabled: true },
      is_public: true,
      description: "Disposable runtime verification setting.",
    },
    { onConflict: "key" },
  );
if (enableAnalyticsError) throw enableAnalyticsError;

// Runtime-prove the protected server writer: anonymous callers cannot use the
// retired browser RPC, the wrong ingest secret fails, and the correct private
// header can write a schema-v2 event.
const ingestSecret = randomBytes(48).toString("hex");
const { error: rotateError } = await service.rpc(
  "rotate_analytics_ingest_secret",
  { p_secret: ingestSecret },
);
if (rotateError) throw rotateError;

const retiredClient = createClient(url, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const { error: retiredWriterError } = await retiredClient.rpc(
  "record_public_analytics_event",
  {
    event_name: "page_view",
    tool_slug: null,
    anonymous_session_id: randomUUID(),
    duration_ms: null,
    input_size_bucket: "unknown",
    output_size_bucket: "unknown",
    device_class: "desktop",
    browser_family: "Chrome",
    operating_system: "Linux",
    success: null,
    error_code: null,
    country_code: "US",
    region: "Virginia",
    city: "Boydton",
    failure_stage: null,
  },
);
assert.ok(
  retiredWriterError,
  "15-argument legacy browser analytics writer must be revoked.",
);

function serverWriterArgs(secretLabel) {
  return {
    p_event_name: "page_view",
    p_tool_slug: null,
    p_visitor_key: analyticsKey(`writer-visitor:${secretLabel}`),
    p_session_key: analyticsKey(`writer-session:${secretLabel}`),
    p_request_key: analyticsKey(`writer-request:${secretLabel}`),
    p_traffic_class: "synthetic",
    p_traffic_class_reason: "lumeo_owned_production_test",
    p_duration_ms: null,
    p_input_size_bucket: "unknown",
    p_output_size_bucket: "unknown",
    p_device_class: "desktop",
    p_browser_family: "Chrome",
    p_operating_system: "Linux",
    p_success: null,
    p_error_code: null,
    p_country_code: "US",
    p_region: "Virginia",
    p_region_code: "VA",
    p_city: "Boydton",
    p_geo_source: "cloudflare",
    p_geo_precision: "city",
    p_page_path: "/runtime-writer-check",
    p_referrer_host: null,
    p_landing_path: null,
    p_acquisition_source: "direct",
    p_utm_source: null,
    p_utm_medium: null,
    p_utm_campaign: null,
    p_failure_stage: null,
  };
}

const wrongWriter = createClient(url, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
  global: { headers: { "x-lumeo-analytics-ingest": "x".repeat(64) } },
});
const { error: wrongWriterError } = await wrongWriter.rpc(
  "record_server_analytics_event",
  serverWriterArgs("wrong"),
);
assert.ok(wrongWriterError, "Wrong ingest secret must be rejected.");

const correctWriter = createClient(url, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
  global: { headers: { "x-lumeo-analytics-ingest": ingestSecret } },
});
const { data: writerAccepted, error: writerError } = await correctWriter.rpc(
  "record_server_analytics_event",
  serverWriterArgs("correct"),
);
if (writerError) throw writerError;
assert.equal(writerAccepted, true);

const { data: writerRows, error: writerReadError } = await service
  .from("analytics_events")
  .select("analytics_schema_version,traffic_class,country_code,region,city,geo_source,page_path")
  .eq("page_path", "/runtime-writer-check");
if (writerReadError) throw writerReadError;
assert.deepEqual(writerRows, [{
  analytics_schema_version: 2,
  traffic_class: "synthetic",
  country_code: "US",
  region: "Virginia",
  city: "Boydton",
  geo_source: "cloudflare",
  page_path: "/runtime-writer-check",
}]);
const { error: writerCleanError } = await service
  .from("analytics_events")
  .delete()
  .eq("page_path", "/runtime-writer-check");
if (writerCleanError) throw writerCleanError;

async function verified(startDate, endDate, scope = "real_audience") {
  const { data, error } = await admin.rpc("get_admin_verified_traffic", {
    p_start_date: startDate,
    p_end_date: endDate,
    p_traffic_scope: scope,
  });
  if (error) throw error;
  assertReconciles(data);
  return data;
}

const todayData = await verified(today, today);
const todaySummary = summaryOf(todayData);
assert.deepEqual(
  {
    pageViews: todaySummary.page_views,
    visitors: todaySummary.unique_visitors,
    sessions: todaySummary.sessions,
    known: todaySummary.known_location_page_views,
    unknown: todaySummary.unknown_location_page_views,
  },
  { pageViews: 6, visitors: 4, sessions: 5, known: 4, unknown: 2 },
);
assert.deepEqual(
  {
    started: todaySummary.processing_started,
    succeeded: todaySummary.processing_succeeded,
    failed: todaySummary.processing_failed,
    cancelled: todaySummary.processing_cancelled,
    unfinished: todaySummary.unfinished_attempts,
  },
  { started: 4, succeeded: 1, failed: 1, cancelled: 1, unfinished: 1 },
);
assert.equal(
  todaySummary.processing_started,
  todaySummary.processing_succeeded +
    todaySummary.processing_failed +
    todaySummary.processing_cancelled +
    todaySummary.unfinished_attempts,
);
assert.equal(todayData.integrity.lifecycle_reconciles, true);
assert.equal(todayData.integrity.uncorrelated_processing_events, 1);
assert.equal(todayData.integrity.reconciliation_issue, true);
assert.equal(todayData.daily.length, 1);
assert.equal(todayData.daily[0].page_views, 6);

const locations = new Map(
  todayData.locations.map((row) => [`${row.city}|${row.region_code}|${row.country_code}`, row]),
);
assert.equal(locations.get("Pune|MH|IN")?.page_views, 3);
assert.equal(locations.get("Omaha|NE|US")?.page_views, 1);
assert.equal(todayData.locations.some((row) => row.city == null), false);

const environmentTotals = {
  device: todayData.device_summary.reduce(
    (total, row) => total + Number(row.visitors ?? 0),
    0,
  ),
  browser: todayData.browser_summary.reduce(
    (total, row) => total + Number(row.visitors ?? 0),
    0,
  ),
  os: todayData.operating_system_summary.reduce(
    (total, row) => total + Number(row.visitors ?? 0),
    0,
  ),
};
assert.deepEqual(environmentTotals, { device: 4, browser: 4, os: 4 });
assert.equal(todayData.integrity.environment_reconciles, true);
const devices = new Map(
  todayData.device_summary.map((row) => [row.label, Number(row.visitors)]),
);
assert.equal(devices.get("mobile"), 1);
assert.equal(devices.get("desktop"), 3);

const countries = new Map(todayData.countries.map((row) => [row.country_code, row.page_views]));
assert.equal(countries.get("IN"), 4, "Partial India geography still contributes to country analytics.");
assert.equal(countries.get("US"), 1);
assert.ok([...countries.values()].reduce((sum, value) => sum + Number(value), 0) <= todaySummary.page_views);

const sevenStart = shiftIsoDate(today, -6);
const seven = await verified(sevenStart, today);
assert.equal(seven.daily.length, 7);
assert.ok(
  seven.daily.some((day) => Number(day.page_views) === 0),
  "Seven-day trend must retain zero-traffic IST calendar days.",
);
assert.deepEqual(
  {
    pageViews: seven.summary.page_views,
    visitors: seven.summary.unique_visitors,
    sessions: seven.summary.sessions,
    known: seven.summary.known_location_page_views,
    unknown: seven.summary.unknown_location_page_views,
  },
  { pageViews: 7, visitors: 5, sessions: 6, known: 5, unknown: 2 },
);

const thirtyStart = shiftIsoDate(today, -29);
const thirty = await verified(thirtyStart, today);
assert.equal(thirty.daily.length, 30);
assert.ok(
  thirty.daily.some((day) => Number(day.page_views) === 0),
  "Thirty-day trend must retain zero-traffic IST calendar days.",
);
assert.equal(thirty.summary.page_views, 8);
assert.equal(thirty.summary.known_location_page_views, 6);
assert.equal(thirty.summary.unknown_location_page_views, 2);

const custom = await verified(dayMinus31, dayMinus31);
assert.equal(custom.daily.length, 1);
assert.equal(custom.summary.page_views, 1);
assert.equal(custom.locations[0]?.city, "Mumbai");

const synthetic = await verified(today, today, "synthetic");
assert.equal(synthetic.summary.page_views, 1);
assert.equal(synthetic.locations[0]?.city, "Des Moines");

assert.equal(
  todayData.integrity.legacy_page_views,
  1,
  "Historical schema-v1 traffic must remain preserved for audit.",
);
assert.equal(
  todayData.summary.page_views,
  6,
  "Historical schema-v1 traffic must not pollute verified business traffic.",
);

const recentCutoff = new Date(Date.now() - 30 * 60_000).toISOString();
const { error: recentCleanError } = await service
  .from("analytics_events")
  .delete()
  .eq("event_name", "page_view")
  .gte("occurred_at", recentCutoff);
if (recentCleanError) throw recentCleanError;

for (let index = 0; index < 3; index += 1) {
  const liveRow = pageView({
    date: today,
    visitor: `live-${index}`,
    session: `live-${index}`,
    path: `/live-${index}`,
    city: "Pune",
    region: "Maharashtra",
    regionCode: "MH",
    country: "IN",
  });
  liveRow.occurred_at = new Date(Date.now() - index * 10_000).toISOString();
  const { error } = await service.from("analytics_events").insert(liveRow);
  if (error) throw error;
}

const { data: liveData, error: liveError } = await admin.rpc(
  "get_admin_live_analytics_v2",
  { p_traffic_scope: "real_audience" },
);
if (liveError) throw liveError;
assert.equal(liveData.summary.page_views_last_five_minutes, 3);
assert.equal(liveData.summary.known_location_page_views_last_five_minutes, 3);
assert.equal(liveData.summary.unknown_location_page_views_last_five_minutes, 0);
assert.equal(
  liveData.recent_hits.filter((hit) => hit.city === "Pune").length,
  3,
  "Three recent Pune hits must reconcile to three known-location hits.",
);

const { data: operationalRows, error: operationalError } = await admin.rpc(
  "get_admin_recent_operational_events_v3",
  { p_limit: 40 },
);
if (operationalError) throw operationalError;
assert.ok(
  operationalRows.every((row) => row.event_name !== "page_view"),
  "Recent operational activity must not duplicate Live Traffic page views.",
);
assert.ok(operationalRows.length <= 40);

console.log("PASS verified analytics runtime semantics, security and reconciliation.");
