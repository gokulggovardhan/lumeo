import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { providerTrackDecision } from "../lib/analytics/state.ts";
import type { AnalyticsEventInput } from "../lib/analytics/types.ts";

const read = (path: string) => readFileSync(path, "utf8");
const events = [
  "workspace_started",
  "workspace_tool_switched",
  "workspace_finish_opened",
  "workspace_download_started",
  "workspace_completed",
] as const;

test("Step 10 Workspace funnel uses one approved first-party event allowlist end to end", () => {
  const files = [
    "lib/analytics/types.ts",
    "lib/analytics/state.ts",
    "app/api/analytics/route.ts",
    "supabase/migrations/20261021183000_workspace_funnel_analytics.sql",
  ];
  for (const file of files) {
    const source = read(file);
    for (const event of events) {
      assert.ok(source.includes(event), `${file}: missing ${event}`);
    }
  }
  const route = read("app/api/analytics/route.ts");
  assert.match(route, /!eventName\.startsWith\("workspace_"\)/);
  assert.match(route, /sameOriginRequest\(request\)/);
  assert.match(route, /MAX_REQUEST_BYTES = 4096/);
  assert.match(route, /record_server_analytics_event/);
});

test("Workspace analytics remains optional and never blocks the document lifecycle", () => {
  for (const eventName of events) {
    const event: AnalyticsEventInput = { eventName };
    assert.deepEqual(
      providerTrackDecision({ availability: "enabled", doNotTrack: false, event }),
      { accepted: true },
    );
    assert.deepEqual(
      providerTrackDecision({ availability: "disabled", doNotTrack: false, event }),
      { accepted: false, reason: "disabled" },
    );
    assert.deepEqual(
      providerTrackDecision({ availability: "enabled", doNotTrack: true, event }),
      { accepted: false, reason: "do_not_track" },
    );
    assert.deepEqual(
      providerTrackDecision({ availability: "loading", doNotTrack: false, event }),
      { accepted: false, reason: "loading" },
    );
  }
  const provider = read("components/pdf/workspace/WorkspaceDocumentProvider.tsx");
  const finish = read("components/pdf/workspace/WorkspaceFinish.tsx");
  assert.match(provider, /analyticsAvailability !== "enabled"/);
  assert.match(provider, /funnelRef\.current/);
  assert.match(provider, /previous\.area !== area/);
  assert.match(finish, /trackAnalytics\(\{ eventName: "workspace_download_started" \}\)/);
  assert.match(finish, /trackAnalytics\(\{ eventName: "workspace_completed" \}\)/);
  // The *only* data in these event payloads is an approved event name.
  for (const source of [provider, finish]) {
    const calls = source.match(/trackAnalytics\(\{[\s\S]*?\}\)/g) ?? [];
    assert.ok(calls.length > 0);
    for (const call of calls) {
      assert.doesNotMatch(call, /fileName|file_name|fileSize|pageCount|documentId|sessionId|metadata|content|thumbnail|bytes|text:/i);
      assert.doesNotMatch(call, /toolSlug|durationMs|inputSizeBucket|outputSizeBucket/);
    }
  }
});

test("Step 10 migration preserves the existing secret-guarded writer and private data model", () => {
  const migration = read("supabase/migrations/20261021183000_workspace_funnel_analytics.sql");
  assert.match(migration, /^begin;/);
  assert.match(migration, /commit;\s*$/);
  assert.match(migration, /create or replace function public\.record_server_analytics_event/);
  assert.match(migration, /extensions\.digest\(supplied_secret, 'sha256'\)/);
  assert.match(migration, /private\.analytics_ingest_rate_limits/);
  assert.match(migration, /analytics_schema_version/);
  assert.match(migration, /cleaned_event not in \(/);
  assert.doesNotMatch(migration, /grant\s+(insert|select|update|delete)\s+on\s+public\.analytics_events\s+to\s+anon/i);
  assert.doesNotMatch(migration, /drop\s+table/i);
  assert.doesNotMatch(migration, /drop\s+function/i);
});
