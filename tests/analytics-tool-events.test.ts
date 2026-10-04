import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  providerTrackDecision,
  shouldAttemptOnce,
} from "../lib/analytics/state.ts";
import type { AnalyticsEventInput } from "../lib/analytics/types.ts";

const pdfTools = [
  {
    name: "Merge",
    slug: "merge",
    path: "components/pdf/MergePdfTool.tsx",
  },
  {
    name: "Split",
    slug: "split",
    path: "components/pdf/SplitPdfTool.tsx",
  },
  {
    name: "Compress",
    slug: "compress",
    path: "components/pdf/CompressPdfTool.tsx",
  },
] as const;

// Originally postponed past Analytics V1; verified live in production
// across all 14 PDF tools as of 2026-07-29 (real track() calls in every
// components/pdf/*Tool.tsx, and real non-placeholder AdminMetricCard values
// on /admin/analytics fed by these events). Kept the name for continuity
// with the schema/migration test below, which is unaffected either way.
const lifecycleEvents = ["processing_started", "processing_succeeded", "processing_failed", "download_started"] as const;

const forbiddenAnalyticsFields =
  /fileName|file_name|filename|pageCount|metadata|outputName|rawError|errorMessage|document|pdfText|thumbnail|\b(size|bytes)\s*:/;

const toolOpenedEvent: AnalyticsEventInput = {
  eventName: "tool_opened",
  toolSlug: "merge",
};

function trackCallsFrom(source: string) {
  return source.match(/track\(\{[\s\S]*?\}\);/g) ?? [];
}

test("page_view remains supported and waits for analytics availability", () => {
  const pageViewEvent: AnalyticsEventInput = { eventName: "page_view" };

  assert.deepEqual(
    providerTrackDecision({
      availability: "loading",
      doNotTrack: false,
      event: pageViewEvent,
    }),
    { accepted: false, reason: "loading" },
  );
  assert.deepEqual(
    providerTrackDecision({
      availability: "enabled",
      doNotTrack: false,
      event: pageViewEvent,
    }),
    { accepted: true },
  );
});

test("tool_opened waits until analytics is enabled and is accepted once per mount", () => {
  assert.equal(
    shouldAttemptOnce({ availability: "loading", alreadyAccepted: false }),
    false,
  );
  assert.equal(
    shouldAttemptOnce({ availability: "enabled", alreadyAccepted: false }),
    true,
  );
  assert.equal(
    shouldAttemptOnce({ availability: "enabled", alreadyAccepted: true }),
    false,
  );
  assert.deepEqual(
    providerTrackDecision({
      availability: "enabled",
      doNotTrack: false,
      event: toolOpenedEvent,
    }),
    { accepted: true },
  );
});

test("disabled analytics and Do Not Track reject tracking without retries", () => {
  assert.equal(
    shouldAttemptOnce({ availability: "disabled", alreadyAccepted: false }),
    false,
  );
  assert.deepEqual(
    providerTrackDecision({
      availability: "disabled",
      doNotTrack: false,
      event: toolOpenedEvent,
    }),
    { accepted: false, reason: "disabled" },
  );
  assert.deepEqual(
    providerTrackDecision({
      availability: "enabled",
      doNotTrack: true,
      event: toolOpenedEvent,
    }),
    { accepted: false, reason: "do_not_track" },
  );
});

