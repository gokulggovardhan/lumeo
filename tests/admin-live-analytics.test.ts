import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("live Admin analytics remains verified, private and page-view based", () => {
  const migration = readFileSync(
    "supabase/migrations/20261004110000_admin_live_traffic.sql",
    "utf8",
  );
  const data = readFileSync("lib/admin/verified-analytics.ts", "utf8");
  const route = readFileSync(
    "app/admin/(protected)/analytics/live/route.ts",
    "utf8",
  );
  const panel = readFileSync(
    "components/admin/analytics/LiveTrafficPanel.tsx",
    "utf8",
  );
  const page = readFileSync(
    "app/admin/(protected)/analytics/page.tsx",
    "utf8",
  );

  assert.match(migration, /^begin;/im);
  assert.match(migration, /^commit;/im);
  assert.match(migration, /get_admin_live_analytics_v2/);
  assert.match(migration, /analytics_schema_version = 2/);
  assert.match(migration, /event_name = 'page_view'/);
  assert.match(migration, /interval '1 minute'/);
  assert.match(migration, /interval '5 minutes'/);
  assert.match(migration, /count\(distinct visitor_key\)/);
  assert.match(migration, /count\(distinct session_key\)/);
  assert.match(migration, /geo_source = 'cloudflare'/);
  assert.match(migration, /revoke all on function public\.get_admin_live_analytics_v2\(text\) from anon/);
  assert.match(migration, /grant execute on function public\.get_admin_live_analytics_v2\(text\) to authenticated/);

  for (const forbidden of [
    "cf-connecting-ip",
    "anonymous_session_id",
    "raw_ip",
    "latitude",
    "longitude",
    "street_address",
  ]) {
    assert.doesNotMatch(migration, new RegExp(forbidden, "i"));
    assert.doesNotMatch(panel, new RegExp(forbidden, "i"));
  }

  assert.match(data, /get_admin_live_analytics_v2/);
  assert.match(data, /knownLocationPageViewsLastFiveMinutes \+ unknownLocationPageViewsLastFiveMinutes/);
  assert.doesNotMatch(data, /\.from\("analytics_events"\)/);

  assert.match(route, /getAdminContext/);
  assert.match(route, /canViewAnalytics/);
  assert.match(route, /private, no-store/);
  assert.match(route, /status: 401/);
  assert.match(route, /status: 403/);
  assert.match(route, /getVerifiedLiveTraffic\("real_audience"\)/);
  assert.doesNotMatch(route, /searchParams/);
  assert.doesNotMatch(route, /synthetic|automation|all/);

  assert.match(panel, /REFRESH_INTERVAL_MS = 10_000/);
  assert.match(panel, /Hits · 60 sec/);
  assert.match(panel, /Active Visitors/);
  assert.match(panel, /Active Sessions/);
  assert.match(panel, /Recent hits/);
  assert.match(panel, /Near-real-time Real Audience page views/);
  assert.doesNotMatch(panel, /Lumeo synthetic tests|Bots & suspected automation|All verified traffic/);
  assert.match(panel, /Unknown Location/);
  assert.match(panel, /No IP address or visitor\/session identifier is displayed/);

  assert.match(page, /LiveTrafficPanel/);
  assert.match(page, /getVerifiedLiveTraffic/);
});

test("live traffic keeps hit semantics separate from raw requests", () => {
  const migration = readFileSync(
    "supabase/migrations/20261004110000_admin_live_traffic.sql",
    "utf8",
  );
  const panel = readFileSync(
    "components/admin/analytics/LiveTrafficPanel.tsx",
    "utf8",
  );

  assert.match(migration, /where event_name = 'page_view'/);
  assert.match(panel, /Verified Page Views in the rolling last 60 seconds/);
  assert.doesNotMatch(panel, /HTTP requests|request hits|static requests/i);
});
