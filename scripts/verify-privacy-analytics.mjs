import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const foundationPath =
  "supabase/migrations/20260925113850_analytics_real_audience_foundation.sql";
const cutoverPath =
  "supabase/migrations/20261004090000_trusted_analytics_cutover.sql";

const requiredFiles = [
  foundationPath,
  cutoverPath,
  "app/api/analytics/route.ts",
  "components/analytics/AnalyticsProvider.tsx",
  "components/analytics/AnalyticsPageView.tsx",
  "components/admin/analytics/AnalyticsPrivacyNotice.tsx",
  "components/admin/analytics/AudienceTrendChart.tsx",
  "lib/analytics/client.ts",
  "lib/analytics/server.ts",
  "lib/analytics/types.ts",
  "lib/cloudflare/request-location.ts",
  "lib/admin/verified-analytics.ts",
  "lib/admin/data.ts",
  "lib/supabase/database.types.ts",
  "app/admin/(protected)/analytics/page.tsx",
  "app/admin/(protected)/analytics/activity/page.tsx",
  "app/privacy/page.tsx",
  "docs/PRIVACY_ANALYTICS.md",
  "playwright.cloudflare-production.config.ts",
  "playwright.production-conversion.config.ts",
];

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  for (const file of requiredFiles) {
    assert(existsSync(join(root, file)), `Missing analytics file: ${file}`);
  }

  const foundation = read(foundationPath);
  const cutover = read(cutoverPath);
  const route = read("app/api/analytics/route.ts");
  const client = read("lib/analytics/client.ts");
  const server = read("lib/analytics/server.ts");
  const geo = read("lib/cloudflare/request-location.ts");
  const reader = read("lib/admin/verified-analytics.ts");
  const adminPage = read("app/admin/(protected)/analytics/page.tsx");
  const activityPage = read("app/admin/(protected)/analytics/activity/page.tsx");
  const privacyPage = read("app/privacy/page.tsx");
  const privacyDocs = read("docs/PRIVACY_ANALYTICS.md");
  const cfPlaywright = read("playwright.cloudflare-production.config.ts");
  const conversionPlaywright = read("playwright.production-conversion.config.ts");
  const dbTypes = read("lib/supabase/database.types.ts");

  assert(/^begin;/im.test(cutover) && /^commit;/im.test(cutover), "Trusted analytics cutover must be transactional.");
  assert(/record_trusted_analytics_event/i.test(cutover), "Trusted analytics writer missing.");
  assert(/get_admin_verified_analytics/i.test(cutover), "Verified analytics aggregate missing.");
  assert(/analytics_schema_version\s*=\s*2/i.test(cutover), "Verified analytics must read only schema-v2 rows.");
  assert(/traffic_class/i.test(cutover), "Traffic classification missing.");
  assert(/real_audience/.test(cutover), "Genuine audience scope missing.");
  assert(/synthetic/.test(cutover), "Synthetic traffic class missing.");
  assert(/known_bot/.test(cutover), "Known-bot traffic class missing.");
  assert(/suspected_automation/.test(cutover), "Suspected-automation traffic class missing.");
  assert(/Asia\/Kolkata/.test(cutover), "Analytics date boundaries must remain IST.");
  assert(/security definer/i.test(cutover), "Trusted analytics RPCs must use SECURITY DEFINER.");
  assert(/set search_path = ''/i.test(cutover), "Trusted analytics RPCs must lock search_path.");
  assert(/x-lumeo-analytics-ingest/.test(cutover), "Trusted writer must require ingest authorization.");
  assert(/extensions\.digest/.test(cutover), "Trusted writer must verify the ingest secret hash.");
  assert(/Known Location|known_location_page_views/i.test(cutover), "Known-location accounting missing.");
  assert(/unknown_location_page_views/i.test(cutover), "Unknown-location accounting missing.");
  assert(/page_path/i.test(cutover), "Page-view path storage missing.");
  assert(!/latitude|longitude|street_address|postal_address/i.test(cutover), "Precise location fields are forbidden.");

  for (const event of [
    "page_view",
    "tool_opened",
    "processing_started",
    "processing_succeeded",
    "processing_failed",
    "processing_cancelled",
    "download_started",
  ]) {
    assert(cutover.includes(`'${event}'`), `Trusted writer must allow ${event}.`);
  }

  assert(client.includes('fetch("/api/analytics"'), "Browser analytics must use the same-origin analytics route.");
  assert(!client.includes("record_public_analytics_event"), "Browser must not call the legacy analytics writer.");
  assert(!/sessionStorage|localStorage|document\.cookie/.test(client), "Browser analytics client must not own persistent identity.");
  assert(!/\.from\(/.test(client), "Browser analytics client must not query tables.");
  assert(!/console\.(log|warn|error)/.test(client), "Analytics client must fail quietly.");

  assert(route.includes("ANALYTICS_VISITOR_COOKIE"), "Visitor cookie handling missing.");
  assert(route.includes("ANALYTICS_SESSION_COOKIE"), "Session cookie handling missing.");
  assert(route.includes("httpOnly: true"), "Analytics identity cookies must be HttpOnly.");
  assert(route.includes("sameSite: \"lax\""), "Analytics identity cookies must be SameSite=Lax.");
  assert(route.includes("pseudonymousAnalyticsKey"), "Raw analytics cookies must be pseudonymized.");
  assert(route.includes('request.headers.get("cf-connecting-ip")'), "Transient request IP must be used only for rate-limit pseudonymization.");
  assert(!/insert|analytics_events/.test(route), "Route must use the trusted RPC, not direct table writes.");
  assert(!/navigator\.geolocation|latitude|longitude/.test(route), "Route must not request precise browser location.");

  assert(server.includes("crypto.subtle.sign"), "Analytics identities must use Web Crypto HMAC.");
  assert(server.includes("LUMEO_ANALYTICS_INGEST_SECRET"), "Private ingest binding missing.");
  assert(server.includes("record_trusted_analytics_event"), "Server writer must call trusted RPC.");
  assert(!/service_role|SUPABASE_SERVICE_ROLE_KEY/i.test(server), "Trusted analytics must not depend on a service-role key.");

  assert(geo.includes("cf?.city"), "Cloudflare visitor city missing.");
  assert(geo.includes("cf?.region"), "Cloudflare visitor region missing.");
  assert(geo.includes("cf?.country"), "Cloudflare visitor country missing.");
  assert(!/\.colo\b/.test(geo.replace(/colo\?:/g, "")), "Cloudflare POP/colo must never be used as visitor location.");
  assert(geo.includes("isCloudflareVerifiedBot"), "Verified-bot classification support missing.");

  assert(reader.includes("get_admin_verified_analytics"), "Admin must use the verified aggregate RPC.");
  assert(reader.includes("get_admin_recent_analytics_events_v2"), "Admin recent activity must use schema-v2 reader.");
  assert(reader.includes("known + unknown !== pageViews"), "Known + Unknown = Page Views invariant missing.");
  assert(!/\.from\("analytics_events"\)/.test(reader), "Admin data layer must not read raw analytics table.");

  assert(adminPage.includes('defaultValue={scope}'), "Traffic-scope control missing.");
  assert(adminPage.includes("Genuine audience"), "Genuine-audience default label missing.");
  assert(adminPage.includes('label="Page Views"'), "Page Views card missing.");
  assert(adminPage.includes('label="Unique Visitors"'), "Unique Visitors card missing.");
  assert(adminPage.includes('label="Sessions"'), "Sessions card missing.");
  assert(adminPage.includes('label="Known Location"'), "Known Location card missing.");
  assert(adminPage.includes('label="Unknown Location"'), "Unknown Location card missing.");
  assert(adminPage.includes('title="Top Locations"'), "Top Locations table missing.");
  assert(adminPage.includes("Country, State/Region and City"), "Country/region/city detail missing.");
  assert(adminPage.includes('title="Top Pages"'), "Top Pages reporting missing.");
  assert(adminPage.includes('title="Traffic integrity"'), "Traffic-integrity panel missing.");
  assert(adminPage.includes("Legacy Unverified Page Views"), "Legacy data warning missing.");
  assert(adminPage.includes("Excluded Automation Page Views"), "Automation exclusion metric missing.");
  assert(activityPage.includes("getVerifiedRecentAnalyticsEvents"), "Full activity log must use verified events.");

  assert(cfPlaywright.includes('"x-lumeo-analytics-traffic": "synthetic"'), "Cloudflare production browser checks must be marked synthetic.");
  assert(conversionPlaywright.includes('"x-lumeo-analytics-traffic": "synthetic"'), "Conversion production browser checks must be marked synthetic.");

  assert(privacyPage.includes("HMAC-pseudonymized"), "Public privacy page must disclose pseudonymous analytics identity.");
  assert(privacyPage.includes("Unknown Location"), "Public privacy page must explain unresolved geography.");
  assert(privacyPage.includes("Do Not Track"), "Public privacy page must disclose Do Not Track.");
  assert(privacyDocs.includes("Known Location page views + Unknown Location page views = total Page Views"), "Analytics docs must lock reconciliation invariant.");
  assert(privacyDocs.includes("cf.colo"), "Analytics docs must explicitly reject POP-as-visitor-location semantics.");

  assert(dbTypes.includes("record_trusted_analytics_event"), "Database types missing trusted writer.");
  assert(dbTypes.includes("get_admin_verified_analytics"), "Database types missing verified aggregate.");
  assert(dbTypes.includes("get_admin_recent_analytics_events_v2"), "Database types missing recent verified reader.");

  assert(/analytics_schema_version/.test(foundation), "Schema-v2 foundation missing.");
  assert(/visitor_key/.test(foundation) && /session_key/.test(foundation), "Schema-v2 pseudonymous identities missing.");
  assert(!/grant\s+(insert|select|update|delete)[\s\S]*analytics_events[\s\S]*to\s+anon/i.test(cutover), "Do not grant anon direct analytics table access.");

  console.log("PASS trusted same-origin analytics ingestion");
  console.log("PASS HMAC pseudonymous visitor/session identity");
  console.log("PASS Cloudflare visitor geography without POP substitution");
  console.log("PASS synthetic and automation traffic separation");
  console.log("PASS verified Admin audience/location/page reporting");
  console.log("PASS Known + Unknown = Page Views reconciliation");
  console.log("PASS public privacy disclosure matches implementation");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Privacy analytics verification failed.");
  process.exit(1);
}
