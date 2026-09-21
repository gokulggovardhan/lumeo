import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { summarizeHealthStatus } from "../lib/admin/health-status.ts";
import { PUBLIC_ROUTE_PATHS } from "../lib/public-site/routes.ts";

function read(path: string) {
  return readFileSync(path, "utf8");
}

test("health summary distinguishes required and optional dependencies", () => {
  assert.equal(summarizeHealthStatus([
    { status: "ok", required: true },
    { status: "not_configured", required: false },
  ]), "ok");
  assert.equal(summarizeHealthStatus([
    { status: "ok", required: true },
    { status: "not_configured", required: true },
  ]), "not_configured");
  assert.equal(summarizeHealthStatus([
    { status: "ok", required: true },
    { status: "down", required: false },
  ]), "degraded");
  assert.equal(summarizeHealthStatus([
    { status: "degraded", required: true },
    { status: "ok", required: false },
  ]), "degraded");
  assert.equal(summarizeHealthStatus([
    { status: "down", required: true },
    { status: "ok", required: false },
  ]), "down");
});

test("Admin SEO and sitemap share one intentional public route registry", () => {
  const sitemap = read("app/sitemap.ts");
  const seo = read("app/admin/(protected)/seo/page.tsx");

  assert.match(sitemap, /PUBLIC_ROUTE_CONFIG/);
  assert.match(seo, /PUBLIC_ROUTE_PATHS/);
  assert.equal(new Set(PUBLIC_ROUTE_PATHS).size, PUBLIC_ROUTE_PATHS.length);
  assert.ok(PUBLIC_ROUTE_PATHS.includes("/heic-to-jpeg"));
  assert.ok(PUBLIC_ROUTE_PATHS.includes("/pdf/html-to-pdf"));
  assert.ok(PUBLIC_ROUTE_PATHS.includes("/contact"));
  assert.ok(PUBLIC_ROUTE_PATHS.every((route) => !route.startsWith("/admin")));
  assert.ok(PUBLIC_ROUTE_PATHS.every((route) => !route.startsWith("/api")));
  assert.equal(PUBLIC_ROUTE_PATHS.includes("/features"), false);
});

test("Admin Errors renders sanitized diagnostics as inert expandable text", () => {
  const errorsPage = read("app/admin/(protected)/errors/page.tsx");

  assert.match(errorsPage, /sanitizeErrorDiagnostic/);
  assert.match(errorsPage, /<pre/);
  assert.match(errorsPage, /safeStack/);
  assert.doesNotMatch(errorsPage, /\{log\.stack\}/);
  assert.doesNotMatch(errorsPage, /dangerouslySetInnerHTML/);
});

test("maintenance mode has explicit two-stage enable confirmation and server enforcement", () => {
  const settings = read("app/admin/(protected)/settings/page.tsx");
  const button = read("components/admin/MaintenanceModeSubmitButton.tsx");
  const action = read("app/admin/(protected)/settings/actions.ts");

  assert.match(settings, /MaintenanceModeSubmitButton wasEnabled=\{enabled\}/);
  assert.match(settings, /aria-label=/);
  assert.match(button, /role="alertdialog"/);
  assert.match(button, /Enable maintenance mode/);
  assert.match(button, /maintenance_confirmation/);
  assert.match(button, /\bCancel\b/);
  assert.doesNotMatch(button, /window\.confirm/);
  assert.match(action, /requireAdmin\(\)/);
  assert.match(action, /canManageSettings\(admin\.role\)/);
  assert.match(action, /maintenance_confirmation/);
  assert.match(action, /confirm-enable/);
  assert.match(action, /if \(error\) return errorState/);
  assert.ok(
    action.indexOf("if (error) return errorState") <
      action.indexOf("await writeAuditLog"),
  );
  assert.match(action, /maintenance mode/);
  assert.match(action, /changes: \{ key, enabled \}/);
});

test("Overview avoids duplicate analytics and retired status queries", () => {
  const data = read("lib/admin/data.ts");
  const page = read("app/admin/(protected)/page.tsx");

  assert.doesNotMatch(data, /getSystemStatus/);
  assert.doesNotMatch(data, /auditActions24h/);
  assert.doesNotMatch(data, /homepage_tool_slots/);
  assert.doesNotMatch(data, /latestDailyMetricDate/);
  assert.doesNotMatch(page, /getSystemStatus/);
  assert.match(page, /data\.recentAuditLogs\[0\]/);
  assert.match(page, /data\.latestAnalyticsEventAt/);
});

