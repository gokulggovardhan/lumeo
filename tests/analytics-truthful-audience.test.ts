import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  SYNTHETIC_TRAFFIC_HEADER,
  SYNTHETIC_TRAFFIC_VALUE,
  acquisitionSource,
  analyticsHmac,
  classifyTraffic,
  parseServerAnalyticsInput,
  readTrustedGeo,
} from "../lib/analytics/server-ingest.ts";

test("server analytics trusts Cloudflare visitor geography and preserves full India region", () => {
  const request = new Request("https://lumeo.in/") as Request & {
    cf?: Record<string, unknown>;
  };
  request.cf = {
    city: "Pune",
    region: "Maharashtra",
    regionCode: "MH",
    country: "IN",
    colo: "BOM",
  };
  assert.deepEqual(readTrustedGeo(request), {
    city: "Pune",
    region: "Maharashtra",
    regionCode: "MH",
    countryCode: "IN",
    geoSource: "cloudflare",
    geoPrecision: "city",
  });
});

test("partial or missing geography never fabricates fields", () => {
  const countryOnly = new Request("https://lumeo.in/") as Request & {
    cf?: Record<string, unknown>;
  };
  countryOnly.cf = { country: "IN", colo: "BOM" };
  assert.deepEqual(readTrustedGeo(countryOnly), {
    city: null,
    region: null,
    regionCode: null,
    countryCode: "IN",
    geoSource: "cloudflare",
    geoPrecision: "country",
  });

  const missing = new Request("https://lumeo.in/");
  assert.deepEqual(readTrustedGeo(missing), {
    city: null,
    region: null,
    regionCode: null,
    countryCode: null,
    geoSource: "unresolved",
    geoPrecision: "unresolved",
  });
});

test("only explicit Lumeo audits or Cloudflare-verified bots leave real audience", () => {
  const synthetic = new Request("https://lumeo.in/", {
    headers: { [SYNTHETIC_TRAFFIC_HEADER]: SYNTHETIC_TRAFFIC_VALUE },
  });
  assert.equal(classifyTraffic(synthetic).trafficClass, "synthetic");

  const bot = new Request("https://lumeo.in/") as Request & {
    cf?: { botManagement?: { verifiedBot?: boolean } };
  };
  bot.cf = { botManagement: { verifiedBot: true } };
  assert.equal(classifyTraffic(bot).trafficClass, "known_bot");

  const ordinary = new Request("https://lumeo.in/");
  assert.equal(classifyTraffic(ordinary).trafficClass, "real_audience");
});

test("pseudonymous analytics keys are fixed-length and do not reveal source token", async () => {
  const key = await analyticsHmac("a".repeat(64), "visitor", "raw-cookie-token");
  assert.match(key, /^[A-Za-z0-9_-]{43}$/);
  assert.doesNotMatch(key, /raw-cookie-token/);
});

test("event parser accepts approved product fields but no client geography", () => {
  const parsed = parseServerAnalyticsInput({
    eventName: "page_view",
    pagePath: "/pdf/merge",
    city: "Fake City",
    region: "Fake Region",
    countryCode: "US",
  });
  assert.ok(parsed);
  assert.equal(parsed.pagePath, "/pdf/merge");
  assert.equal("city" in parsed, false);
  assert.equal("region" in parsed, false);
  assert.equal("countryCode" in parsed, false);
});

test("campaign/referrer classification is bounded and non-geographic", () => {
  const base = parseServerAnalyticsInput({
    eventName: "page_view",
    pagePath: "/",
    referrerHost: "www.google.com",
  });
  assert.ok(base);
  assert.equal(acquisitionSource(base), "google");
});

test("browser client posts to first-party route and no longer reads or submits geo cookie", () => {
  const client = readFileSync("lib/analytics/client.ts", "utf8");
  assert.match(client, /fetch\("\/api\/analytics\/event"/);
  assert.doesNotMatch(client, /readGeoCookie|country_code|record_public_analytics_event|getAnonymousSessionId/);
});

test("proxy no longer exposes visitor geography in a browser-readable cookie", () => {
  const proxy = readFileSync("lib/supabase/proxy.ts", "utf8");
  assert.doesNotMatch(proxy, /GEO_COOKIE_NAME|applyGeoCookie|encodeAnalyticsGeoCookie/);
});

test("production browser certification is explicitly classified synthetic", () => {
  const config = readFileSync("playwright.cloudflare-production.config.ts", "utf8");
  assert.match(config, /x-lumeo-synthetic-traffic/);
  assert.match(config, /cloudflare-production-audit/);
});

test("traffic RPC guarantees known plus unknown equals page views", () => {
  const migration = readFileSync(
    "supabase/migrations/20261004090000_truthful_audience_analytics.sql",
    "utf8",
  );
  assert.match(migration, /known_location_page_views/);
  assert.match(migration, /unknown_location_page_views/);
  assert.match(migration, /event_name='page_view'/);
  assert.match(migration, /analytics_schema_version=2/);
  assert.match(migration, /traffic_class/);
  assert.match(migration, /full_locations/);
  assert.match(migration, /get_admin_traffic_analytics/);
  assert.doesNotMatch(migration, /\bcolo\b/i);
});

test("Admin primary traffic view exposes page views, visitors, sessions and Unknown Location", () => {
  const page = readFileSync("app/admin/(protected)/analytics/page.tsx", "utf8");
  for (const label of [
    "Page Views",
    "Unique Visitors",
    "Sessions",
    "Known Location",
    "Unknown Location",
    "Top locations",
    "Daily traffic",
  ]) {
    assert.ok(page.includes(label), `missing Admin analytics label: ${label}`);
  }
  assert.match(page, /knownLocationPageViews.*unknownLocationPageViews/s);
});

test("analytics source contains no browser GPS or default US-city fallbacks", () => {
  const combined = [
    readFileSync("lib/analytics/client.ts", "utf8"),
    readFileSync("lib/analytics/server-ingest.ts", "utf8"),
    readFileSync("app/api/analytics/event/route.ts", "utf8"),
  ].join("\n");
  assert.doesNotMatch(combined, /navigator\.geolocation|getCurrentPosition|watchPosition/);
  assert.doesNotMatch(
    combined,
    /San Francisco|Dallas|New York|Los Angeles|Ashburn|Omaha/,
  );
});
