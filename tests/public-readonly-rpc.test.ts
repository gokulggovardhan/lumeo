import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("public layout data no longer imports Supabase browser SDK", () => {
  const analytics = read("lib/analytics/client.ts");
  const banner = read("components/AnnouncementBanner.tsx");
  assert.doesNotMatch(analytics + banner, /createClient|@\/lib\/supabase\/client/);
  assert.match(analytics, /fetch\("\/api\/analytics\/setting"/);
  assert.match(banner, /fetch\("\/api\/public\/announcements"/);
  assert.match(analytics, /trackPublicAnalyticsEvent/);
  assert.match(banner, /parseAnnouncement/);
});

test("public read-only endpoints are explicit, bounded, anonymous and fail closed", () => {
  const rpc = read("lib/public-site/read-public-rpc.ts");
  const setting = read("app/api/analytics/setting/route.ts");
  const announcements = read("app/api/public/announcements/route.ts");
  assert.match(rpc, /get_public_analytics_setting/);
  assert.match(rpc, /get_public_announcements/);
  assert.match(rpc, /import "server-only"/);
  assert.match(rpc, /apikey: publishableKey/);
  assert.match(rpc, /method: "POST"/);
  assert.match(rpc, /PUBLIC_RPC_TIMEOUT_MS/);
  assert.doesNotMatch(rpc + setting + announcements, /service_role|SUPABASE_SECRET_KEY|localStorage|sessionStorage|\.from\(|request\.cookies|request\.body/);
  assert.match(setting, /enabled: enabled === true/);
  assert.match(announcements, /Array\.isArray\(items\) \? items : \[\]/);
  assert.match(setting + announcements, /no-store/);
});