test("browser error capture stays behind the same-origin application boundary", () => {
  const client = read("lib/errors/client.ts");
  const route = read("app/api/error-report/route.ts");

  assert.match(client, /fetch\("\/api\/error-report"/);
  assert.match(client, /credentials: "same-origin"/);
  assert.doesNotMatch(client, /createClient\(\)/);
  assert.doesNotMatch(client, /\.rpc\("record_error_event"/);

  assert.match(route, /createClient/);
  assert.match(route, /\.rpc\("record_error_event"/);
  assert.match(route, /sameOriginPageUrl/);
  assert.match(route, /LUMEO_BUILD_SHA/);
  assert.match(route, /rate limit/i);
});

test("error-ingestion hardening keeps counters private and covers null-session abuse", () => {
  const migration = read("supabase/migrations/20260919170000_error_ingest_rate_limit.sql");
  const runtimeTest = read("scripts/verify-error-ingest-rate-limit.mjs");

  assert.match(migration, /create schema if not exists private/);
  assert.match(migration, /private\.error_ingest_rate_limits/);
  assert.match(migration, /set search_path = ''/);
  assert.match(migration, /auth\.uid\(\)/);
  assert.match(migration, /'anon:null'/);
  assert.match(migration, /'anon:global'/);
  assert.match(migration, /anonymous_global_limit constant integer := 200/);
  assert.match(migration, /revoke execute .* from public/i);
  assert.match(migration, /grant execute .* to anon, authenticated, service_role/i);
  assert.match(runtimeTest, /null-session limit/);
  assert.match(runtimeTest, /authenticated limit/);
  assert.match(runtimeTest, /current_admin_role/);
});

test("Admin request proxy is Cloudflare-native and enforces production edge safety", () => {
  const proxy = read("lib/supabase/proxy.ts");
  const packageJson = read("package.json");

  const retiredFunctionsPackage = ["@ver", "cel/functions"].join("");
  assert.ok(!proxy.includes(retiredFunctionsPackage));
  assert.ok(!packageJson.includes(retiredFunctionsPackage));
  assert.match(proxy, /readCloudflareApproximateLocation/);
  assert.match(proxy, /productionHttpsRedirect/);
  assert.match(proxy, /PRODUCTION_HOSTS/);
  assert.match(proxy, /X-Frame-Options/);
  assert.match(proxy, /X-Content-Type-Options/);
  assert.match(proxy, /Referrer-Policy/);
  assert.match(proxy, /applyAdminCachePolicy/);
});

test("Cloudflare browser bundle statically receives only public Supabase config", () => {
  const envSource = read("lib/supabase/env.ts");
  const vite = read("vite.config.ts");

  assert.match(envSource, /process\.env\.NEXT_PUBLIC_SUPABASE_URL/);
  assert.match(envSource, /process\.env\.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  assert.doesNotMatch(envSource, /process\.env\[SUPABASE_/);

  assert.match(vite, /"process\.env\.NEXT_PUBLIC_SUPABASE_URL"/);
  assert.match(vite, /"process\.env\.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"/);
  assert.doesNotMatch(vite, /SUPABASE_SERVICE_ROLE_KEY/);
});

test("Admin runtime metadata is Cloudflare-native", () => {
  const health = read("lib/admin/health.ts");
  const overview = read("app/admin/(protected)/page.tsx");
  const timezone = read("lib/admin/timezone.ts");
  const errors = read("lib/errors/server.ts");
  const vite = read("vite.config.ts");

  const retiredEnvPrefix = ["VER", "CEL_"].join("");
  const retiredRuntimeLabel = ["Ver", "cel runtime"].join("");
  for (const source of [health, overview, timezone, errors]) {
    assert.doesNotMatch(source, new RegExp(`${retiredEnvPrefix}[A-Z_]+`));
    assert.ok(!source.includes(retiredRuntimeLabel));
  }
  assert.match(health, /LUMEO_BUILD_SHA/);
  assert.match(health, /LUMEO_DEPLOYMENT_ENV/);
  assert.match(overview, /LUMEO_DEPLOYMENT_ENV/);
  assert.match(errors, /LUMEO_BUILD_SHA/);
  assert.match(vite, /WORKERS_CI_COMMIT_SHA/);
  assert.match(vite, /LUMEO_BUILD_SHA/);
});

test("Admin database-backed pages distinguish unavailable data from valid empty state", () => {
  const expectations = [
    ["app/admin/(protected)/analytics/activity/page.tsx", "recentEvents.error", "Recent activity is unavailable"],
    ["app/admin/(protected)/members/page.tsx", "members.error", "Administrator data is unavailable"],
    ["app/admin/(protected)/seo/page.tsx", "seo.error", "SEO records are unavailable"],
    ["app/admin/(protected)/settings/page.tsx", "settings.error", "Live settings are unavailable"],
    ["app/admin/(protected)/tools/page.tsx", "tools.error || categories.error", "Tool catalog is unavailable"],
    ["app/admin/(protected)/announcements/page.tsx", "announcements.error", "Announcements are unavailable"],
    ["app/admin/(protected)/errors/page.tsx", "summary.error || logs.error", "Error monitoring data is unavailable"],
    ["app/admin/(protected)/audit/page.tsx", "logs.error", "Audit records are unavailable"],
  ] as const;

  for (const [path, errorCheck, message] of expectations) {
    const source = read(path);
    assert.ok(source.includes(errorCheck), `${path} must inspect its read error state`);
    assert.ok(source.includes(message), `${path} must explain unavailable data`);
  }
});

test("Audit filters reject malformed date input without throwing", () => {
  const audit = read("app/admin/(protected)/audit/page.tsx");
  assert.match(audit, /function validDateIso/);
  assert.match(audit, /Number\.isNaN\(date\.getTime\(\)\)/);
  assert.doesNotMatch(audit, /new Date\(params\.start\)\.toISOString/);
  assert.match(audit, /if \(!canView\)/);
});

test("Analytics recent-feed failure does not invalidate verified aggregate analytics", () => {
  const analytics = read("app/admin/(protected)/analytics/page.tsx");
  assert.match(analytics, /recentEvents\.error/);
  assert.match(analytics, /Aggregate analytics are still valid/);
});


test("Inbox delete authorization is enforced in both UI action and database RLS", () => {
  const permissions = read("lib/admin/permissions.ts");
  const action = read("app/admin/(protected)/inbox/actions.ts");
  const migration = read("supabase/migrations/20260920110000_feedback_queries_delete_roles.sql");

  assert.match(permissions, /canManageInbox/);
  assert.match(permissions, /role === "owner" \|\| role === "admin"/);
  assert.match(action, /canManageInbox\(admin\.role\)/);
  assert.match(migration, /for delete/);
  assert.match(migration, /can_manage_content\(\)/);
  assert.doesNotMatch(
    migration,
    /for delete[\s\S]*?using \(public\.is_active_admin\(\)\)/,
  );
});