test("Merge, Split, and Compress track tool_opened plus the full operation lifecycle", () => {
  for (const tool of pdfTools) {
    const source = readFileSync(tool.path, "utf8");
    const calls = trackCallsFrom(source);

    assert.match(source, /useAnalytics/);
    assert.match(source, /const \{ availability, track \} = useAnalytics\(\)/);
    assert.match(source, /openedTrackedRef/);
    assert.match(
      source,
      /shouldAttemptOnce\(\{[\s\S]*availability[\s\S]*alreadyAccepted: openedTrackedRef\.current[\s\S]*\}\)/,
    );
    assert.match(
      source,
      /if \(result\.accepted\) \{[\s\S]*openedTrackedRef\.current = true;/,
    );
    assert.match(
      source,
      new RegExp(`eventName: "tool_opened"[\\s\\S]*toolSlug: "${tool.slug}"`),
    );
    assert.doesNotMatch(
      source,
      /openedTrackedRef\.current = true;[\s\S]{0,120}eventName: "tool_opened"/,
    );

    for (const eventName of lifecycleEvents) {
      assert.match(
        source,
        new RegExp(`eventName: "${eventName}"`),
        `${tool.name} must track ${eventName}.`,
      );
    }

    assert.equal(calls.length, 5, `${tool.name} should track tool_opened plus the 4 lifecycle events.`);
    assert.doesNotMatch(source, /await\s+track\(/);
    assert.doesNotMatch(source, /console\.info\(/);
    assert.doesNotMatch(source, /Analytics Probe/);

    for (const call of calls) {
      assert.doesNotMatch(call, forbiddenAnalyticsFields);
    }
  }
});

test("operation lifecycle event schema is defined and reflected in the migration", () => {
  const types = readFileSync("lib/analytics/types.ts", "utf8");
  const migration = readFileSync(
    "supabase/migrations/20260712004_privacy_analytics.sql",
    "utf8",
  );

  assert.match(types, /"page_view"/);
  assert.match(types, /"tool_opened"/);
  for (const eventName of lifecycleEvents) {
    assert.match(types, new RegExp(`"${eventName}"`));
    assert.match(migration, new RegExp(eventName));
  }
});

test("analytics identity is server-owned and raw tokens stay HttpOnly", () => {
  const provider = readFileSync("components/analytics/AnalyticsProvider.tsx", "utf8");
  const client = readFileSync("lib/analytics/client.ts", "utf8");
  const route = readFileSync("app/api/analytics/route.ts", "utf8");
  const server = readFileSync("lib/analytics/server.ts", "utf8");
  const combined = `${provider}\n${client}\n${route}\n${server}`;

  assert.doesNotMatch(client, /sessionStorage|localStorage|document\.cookie/);
  assert.match(client, /fetch\("\/api\/analytics"/);
  assert.match(route, /httpOnly: true/);
  assert.match(route, /ANALYTICS_VISITOR_COOKIE/);
  assert.match(route, /ANALYTICS_SESSION_COOKIE/);
  assert.match(server, /pseudonymousAnalyticsKey/);
  assert.doesNotMatch(combined, /navigator\.geolocation/);
});

test("admin analytics reads use the verified aggregate RPC instead of direct event table reads", () => {
  const dataLayer = readFileSync("lib/admin/data.ts", "utf8");
  const verified = readFileSync("lib/admin/verified-analytics.ts", "utf8");

  assert.match(dataLayer, /getVerifiedAnalytics/);
  assert.match(verified, /get_admin_verified_analytics/);
  assert.doesNotMatch(dataLayer, /\.from\("analytics_events"\)/);
  assert.doesNotMatch(verified, /\.from\("analytics_events"\)/);
  assert.match(dataLayer, /pageViewsToday/);
  assert.match(dataLayer, /topToolsByOpens/);
  assert.match(dataLayer, /dataStatus/);
  assert.match(dataLayer, /"unavailable"/);
});

test("admin analytics dashboard exposes current range controls and lifecycle metrics", () => {
  const page = readFileSync("app/admin/(protected)/analytics/page.tsx", "utf8");

  assert.match(page, /eyebrow="Analytics"/);
  assert.match(page, /title="Analytics"/);
  assert.match(page, /Verified audience traffic and product usage/);
  assert.match(page, /title="Date range and traffic scope"/);
  assert.match(page, /name="range"/);
  assert.match(page, /<option value="30d">Last 30 days<\/option>/);
  assert.match(page, /<option value="custom">Custom<\/option>/);
  assert.match(page, /label="Page Views"/);
  assert.match(page, /label="Unique Visitors"/);
  assert.match(page, /label="Sessions"/);
  assert.match(page, /label="Known Location"/);
  assert.match(page, /label="Unknown Location"/);
  assert.match(page, /label="Tool Opens"/);
  assert.match(page, /title="Tool performance"/);
  assert.match(page, /title="Operation analytics"/);
  assert.match(page, /label="Processing Started"/);
  assert.match(page, /label="Succeeded"/);
  assert.match(page, /label="Failed"/);
  assert.match(page, /Downloads started/);
  assert.match(page, /label="Success Rate"/);
  assert.doesNotMatch(page, /Analytics V1/);
});

test("core processing algorithms remain unchanged by lifecycle analytics instrumentation", () => {
  const merge = readFileSync("components/pdf/MergePdfTool.tsx", "utf8");
  const split = readFileSync("components/pdf/SplitPdfTool.tsx", "utf8");
  const compress = readFileSync("components/pdf/CompressPdfTool.tsx", "utf8");

  assert.match(merge, /PDFDocument\.create/);
  assert.match(merge, /mergedPdf\.save/);
  assert.match(split, /createPdfFromPages/);
  assert.match(split, /new JSZip/);
  assert.match(compress, /buildCompressedCandidate/);
  assert.match(compress, /Target Size Studio|target/i);
});


test("conversion cancellation is an approved terminal event with privacy-safe stage diagnostics", () => {
  const state = readFileSync("lib/analytics/state.ts", "utf8");
  const types = readFileSync("lib/analytics/types.ts", "utf8");
  const client = readFileSync("lib/analytics/client.ts", "utf8");
  const migration = readFileSync(
    "supabase/migrations/20260927181500_conversion_terminal_diagnostics.sql",
    "utf8",
  );

  const cancelled: AnalyticsEventInput = {
    eventName: "processing_cancelled",
    toolSlug: "word-to-pdf",
    durationMs: 1250,
    errorCode: "user_cancelled",
    failureStage: "converting",
  };

  assert.deepEqual(
    providerTrackDecision({
      availability: "enabled",
      doNotTrack: false,
      event: cancelled,
    }),
    { accepted: true },
  );
  assert.match(state, /"processing_cancelled"/);
  assert.match(types, /AnalyticsConversionStage/);
  assert.match(client, /failureStage: input\.failureStage/);
  assert.match(migration, /processing_cancelled/);
  assert.match(migration, /failure_stage/);
  assert.doesNotMatch(
    migration,
    /file(name|_name)|document_content|raw_error|pdf_text/i,
  );
});
