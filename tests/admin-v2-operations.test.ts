import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { filterAndSortInboxItems } from "../lib/admin/inbox-view.ts";
import { summarizeHealthStatus } from "../lib/admin/health-status.ts";
import type { FeedbackQuery } from "../lib/supabase/database.types.ts";

function read(path: string) {
  return readFileSync(path, "utf8");
}

function message(id: string, overrides: Partial<FeedbackQuery> = {}): FeedbackQuery {
  return {
    id,
    type: "Query",
    name: `Person ${id}`,
    email: `${id}@example.com`,
    phone: null,
    subject: `Subject ${id}`,
    message: `Message ${id}`,
    location: null,
    is_read: false,
    created_at: "2026-09-20T12:00:00.000Z",
    ...overrides,
  };
}

test("Health V2 distinguishes core outages from optional operational degradation", () => {
  assert.equal(
    summarizeHealthStatus([
      { status: "ok", required: true },
      { status: "down", required: false },
    ]),
    "degraded",
  );
  assert.equal(
    summarizeHealthStatus([
      { status: "down", required: true },
      { status: "ok", required: false },
    ]),
    "down",
  );

  const health = read("lib/admin/health.ts");
  for (const evidence of [
    "Admin authorization",
    "Supabase database",
    "Maintenance state",
    "Analytics aggregates",
    "Error monitoring",
    "Feedback Inbox",
    "Cloudflare runtime",
  ]) {
    assert.match(health, new RegExp(evidence));
  }
  assert.doesNotMatch(health, /office|libreoffice/i);
});

test("Errors V2 uses backed filters, exact counts, safe diagnostics, and verified mutations", () => {
  const page = read("app/admin/(protected)/errors/page.tsx");
  const data = read("lib/admin/errors.ts");
  const actions = read("app/admin/(protected)/errors/actions.ts");

  for (const field of ["search", "route", "status", "severity", "source", "sort"]) {
    assert.match(page, new RegExp(`name=\\"${field}\\"`));
  }
  assert.match(page, /first_seen_at/);
  assert.match(page, /page \* PAGE_SIZE < logs\.data\.total/);
  assert.match(data, /select\("\*", \{ count: "exact" \}\)/);
  assert.match(data, /\.eq\("source", filters\.source\)/);
  assert.match(data, /\.ilike\("route",/);
  assert.match(page, /sanitizeErrorDiagnostic/);
  assert.match(actions, /\.select\("id"\)[\s\S]*\.maybeSingle\(\)/);
  assert.match(actions, /canManageErrors\(admin\.role\)/);
});

test("Inbox V2 filters real loaded messages by read state and preserves ordering", () => {
  const items = [
    message("old", { is_read: true, created_at: "2026-09-19T12:00:00.000Z" }),
    message("new", { type: "Feedback", subject: "Billing help", created_at: "2026-09-21T12:00:00.000Z" }),
  ];

  assert.deepEqual(
    filterAndSortInboxItems(items, { query: "", read: "unread", type: "all", sort: "newest" }).map((item) => item.id),
    ["new"],
  );
  assert.deepEqual(
    filterAndSortInboxItems(items, { query: "", read: "all", type: "all", sort: "oldest" }).map((item) => item.id),
    ["old", "new"],
  );
  assert.deepEqual(
    filterAndSortInboxItems(items, { query: "billing", read: "all", type: "Feedback", sort: "newest" }).map((item) => item.id),
    ["new"],
  );
});

test("Inbox V2 keeps one realtime lifecycle and server-authorized read/delete mutations", () => {
  const inbox = read("components/admin/InboxClient.tsx");
  const page = read("app/admin/(protected)/inbox/page.tsx");
  const actions = read("app/admin/(protected)/inbox/actions.ts");

  assert.equal((inbox.match(/\.channel\(/g) ?? []).length, 1);
  assert.match(inbox, /removeChannel\(channel\)/);
  assert.match(inbox, /setFeedbackReadState/);
  assert.match(inbox, /Mark \{selected\.is_read \? "unread" : "read"\}/);
  assert.match(inbox, /rows\.slice\(0, pageSize\)/);
  assert.match(page, /PAGE_SIZE \+ 1/);
  assert.match(actions, /canViewInbox\(admin\.role\)/);
  assert.match(actions, /canManageInbox\(admin\.role\)/);
  assert.match(actions, /\.select\("id"\)[\s\S]*\.maybeSingle\(\)/);
});

test("Settings and Dashboard keep real owner controls and consistent attention links", () => {
  const settings = read("app/admin/(protected)/settings/page.tsx");
  const actions = read("app/admin/(protected)/settings/actions.ts");
  const dashboard = read("app/admin/(protected)/page.tsx");

  assert.match(settings, /maintenance_mode/);
  assert.match(settings, /public_analytics_enabled/);
  assert.match(settings, /Current effect:/);
  assert.match(actions, /canManageSettings\(admin\.role\)/);
  assert.match(actions, /maintenance_confirmation/);
  assert.match(actions, /writeAuditLog/);
  assert.match(dashboard, /\/admin\/inbox\?read=unread/);
  assert.match(dashboard, /Operational health is degraded/);
  assert.match(dashboard, /\/admin\/health/);
});
