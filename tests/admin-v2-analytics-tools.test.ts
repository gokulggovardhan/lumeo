import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  filterAdminTools,
  hasActiveToolFilters,
  resolveToolFilters,
} from "../lib/admin/tool-filters.ts";
import type { ToolWithCategory } from "../lib/admin/data.ts";

const tools: ToolWithCategory[] = [
  {
    id: "1",
    slug: "merge",
    category_id: "organize",
    category_name: "Organize",
    category_slug: "organize",
    name: "Merge PDF",
    short_description: "Combine PDF files",
    route: "/pdf/merge",
    icon_key: "merge",
    status: "active",
    maintenance_message: null,
    is_enabled: true,
    is_homepage_eligible: true,
    sort_order: 1,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
  },
  {
    id: "2",
    slug: "compress",
    category_id: "optimize",
    category_name: "Optimize",
    category_slug: "optimize",
    name: "Compress PDF",
    short_description: "Reduce PDF size",
    route: "/pdf/compress",
    icon_key: "compress",
    status: "maintenance",
    maintenance_message: "Temporarily unavailable",
    is_enabled: false,
    is_homepage_eligible: true,
    sort_order: 2,
    created_at: "2026-01-01",
    updated_at: "2026-01-02",
  },
  {
    id: "3",
    slug: "edit",
    category_id: "edit",
    category_name: "Edit",
    category_slug: "edit",
    name: "Edit PDF",
    short_description: "Edit PDF content",
    route: "/pdf/edit",
    icon_key: "edit",
    status: "active",
    maintenance_message: "Saved for the next maintenance window",
    is_enabled: true,
    is_homepage_eligible: true,
    sort_order: 3,
    created_at: "2026-01-01",
    updated_at: "2026-01-03",
  },
];

test("Admin tool filters normalize URL input and compose without mutating records", () => {
  const filters = resolveToolFilters({
    q: "  COMPRESS  ",
    category: "optimize",
    status: "maintenance",
    enabled: "disabled",
    maintenance: "maintenance",
  });

  assert.equal(hasActiveToolFilters(filters), true);
  assert.deepEqual(filterAdminTools(tools, filters).map((tool) => tool.slug), ["compress"]);
  assert.equal(tools.length, 3);
});

test("Admin maintenance filter follows the effective maintenance state, not a stored future message", () => {
  const maintenance = resolveToolFilters({ maintenance: "maintenance" });
  const clear = resolveToolFilters({ maintenance: "clear" });

  assert.deepEqual(filterAdminTools(tools, maintenance).map((tool) => tool.slug), ["compress"]);
  assert.deepEqual(filterAdminTools(tools, clear).map((tool) => tool.slug), ["merge", "edit"]);
});

test("Admin tool filters reject unknown enum values and match case-insensitively", () => {
  const filters = resolveToolFilters({ q: "MERGE", enabled: "unexpected", maintenance: "nope" });
  assert.equal(filters.enabled, "all");
  assert.equal(filters.maintenance, "all");
  assert.deepEqual(filterAdminTools(tools, filters).map((tool) => tool.slug), ["merge"]);
});

test("Analytics V2 reads only verified schema-v2 traffic for the primary audience view", () => {
  const source = readFileSync("app/admin/(protected)/analytics/page.tsx", "utf8");
  const data = readFileSync("lib/admin/verified-analytics.ts", "utf8");
  assert.match(source, /getVerifiedTraffic/);
  assert.match(source, /Verified analytics are unavailable/);
  assert.match(source, /Real Audience/);
  assert.match(source, /"real_audience"/);
  assert.doesNotMatch(source, /Lumeo synthetic tests/);
  assert.doesNotMatch(source, /Bots & suspected automation/);
  assert.doesNotMatch(source, /All verified traffic/);
  assert.doesNotMatch(source, /Traffic scope/);
  assert.doesNotMatch(source, /Traffic separation/);
  assert.match(source, /Known-location page views/);
  assert.match(source, /Unknown-location page views/);
  assert.match(source, /AnalyticsTrendChart/);
  assert.match(source, /uniqueVisitors: point\.uniqueVisitors/);
  assert.match(source, /sessions: point\.sessions/);
  assert.doesNotMatch(source, /title="Top Locations"/);
  assert.match(source, /title="Geography"/);
  assert.match(source, /title="Page performance"/);
  assert.match(source, /title="Tool usage"/);
  assert.match(source, /Recent operational activity/);
  assert.match(data, /get_admin_verified_traffic_v3/);
  assert.match(data, /get_admin_recent_operational_events_v3/);
  assert.match(data, /known \+ unknown !== pageViews/);
  assert.doesNotMatch(source, /getAnalyticsSummary/);
  assert.doesNotMatch(source, /revenue|storage saved|AI insight/i);
});

test("Daily traffic trend exposes page views, visitors and sessions", () => {
  const trend = readFileSync(
    "components/admin/analytics/AnalyticsTrendChart.tsx",
    "utf8",
  );

  assert.match(trend, /pageViews: number/);
  assert.match(trend, /uniqueVisitors: number/);
  assert.match(trend, /sessions: number/);
  assert.match(trend, /Real Audience daily trend/);
  assert.match(trend, /verified page views, visitors and sessions/);
  assert.match(trend, /No verified page views in this period/);
  assert.match(trend, /point\.uniqueVisitors/);
  assert.match(trend, /point\.sessions/);
  assert.match(trend, /onMouseEnter/);
  assert.match(trend, /onClick/);
  assert.match(trend, /role="tooltip"/);
  assert.match(trend, /<span>0<\/span>/);
  assert.match(trend, /sr-only/);
  assert.doesNotMatch(trend, /Text summary:/);
});

test("Tools V2 is server-authorized, URL-filtered, audited through the existing action, and analyst-safe", () => {
  const page = readFileSync("app/admin/(protected)/tools/page.tsx", "utf8");
  const action = readFileSync("app/admin/(protected)/tools/actions.ts", "utf8");

  assert.match(page, /requireAdmin\(\)/);
  assert.match(page, /canManageTools\(admin\.role\)/);
  assert.match(page, /searchParams/);
  for (const field of ["q", "category", "status", "enabled", "maintenance"]) {
    assert.match(page, new RegExp(`name="${field}"`));
  }
  assert.match(page, /Analyst · read only/);
  assert.match(page, /getVerifiedTraffic/);
  assert.match(page, /usageAvailable \?/);
  assert.match(page, /target="_blank"/);
  assert.match(action, /requireAdmin\(\)/);
  assert.match(action, /canManageTools\(admin\.role\)/);
  assert.match(action, /writeAuditLog/);
  assert.match(action, /\.select\("id"\)[\s\S]*\.maybeSingle\(\)/);
  assert.match(action, /maintenance_message: maintenanceMessage \|\| null/);
  assert.match(action, /updateTag\("public-pdf-catalog"\)/);
});
