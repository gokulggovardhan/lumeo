import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const migrationPath = "supabase/migrations/20260712_002_control_center_foundation.sql";
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
  "app/admin/(protected)/homepage/page.tsx",
  "app/admin/(protected)/feature-flags/page.tsx",
  "app/admin/(protected)/announcements/page.tsx",
  "app/admin/(protected)/seo/page.tsx",
  "app/admin/(protected)/audit/page.tsx",
  "app/admin/(protected)/system/page.tsx",
  "app/admin/(protected)/settings/page.tsx",
];
const actionFiles = [
  "app/admin/(protected)/tools/actions.ts",
  "app/admin/(protected)/homepage/actions.ts",
  "app/admin/(protected)/feature-flags/actions.ts",
  "app/admin/(protected)/announcements/actions.ts",
  "app/admin/(protected)/seo/actions.ts",
  "app/admin/(protected)/settings/actions.ts",
];
const protectedNonAdminFiles = [
  "app/globals.css",
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

  const analyticsPage = read("app/admin/(protected)/analytics/page.tsx");
  assert(analyticsPage.includes("Analytics V1"), "Analytics page must use Analytics V1 wording.");
  assert(analyticsPage.includes("Page Views Today"), "Analytics page must display page views.");
  assert(analyticsPage.includes("Tool Opens Today"), "Analytics page must display tool opens.");
  assert(analyticsPage.includes("Operation analytics"), "Analytics page must explain postponed operation analytics.");
  assert(!analyticsPage.includes('label="Started"'), "Analytics page must not show lifecycle Started metric cards in V1.");
  assert(!analyticsPage.includes('label="Succeeded"'), "Analytics page must not show lifecycle Succeeded metric cards in V1.");
  assert(!analyticsPage.includes('label="Failed"'), "Analytics page must not show lifecycle Failed metric cards in V1.");
  assert(!analyticsPage.includes('label="Downloads"'), "Analytics page must not show lifecycle Downloads metric cards in V1.");
  assert(!analyticsPage.includes("Success Rate"), "Analytics page must not show processing success rate in V1.");
  assert(!analyticsPage.includes("Avg Duration"), "Analytics page must not show average processing duration in V1.");

  const overviewPage = read("app/admin/(protected)/page.tsx");
  assert(overviewPage.includes("Public Page Views"), "Overview must surface public page views.");
  assert(overviewPage.includes("Tool Opens Today"), "Overview must surface tool opens.");
  assert(!overviewPage.includes("Processing Success Rate"), "Overview must not show processing success rate in V1.");

  const systemPage = read("app/admin/(protected)/system/page.tsx");
  assert(systemPage.includes("V1 - Discovery analytics"), "System page must identify Analytics V1.");
  assert(systemPage.includes("Operation lifecycle metrics"), "System page must mark lifecycle metrics as planned.");

  const packageJson = JSON.parse(read("package.json"));
  assert(packageJson.dependencies.next === "^16.2.10", "Next.js version changed unexpectedly.");
  assert(packageJson.dependencies.react === "^19.2.7", "React version changed unexpectedly.");
  assert(packageJson.dependencies["react-dom"] === "^19.2.7", "React DOM version changed unexpectedly.");
  assert(packageJson.dependencies.firebase === "^12.16.0", "Firebase version changed unexpectedly.");
  assert(packageJson.dependencies["firebase-admin"] === "^14.1.0", "firebase-admin version changed unexpectedly.");

  const protectedStatus = gitStatus(protectedNonAdminFiles);
  assert(!protectedStatus, `Protected non-admin files must not be modified by Control Center work:\n${protectedStatus}`);

  console.log("PASS Control Center migration exists");
  console.log("PASS all required tables and RLS statements exist");
  console.log("PASS admin helper functions exist");
  console.log("PASS seeded tools and homepage slots are present");
  console.log("PASS no fake analytics records are seeded");
  console.log("PASS protected routes are inside app/admin/(protected)");
  console.log("PASS server actions call requireAdmin");
  console.log("PASS admin data module is server-only");
  console.log("PASS logout remains POST-only");
  console.log("PASS no getSession, service_role, or secret key usage in new admin source");
  console.log("PASS Analytics V1 control center wording is present");
  console.log("PASS protected package versions are unchanged");
  console.log("PASS protected non-admin files are untouched");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Control Center verification failed.");
  process.exit(1);
}
