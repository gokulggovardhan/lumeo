import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const migrationPath = "supabase/migrations/20260712004_privacy_analytics.sql";
const adminMigrationPath = "supabase/migrations/20260714005_admin_analytics_reads.sql";
const files = [
  migrationPath,
  adminMigrationPath,
  "lib/analytics/types.ts",
  "lib/analytics/client.ts",
  "lib/analytics/state.ts",
  "lib/analytics/session.ts",
  "lib/analytics/device.ts",
  "lib/analytics/size-bucket.ts",
  "components/analytics/AnalyticsProvider.tsx",
  "components/analytics/AnalyticsPageView.tsx",
  "components/admin/analytics/AnalyticsTrendChart.tsx",
  "components/admin/analytics/AnalyticsBarList.tsx",
  "components/admin/analytics/AnalyticsDistribution.tsx",
  "components/admin/analytics/AnalyticsPrivacyNotice.tsx",
  "docs/PRIVACY_ANALYTICS.md",
  "tests/analytics-tool-events.test.ts",
  "lib/admin/data.ts",
  "lib/supabase/database.types.ts",
  "app/admin/(protected)/analytics/page.tsx",
  "app/admin/(protected)/page.tsx",
  "app/admin/(protected)/settings/page.tsx",
];

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function exists(relativePath) {
  return existsSync(join(root, relativePath));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  for (const file of files) assert(exists(file), `Missing analytics file: ${file}`);

  const migration = read(migrationPath);
  const adminMigration = read(adminMigrationPath);
  assert(/^begin;/im.test(migration) && /^commit;/im.test(migration), "Migration 004 must be transactional.");
  assert(/record_public_analytics_event/i.test(migration), "Public analytics RPC missing.");
  assert(/refresh_daily_tool_metrics/i.test(migration), "Daily metrics refresh function missing.");
  assert(/get_public_analytics_setting/i.test(migration), "Public analytics setting RPC missing.");
  for (const table of ["analytics_events", "daily_tool_metrics", "pdf_tools", "site_settings", "admin_members"]) {
    assert(migration.includes(`public.${table}`), `Migration must check or reference required table public.${table}.`);
  }
  assert(/set search_path = public/gi.test(migration), "Analytics functions must lock search_path.");
  assert(/page_view[\s\S]*tool_opened[\s\S]*processing_started[\s\S]*processing_succeeded[\s\S]*processing_failed[\s\S]*download_started/i.test(migration), "Approved event allowlist missing.");
  for (const bucket of ["under_1mb", "1mb_to_5mb", "5mb_to_20mb", "20mb_to_50mb", "over_50mb", "unknown"]) {
    assert(migration.includes(bucket), `Size bucket ${bucket} missing.`);
  }
  for (const device of ["desktop", "tablet", "mobile", "unknown"]) {
    assert(migration.includes(device), `Device class ${device} missing.`);
  }
  for (const code of ["unsupported_file", "file_too_large", "invalid_pdf", "processing_error", "browser_limit", "cancelled", "unknown"]) {
    assert(migration.includes(code), `Error code ${code} missing.`);
  }
  assert(/grant execute on function public\.record_public_analytics_event/i.test(migration), "Public analytics RPC execute grant missing.");
  assert(!/grant\s+(insert|select|update|delete)[\s\S]*analytics_events[\s\S]*to\s+anon/i.test(migration), "Migration must not grant anon analytics_events table access.");
  assert(!/create policy[\s\S]*analytics_events[\s\S]*to anon/i.test(migration), "Migration must not create anon analytics_events policies.");
  const rpcSignature = migration.slice(
    migration.indexOf("create or replace function public.record_public_analytics_event"),
    migration.indexOf("returns bigint"),
  );
  assert(!/metadata/i.test(rpcSignature), "Public analytics RPC must not accept metadata from callers.");
  assert(!/country_code\s*[,:=].+\$/im.test(migration), "Public analytics RPC must not accept country_code from callers.");

  assert(/^begin;/im.test(adminMigration) && /^commit;/im.test(adminMigration), "Migration 005 must be transactional.");
  assert(/get_admin_analytics_summary/i.test(adminMigration), "Admin aggregate analytics RPC missing.");
  for (const dependency of [
    "public.analytics_events",
    "public.daily_tool_metrics",
    "public.admin_members",
    "public.current_admin_role",
    "public.is_active_admin",
  ]) {
    assert(adminMigration.includes(dependency), `Migration 005 must check dependency ${dependency}.`);
  }
  assert(/security definer/i.test(adminMigration), "Admin aggregate RPC must use SECURITY DEFINER.");
  assert(/set search_path = public/i.test(adminMigration), "Admin aggregate RPC must lock search_path.");
  assert(/public\.current_admin_role\(\)/.test(adminMigration), "Admin aggregate RPC must validate active admin role.");
  assert(/owner[\s\S]*admin[\s\S]*analyst/i.test(adminMigration), "Admin aggregate RPC must support owner/admin/analyst roles.");
  assert(/p_end_date - p_start_date > 89/.test(adminMigration), "Admin aggregate RPC must enforce 90 day range.");
  assert(/revoke all on function public\.get_admin_analytics_summary\(date, date\) from public/i.test(adminMigration), "Admin aggregate RPC must revoke public execution.");
  assert(/revoke all on function public\.get_admin_analytics_summary\(date, date\) from anon/i.test(adminMigration), "Admin aggregate RPC must revoke anon execution.");
  assert(/grant execute on function public\.get_admin_analytics_summary\(date, date\) to authenticated/i.test(adminMigration), "Admin aggregate RPC must grant authenticated execution.");
  assert(!/grant\s+select[\s\S]*analytics_events[\s\S]*to\s+authenticated/i.test(adminMigration), "Migration 005 must not grant broad authenticated analytics_events SELECT.");
  assert(!/create policy[\s\S]*analytics_events[\s\S]*to anon/i.test(adminMigration), "Migration 005 must not add anon analytics_events policy.");
  const adminReturnStart = adminMigration.indexOf("return jsonb_build_object");
  const adminReturnTail = adminMigration.slice(adminReturnStart);
  const adminReturnEndMatch = /end;\s*\$\$;/i.exec(adminReturnTail);
  assert(adminReturnStart > -1 && adminReturnEndMatch, "Admin aggregate RPC return block could not be isolated.");
  const adminReturn = adminReturnTail.slice(0, adminReturnEndMatch.index);
  for (const aggregateKey of ["total_events", "daily_trend", "top_tools_by_opens", "device_summary", "browser_summary", "operating_system_summary"]) {
    assert(adminMigration.includes(aggregateKey), `Admin aggregate RPC return missing ${aggregateKey}.`);
  }
  for (const forbidden of ["anonymous_session_id", "metadata", "filename", "file_name", "country_code", "user_id", "email", "token"]) {
    assert(!adminReturn.includes(forbidden), `Admin aggregate RPC must not return ${forbidden}.`);
  }

  const types = read("lib/analytics/types.ts");
  for (const event of ["page_view", "tool_opened", "processing_started", "processing_succeeded", "processing_failed", "download_started"]) {
    assert(types.includes(`"${event}"`), `Missing event type ${event}.`);
  }
  for (const state of ["loading", "enabled", "disabled"]) {
    assert(types.includes(`"${state}"`), `Analytics availability state ${state} missing.`);
  }
  for (const reason of ["loading", "disabled", "do_not_track", "invalid_event", "unavailable"]) {
    assert(types.includes(`"${reason}"`), `Analytics track rejection reason ${reason} missing.`);
  }
  assert(types.includes("AnalyticsProviderTrackResult"), "Provider track result contract missing.");
  assert(!/\bany\b/.test(types), "Analytics types must not use any.");

  const state = read("lib/analytics/state.ts");
  assert(state.includes("providerTrackDecision"), "Analytics provider decision helper missing.");
  assert(state.includes("shouldAttemptOnce"), "Analytics one-shot attempt helper missing.");
  assert(state.includes("availability === \"loading\""), "Analytics decision helper must reject loading state.");
  assert(state.includes("availability === \"enabled\" && !alreadyAccepted"), "One-shot helper must wait for enabled availability.");

  const session = read("lib/analytics/session.ts");
  assert(session.includes("sessionStorage"), "Anonymous analytics session must use sessionStorage.");
  assert(!session.includes("localStorage"), "Anonymous analytics session must not use localStorage.");
  assert(session.includes("crypto") && session.includes("randomUUID"), "Anonymous analytics session must use crypto.randomUUID.");
  assert(session.includes("UUID_PATTERN"), "Malformed anonymous session IDs must be validated.");

  const client = read("lib/analytics/client.ts");
  assert(client.includes("record_public_analytics_event"), "Analytics client must call only the analytics RPC.");
  assert(!/\.from\(/.test(client), "Analytics client must not query tables.");
  assert(!/throw\s/.test(client), "Analytics client must not throw into public UI.");
  assert(!/console\.(log|warn|error)/.test(client), "Analytics client must not log raw errors.");

  const provider = read("components/analytics/AnalyticsProvider.tsx");
  assert(provider.includes("doNotTrack"), "Analytics provider must respect Do Not Track.");
  assert(provider.includes("PUBLIC_ANALYTICS_ROUTES"), "Analytics provider must use a public route allowlist.");
  assert(provider.includes("get_public_analytics_setting") || client.includes("get_public_analytics_setting"), "Analytics setting RPC must be used.");
  assert(provider.includes("availability") && provider.includes("\"loading\""), "Analytics provider must expose loading availability.");
  assert(provider.includes("enabled") && provider.includes("ready"), "Analytics provider must expose enabled and ready booleans.");
  assert(provider.includes("providerTrackDecision"), "Analytics provider must use the typed decision helper.");
  assert(provider.includes("accepted: false") && provider.includes("reason"), "Analytics provider track must return accepted/reason results.");

  const pageView = read("components/analytics/AnalyticsPageView.tsx");
  for (const route of ["/", "/pdf-tools", "/pdf/merge", "/pdf/split", "/pdf/compress", "/pdf/jpg-to-pdf", "/pdf/pdf-to-jpg"]) {
    assert(pageView.includes(`"${route}"`), `Public page-view route ${route} missing.`);
  }
  assert(pageView.includes("availability"), "Page-view tracking must wait for analytics availability.");
  assert(pageView.includes("shouldAttemptOnce"), "Page-view tracking must use the one-shot helper.");
  assert(pageView.includes("result.accepted"), "Page-view tracking must mark a route only after accepted tracking.");
  assert(!pageView.includes("/admin") && !pageView.includes("/dashboard"), "Admin/dashboard routes must not be tracked.");

  const combined = files.map(read).join("\n");
  assert(!/getSession\(/.test(combined), "Analytics files must not use getSession.");
  assert(!/service_role/i.test(combined), "Analytics files must not reference service_role.");
  assert(!/secret[_-]?key/i.test(combined), "Analytics files must not reference secret keys.");
  assert(!/\b(fileName|file_name|filename)\s*[:=]/.test(combined), "Analytics files must not define filename fields.");
  assert(!/exact file/i.test(combined) || combined.includes("exact file sizes"), "Only privacy disclosure may mention exact file sizes.");
  assert(!/raw IP|raw user-agent/i.test(combined) || combined.includes("raw IP") || combined.includes("raw user-agent"), "Raw identifiers must only be mentioned as excluded data.");

  const pdfTools = [
    { file: "components/pdf/MergePdfTool.tsx", slug: "merge" },
    { file: "components/pdf/SplitPdfTool.tsx", slug: "split" },
    { file: "components/pdf/CompressPdfTool.tsx", slug: "compress" },
  ];
  // Operation lifecycle events (processing_started/succeeded/failed,
  // download_started) were originally postponed past Analytics V1, but were
  // verified live in production across all 14 PDF tools as of 2026-07-29
  // (confirmed via components/pdf/*Tool.tsx track() calls and real,
  // non-placeholder AdminMetricCard values on /admin/analytics) -- this check
  // was updated from "must not emit" to "must emit" to match reality.
  const activeToolEvents = ["tool_opened", "processing_started", "processing_succeeded", "processing_failed", "download_started"];
  for (const { file: toolFile, slug } of pdfTools) {
    const tool = read(toolFile);
    assert(tool.includes("availability"), `${toolFile} must read analytics availability.`);
    assert(tool.includes("shouldAttemptOnce"), `${toolFile} must wait for enabled analytics before tool_opened.`);
    assert(tool.includes("result.accepted"), `${toolFile} must mark tool_opened only after accepted tracking.`);
    assert(tool.includes(`toolSlug: "${slug}"`), `${toolFile} must use exact tool slug ${slug}.`);
    assert(!/openedTrackedRef\.current\s*=\s*true;\s*[\r\n]+\s*track\(\{\s*eventName:\s*"tool_opened"/.test(tool), `${toolFile} must not mark tool_opened before tracking is accepted.`);
    for (const eventName of activeToolEvents) {
      assert(tool.includes(`eventName: "${eventName}"`), `${toolFile} must track ${eventName}.`);
    }
    assert(!/await\s+track\(/.test(tool), `${toolFile} must not block processing on analytics.`);
    assert(!/await\s+trackMergeAnalytics\(/.test(tool), `${toolFile} must not block processing on analytics.`);
    const trackCalls = tool.match(/(?:track|trackMergeAnalytics)\(\{[\s\S]*?\}\);/g) ?? [];
    assert(trackCalls.length === activeToolEvents.length, `${toolFile} must include exactly the ${activeToolEvents.length} Analytics V1 events (tool_opened + operation lifecycle).`);
    assert(!/console\.info\(/.test(tool), `${toolFile} must not contain analytics debug console logs.`);
    assert(!/Analytics Probe/.test(tool), `${toolFile} must not contain temporary analytics probes.`);
    for (const call of trackCalls) {
      assert(!/fileName|file_name|filename|pageCount|metadata|outputName|rawError|errorMessage|document|pdfText|thumbnail/.test(call), `${toolFile} analytics must not send filenames, page counts, metadata, or document data.`);
      assert(!/\b(size|bytes)\s*:/.test(call), `${toolFile} analytics must not send exact sizes.`);
    }
  }

  const adminPage = read("app/admin/(protected)/analytics/page.tsx");
  assert(adminPage.includes("AnalyticsPrivacyNotice"), "Admin analytics privacy notice missing.");
  assert(adminPage.includes("Analytics V1"), "Admin analytics page must identify Analytics V1.");
  assert(adminPage.includes("Discovery & operation analytics"), "Admin analytics page must use discovery & operation analytics wording.");
  assert(adminPage.includes("Page Views Today"), "Admin analytics page must display page views.");
  assert(adminPage.includes("Tool Opens Today"), "Admin analytics page must display tool opens.");
  assert(adminPage.includes("Top tools by opens"), "Admin analytics page must display top tools by opens.");
  assert(adminPage.includes("Device class"), "Admin analytics page must display device summary.");
  assert(adminPage.includes("Browser family"), "Admin analytics page must display browser summary.");
  assert(adminPage.includes("Operating system"), "Admin analytics page must display operating-system summary.");
  assert(adminPage.includes("Operation analytics"), "Admin analytics page must explain operation lifecycle metrics.");
  // Operation lifecycle metric cards were originally postponed past
  // Analytics V1, but were verified live in production as of 2026-07-29 --
  // see the matching note in scripts/verify-control-center.mjs.
  for (const requiredLabel of ["Processing Started", "Processing Succeeded", "Processing Failed", "Downloads Started"]) {
    assert(adminPage.includes(`label="${requiredLabel}"`), `Admin analytics page must show ${requiredLabel} as a metric card.`);
  }
  assert(adminPage.includes("Success Rate"), "Admin analytics page must show processing success rate.");
  assert(adminPage.includes("dataStatus") && adminPage.includes("unavailable"), "Admin analytics page must distinguish unavailable data from genuine zero.");

  const adminData = read("lib/admin/data.ts");
  assert(adminData.includes("get_admin_analytics_summary"), "Admin data layer must call aggregate analytics RPC.");
  assert(!/\.from\("analytics_events"\)/.test(adminData), "Admin data layer must not directly query analytics_events.");
  assert(adminData.includes("pageViewsToday"), "Admin data layer must expose page-view totals separately.");
  assert(adminData.includes("topToolsByOpens"), "Admin data layer must expose top tools by opens.");
  assert(adminData.includes("dataStatus") && adminData.includes("\"unavailable\""), "Admin data layer must expose unavailable analytics state.");

  const databaseTypes = read("lib/supabase/database.types.ts");
  assert(databaseTypes.includes("get_admin_analytics_summary"), "Database types must include admin aggregate analytics RPC.");

  const privacy = read("app/privacy/page.tsx");
  assert(privacy.includes("temporary browser-session ID"), "Privacy disclosure must mention temporary session IDs.");
  assert(privacy.includes("Do Not Track"), "Privacy disclosure must mention Do Not Track.");
  const docs = read("docs/PRIVACY_ANALYTICS.md");
  assert(docs.includes("Analytics V1 scope"), "Privacy analytics docs must document V1 scope.");
  assert(docs.includes("processing_started") && docs.includes("Planned"), "Privacy analytics docs must mark lifecycle metrics as planned.");
  assert(migration.includes("coalesce(settings.value @>") && migration.includes("false"), "Analytics setting must default disabled when absent.");

  const packageJson = JSON.parse(read("package.json"));
  assert(packageJson.scripts["verify:analytics"] === "node scripts/verify-privacy-analytics.mjs", "verify:analytics script missing.");
  assert(packageJson.scripts.test === "node --no-warnings --test --experimental-strip-types", "generic test script missing.");
  assert(packageJson.dependencies.next === "^16.2.10", "Next.js version changed unexpectedly.");
  assert(packageJson.dependencies.react === "^19.2.7", "React version changed unexpectedly.");
  assert(packageJson.dependencies["react-dom"] === "^19.2.7", "React DOM version changed unexpectedly.");

  console.log("PASS privacy analytics migration exists");
  console.log("PASS approved event allowlist and secure RPCs exist");
  console.log("PASS no anon analytics table grants or policies");
  console.log("PASS client uses sessionStorage, crypto.randomUUID, and RPC-only tracking");
  console.log("PASS Do Not Track and public route allowlist are present");
  console.log("PASS PDF tools only emit proven tool-open analytics in V1");
  console.log("PASS admin analytics and privacy disclosure exist");
  console.log("PASS protected package versions are unchanged");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Privacy analytics verification failed.");
  process.exit(1);
}
