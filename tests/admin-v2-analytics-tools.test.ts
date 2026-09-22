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
  assert.equal(tools.length, 2);
});

test("Admin tool filters reject unknown enum values and match case-insensitively", () => {
  const filters = resolveToolFilters({ q: "MERGE", enabled: "unexpected", maintenance: "nope" });
  assert.equal(filters.enabled, "all");
  assert.equal(filters.maintenance, "all");
  assert.deepEqual(filterAdminTools(tools, filters).map((tool) => tool.slug), ["merge"]);
});

test("Analytics V2 keeps verified unavailable handling and the real aggregate reader", () => {
  const source = readFileSync("app/admin/(protected)/analytics/page.tsx", "utf8");
  assert.match(source, /getAnalyticsSummary/);
  assert.match(source, /dataStatus === "unavailable"/);
  assert.match(source, /Metrics are withheld instead of presenting unverified zero values/);
  assert.match(source, /AnalyticsTrendChart/);
  assert.match(source, /AnalyticsDistribution/);
  assert.match(source, /RecentActivityTable/);
  assert.doesNotMatch(source, /revenue|storage saved|AI insight/i);
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
  assert.match(page, /getAnalyticsSummary\(\)/);
  assert.match(page, /usageAvailable \?/);
  assert.match(page, /target="_blank"/);
  assert.match(action, /requireAdmin\(\)/);
  assert.match(action, /canManageTools\(admin\.role\)/);
  assert.match(action, /writeAuditLog/);
  assert.match(action, /\.select\("id"\)[\s\S]*\.maybeSingle\(\)/);
  assert.match(action, /maintenance_message: maintenanceMessage \|\| null/);
  assert.match(action, /updateTag\("public-pdf-catalog"\)/);
});
