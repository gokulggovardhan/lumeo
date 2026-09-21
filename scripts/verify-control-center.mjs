import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const migrationPath = "supabase/migrations/20260712002_control_center_foundation.sql";
const tables = [
  "tool_categories",
  "pdf_tools",
  "homepage_tool_slots",
  "feature_flags",
  "site_settings",
  "announcements",
  "seo_settings",
  "audit_logs",
  "analytics_events",
  "daily_tool_metrics",
];
const protectedRoutes = [
  "app/admin/(protected)/page.tsx",
  "app/admin/(protected)/analytics/page.tsx",
  "app/admin/(protected)/tools/page.tsx",
  "app/admin/(protected)/announcements/page.tsx",
  "app/admin/(protected)/seo/page.tsx",
  "app/admin/(protected)/audit/page.tsx",
  "app/admin/(protected)/settings/page.tsx",
  "app/admin/(protected)/errors/page.tsx",
  "app/admin/(protected)/health/page.tsx",
  "app/admin/(protected)/inbox/page.tsx",
  "app/admin/(protected)/members/page.tsx",
];
const actionFiles = [
  "app/admin/(protected)/tools/actions.ts",
  "app/admin/(protected)/announcements/actions.ts",
  "app/admin/(protected)/seo/actions.ts",
  "app/admin/(protected)/settings/actions.ts",
  "app/admin/(protected)/errors/actions.ts",
  "app/admin/(protected)/inbox/actions.ts",
  "app/admin/(protected)/members/actions.ts",
];
const protectedNonAdminFiles = [
  "app/login/page.tsx",
  "app/dashboard",
  "components/AuthButton.tsx",
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

function gitStatus(paths) {
  return execSync(`git status --short -- ${paths.map((path) => `"${path}"`).join(" ")}`, {
    cwd: root,
    encoding: "utf8",
  }).trim();
}

try {
  assert(exists(migrationPath), "Control Center migration is missing.");
  const migration = read(migrationPath);

  for (const table of tables) {
    assert(new RegExp(`create table if not exists public\\.${table}`, "i").test(migration), `Missing table ${table}.`);
    assert(new RegExp(`alter table public\\.${table} enable row level security`, "i").test(migration), `RLS missing for ${table}.`);
  }

  assert(/create or replace function public\.current_admin_role/i.test(migration), "current_admin_role function is missing.");
  assert(/create or replace function public\.write_audit_log/i.test(migration), "write_audit_log function is missing.");
  assert(!/to anon/i.test(migration), "Control Center migration must not grant anonymous policies.");
  assert(!/for\s+(insert|update|delete)[\s\S]*on public\.audit_logs/i.test(migration), "audit_logs must not expose direct write policies.");
  assert(!/insert into public\.analytics_events/i.test(migration), "Migration must not seed fake analytics records.");
  assert((migration.match(/insert into public\.homepage_tool_slots/g) ?? []).length >= 1, "Homepage slot seed is missing.");
  for (const slug of ["merge", "split", "compress", "jpg-to-pdf", "pdf-to-jpg"]) {
    assert(migration.includes(`'${slug}'`), `Seeded PDF tool missing: ${slug}.`);
  }

  for (const route of protectedRoutes) {
    assert(exists(route), `Protected route missing: ${route}`);
    assert(route.includes("app/admin/(protected)/"), `Protected page must stay inside route group: ${route}`);
  }

  for (const retiredRoute of [
    "app/admin/(protected)/homepage/page.tsx",
    "app/admin/(protected)/feature-flags/page.tsx",
    "app/admin/(protected)/feature-flags/actions.ts",
    "app/admin/(protected)/design-system/page.tsx",
    "app/admin/(protected)/guide/page.tsx",
    "components/admin/guidance/AdminGuidance.tsx",
  ]) {
    assert(!exists(retiredRoute), `Retired admin surface must stay removed: ${retiredRoute}`);
  }

  const navigation = read("lib/admin/navigation.ts");
  for (const retiredHref of [
    "/admin/homepage",
    "/admin/feature-flags",
    "/admin/design-system",
    "/admin/guide",
  ]) {
    assert(!navigation.includes(retiredHref), `Owner navigation must not restore clutter: ${retiredHref}`);
  }

  assert(exists("lib/admin/permissions.ts"), "Permission helper is missing.");
  assert(exists("lib/admin/data.ts"), "Admin data module is missing.");
  assert(read("lib/admin/data.ts").includes('import "server-only"'), "Admin data module must be server-only.");
  assert(exists("lib/admin/audit.ts"), "Admin audit helper is missing.");
  assert(exists("lib/admin/validation.ts"), "Admin validation helper is missing.");
  assert(exists("lib/supabase/database.types.ts"), "Manual database types are missing.");

  for (const file of actionFiles) {
    assert(exists(file), `Action file missing: ${file}`);
    const source = read(file);
    assert(source.includes("requireAdmin()"), `${file} must call requireAdmin().`);
    assert(!source.includes("getSession("), `${file} must not use getSession().`);
  }

  const logout = read("app/admin/logout/route.ts");
  assert(/export async function POST/.test(logout), "Logout must remain POST-only.");
  assert(!/export async function GET/.test(logout), "Logout must not expose GET.");

  const adminSource = [
    ...protectedRoutes,
    ...actionFiles,
    "lib/admin/permissions.ts",
    "lib/admin/data.ts",
    "lib/admin/audit.ts",
    "lib/admin/validation.ts",
    "components/admin/ControlCenterShell.tsx",
    "components/admin/ControlCenterSidebar.tsx",
    "components/admin/ControlCenterMobileNav.tsx",
  ]
    .filter(exists)
    .map(read)
    .join("\n");

  assert(!/getSession\(/.test(adminSource), "New admin source must not use getSession().");
  assert(!/service_role/i.test(adminSource), "New admin source must not reference service_role.");
  assert(!/secret[_-]?key/i.test(adminSource), "New admin source must not reference secret keys.");

  const healthSource = read("lib/admin/health.ts");
  const overviewSource = read("app/admin/(protected)/page.tsx");
  const timezoneSource = read("lib/admin/timezone.ts");
  const errorCaptureSource = read("lib/errors/server.ts");
  const viteSource = read("vite.config.ts");
  const buildInfoSource = read("app/api/build-info/route.ts");
  const deploymentSource = [
    healthSource,
    overviewSource,
    timezoneSource,
    errorCaptureSource,
  ].join("\n");
  assert(!/VERCEL_[A-Z_]+/.test(deploymentSource), "Admin/runtime diagnostics must not depend on Vercel environment variables.");
  assert(!/Vercel runtime/.test(deploymentSource), "Admin/runtime diagnostics must not describe Vercel as the active runtime.");
  for (const name of ["LUMEO_BUILD_SHA", "LUMEO_DEPLOYMENT_ENV", "LUMEO_DEPLOYMENT_URL"]) {
    assert(healthSource.includes(name) || overviewSource.includes(name), `Admin deployment metadata missing ${name}.`);
    assert(viteSource.includes(name), `Cloudflare build must define ${name}.`);
  }
  assert(buildInfoSource.includes("LUMEO_BUILD_SHA"), "Build-info endpoint must expose Cloudflare build SHA metadata.");
  assert(errorCaptureSource.includes("LUMEO_BUILD_SHA"), "Server error capture must tag Cloudflare build SHA metadata.");

  const analyticsPage = read("app/admin/(protected)/analytics/page.tsx");
  const analyticsActivityPage = read("app/admin/(protected)/analytics/activity/page.tsx");
  assert(analyticsPage.includes('eyebrow="Analytics"'), "Analytics page must use current Analytics wording.");
  assert(analyticsPage.includes('title="Date range"'), "Analytics page must expose the date-range controls.");
  assert(analyticsPage.includes('name="range"'), "Analytics page must expose the range selector.");
  assert(analyticsPage.includes('<option value="custom">Custom</option>'), "Analytics page must expose the custom range.");
  assert(analyticsPage.includes('label="Page Views"'), "Analytics page must display page views.");
  assert(analyticsPage.includes('label="Tool Opens"'), "Analytics page must display tool opens.");
  assert(analyticsPage.includes('title="Operation analytics"'), "Analytics page must explain operation analytics.");
  assert(!analyticsPage.includes("Analytics V1"), "Analytics page must not restore obsolete Analytics V1 copy.");
  assert(!analyticsActivityPage.includes("Analytics V1"), "Analytics activity page must not restore obsolete Analytics V1 copy.");
  // Operation lifecycle metrics are current production behavior and must
  // remain backed by real processing/download events rather than placeholder
  // cards.
  assert(analyticsPage.includes('label="Processing Started"'), "Analytics page must show the Processing Started metric card.");
  assert(analyticsPage.includes('label="Processing Succeeded"'), "Analytics page must show the Processing Succeeded metric card.");
  assert(analyticsPage.includes('label="Processing Failed"'), "Analytics page must show the Processing Failed metric card.");
  assert(analyticsPage.includes('label="Downloads Started"'), "Analytics page must show the Downloads Started metric card.");
  assert(analyticsPage.includes("Success Rate"), "Analytics page must show processing success rate.");

  const overviewPage = read("app/admin/(protected)/page.tsx");
  const navigationSource = read("lib/admin/navigation.ts");
  const adminShell = read("components/admin/ControlCenterShell.tsx");
  const protectedLayout = read("app/admin/(protected)/layout.tsx");

  for (const reader of [
    "getPdfTools",
    "getAnalyticsSummary",
    "getUnreadInboxCount",
    "getFeedbackQueries",
    "getErrorLogSummary",
    "getErrorLogs",
    "getAuditLogs",
    "getSiteSettings",
  ]) {
    assert(overviewPage.includes(reader), `Admin V2 Dashboard must use real reader: ${reader}`);
  }
  for (const section of [
    "Platform status",
    "Requires attention",
    "Important metrics",
    "Processing health",
    "Tool activity",
    "Inbox summary",
    "Recent errors",
    "Recent Admin activity",
    "Quick actions",
  ]) {
    assert(overviewPage.includes(section), `Admin V2 Dashboard section missing: ${section}`);
  }
  assert(overviewPage.includes('label="Page Views"'), "Dashboard must surface real public page views.");
  assert(overviewPage.includes('label="Tool Opens"'), "Dashboard must surface real tool opens.");
  assert(overviewPage.includes("maintenanceTools"), "Dashboard must surface real maintenance state.");
  assert(!overviewPage.includes("Feature Flags"), "Dashboard must not expose unwired feature flags.");
  assert(!overviewPage.includes("AI insight"), "Dashboard must not add fake AI recommendations.");

  for (const group of ["main", "operations", "content", "governance", "owner"]) {
    assert(navigationSource.includes(`group: "${group}"`), `Admin V2 navigation group missing: ${group}`);
  }
  assert(navigationSource.includes('label: "Dashboard"'), "Admin V2 must name /admin Dashboard.");
  assert(navigationSource.includes('roles: ["owner"]'), "Owner navigation must remain role-gated.");
  assert(adminShell.includes("AdminSessionBoundary"), "Admin V2 shell must preserve the session boundary.");
  assert(protectedLayout.includes("requireAdmin()"), "Admin V2 protected layout must keep server authorization.");
  assert(protectedLayout.includes("LUMEO_DEPLOYMENT_ENV") && protectedLayout.includes("LUMEO_BUILD_SHA"), "Admin V2 shell must expose Cloudflare-native runtime metadata.");

  const settingsPage = read("app/admin/(protected)/settings/page.tsx");
  const settingsValidation = read("lib/admin/validation.ts");
  for (const liveSetting of ["maintenance_mode", "public_analytics_enabled"]) {
    assert(settingsPage.includes(liveSetting), `Live setting missing from Settings UI: ${liveSetting}`);
    assert(settingsValidation.includes(liveSetting), `Live setting missing from server allowlist: ${liveSetting}`);
  }
  for (const retiredSetting of [
    "workspace_display_name",
    "support_email",
    "contact_page_enabled",
    "homepage_privacy_message",
    "default_seo_suffix",
  ]) {
    assert(!settingsPage.includes(retiredSetting), `Unwired setting must not appear in owner UI: ${retiredSetting}`);
    assert(!settingsValidation.includes(retiredSetting), `Unwired setting must not remain writable: ${retiredSetting}`);
  }

  // The standalone System page was deliberately removed as redundant (see
  // "refactor: remove redundant System page, trim unwired Settings, group
  // reference nav" #34) -- current analytics messaging lives on the
  // analytics page checked above (`analyticsPage`), so no separate read is
  // needed here.
  assert(analyticsPage.includes("Processing lifecycle metrics"), "Analytics page must describe processing lifecycle metrics.");

  const toolsPage = read("app/admin/(protected)/tools/page.tsx");
  const toolFilters = read("lib/admin/tool-filters.ts");
  for (const filterName of ["q", "category", "status", "enabled", "maintenance"]) {
    assert(toolsPage.includes(`name="${filterName}"`), `Tools V2 filter missing: ${filterName}.`);
  }
  assert(toolsPage.includes("requireAdmin()"), "Tools V2 must retain server authorization.");
  assert(toolsPage.includes("canManageTools(admin.role)"), "Tools V2 must retain role-gated editing.");
  assert(toolsPage.includes("usageAvailable ?"), "Tools V2 must distinguish unavailable usage from zero opens.");
  assert(toolFilters.includes("filterAdminTools"), "Tools V2 URL filter helper is missing.");
  assert(analyticsPage.includes('title="Tool performance"'), "Analytics V2 tool-performance section is missing.");
  assert(analyticsPage.includes('title="Audience and environment"'), "Analytics V2 environment section is missing.");
  assert(analyticsPage.includes("Metrics are withheld instead of presenting unverified zero values"), "Analytics V2 must explain unavailable metrics honestly.");

  const packageJson = JSON.parse(read("package.json"));
  assert(packageJson.dependencies.next === "^16.3.0", "Next.js version changed unexpectedly.");
  assert(packageJson.dependencies.react === "^19.2.8", "React version changed unexpectedly.");
  assert(packageJson.dependencies["react-dom"] === "^19.2.8", "React DOM version changed unexpectedly.");
  assert(packageJson.dependencies["firebase-admin"] === "^14.2.0", "firebase-admin version changed unexpectedly.");

  const protectedStatus = gitStatus(protectedNonAdminFiles);
  assert(!protectedStatus, `Protected non-admin files must not be modified by Control Center work:\n${protectedStatus}`);

  console.log("PASS Control Center migration exists");
  console.log("PASS all required tables and RLS statements exist");
  console.log("PASS admin helper functions exist");
  console.log("PASS seeded tools and homepage slots are present");
  console.log("PASS no fake analytics records are seeded");
  console.log("PASS protected routes are inside app/admin/(protected)");
  console.log("PASS retired and unwired admin surfaces stay removed");
  console.log("PASS server actions call requireAdmin");
  console.log("PASS admin data module is server-only");
  console.log("PASS logout remains POST-only");
  console.log("PASS no getSession, service_role, or secret key usage in new admin source");
  console.log("PASS Admin deployment metadata is Cloudflare-native and Vercel-free");
  console.log("PASS current range-based Analytics control center UI is present");
  console.log("PASS Settings exposes only live runtime controls");
  console.log("PASS protected package versions are unchanged");
  console.log("PASS protected non-admin files are untouched");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Control Center verification failed.");
  process.exit(1);
}
