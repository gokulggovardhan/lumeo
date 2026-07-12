import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const requiredFiles = [
  "supabase/migrations/20260712_001_admin_members.sql",
  "lib/admin/auth.ts",
  "lib/admin/types.ts",
  "app/admin/login/page.tsx",
  "app/admin/login/actions.ts",
  "app/admin/(protected)/layout.tsx",
  "app/admin/(protected)/page.tsx",
  "app/admin/logout/route.ts",
  "components/admin/AdminShell.tsx",
  "components/admin/AdminSignOutButton.tsx",
  "docs/ADMIN_AUTH.md",
];

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function fileExists(relativePath) {
  return existsSync(join(root, relativePath));
}

try {
  for (const file of requiredFiles) {
    assert(fileExists(file), `Missing required admin auth file: ${file}`);
  }

  assert(
    !fileExists("app/admin/(protected)/login/page.tsx"),
    "Admin login must stay outside the protected route group.",
  );

  if (fileExists("app/admin/layout.tsx")) {
    const rootLayout = read("app/admin/layout.tsx");
    assert(
      !rootLayout.includes("requireAdmin") && !rootLayout.includes("getAdminContext"),
      "Root app/admin/layout.tsx must not protect /admin/login.",
    );
  }

  const migration = read("supabase/migrations/20260712_001_admin_members.sql");
  assert(/create table if not exists public\.admin_members/i.test(migration), "admin_members table migration is missing.");
  assert(/references auth\.users\(id\) on delete cascade/i.test(migration), "admin_members must cascade with auth.users.");
  assert(/constraint admin_members_role_check check \(role in \('owner', 'admin', 'analyst'\)\)/i.test(migration), "admin_members role check is missing.");
  assert(/enable row level security/i.test(migration), "admin_members RLS is not enabled.");
  assert(/for select/i.test(migration), "admin_members SELECT policy is missing.");
  assert(!/for\s+(insert|update|delete)/i.test(migration), "admin_members must not expose public insert/update/delete policies.");
  assert(/set search_path = public/i.test(migration), "admin trigger function must set an explicit search_path.");
  assert(!/insert into public\.admin_members[\s\S]*'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'/i.test(migration), "Migration must not contain a real bootstrap UUID.");

  const authSource = read("lib/admin/auth.ts");
  assert(authSource.includes("getClaims()"), "requireAdmin must use getClaims().");
  assert(!authSource.includes("getSession("), "requireAdmin must not use getSession().");
  assert(authSource.includes("requireAdmin"), "requireAdmin export is missing.");

  const protectedLayout = read("app/admin/(protected)/layout.tsx");
  assert(protectedLayout.includes("requireAdmin"), "Protected admin layout must call requireAdmin().");

  const loginAction = read("app/admin/login/actions.ts");
  assert(!loginAction.includes("getSession("), "Admin login action must not use getSession().");
  assert(loginAction.includes("getAdminContext"), "Admin login action must verify membership after sign-in.");
  assert(loginAction.includes("not-authorized"), "Admin login action must reject non-admin users.");

  const loginPage = read("app/admin/login/page.tsx");
  assert(!loginPage.includes("requireAdmin"), "Public admin login page must not call requireAdmin().");
  assert(!loginPage.includes("getAdminContext"), "Public admin login page must not call getAdminContext().");

  const logoutSource = read("app/admin/logout/route.ts");
  assert(/export async function POST/.test(logoutSource), "Admin logout must expose POST.");
  assert(!/export async function GET/.test(logoutSource), "Admin logout must not expose GET.");
  assert(logoutSource.includes("signOut()"), "Admin logout must call Supabase signOut().");

  const adminSources = [
    "lib/admin/auth.ts",
    "lib/admin/types.ts",
    "app/admin/login/page.tsx",
    "app/admin/login/actions.ts",
    "app/admin/(protected)/layout.tsx",
    "app/admin/(protected)/page.tsx",
    "app/admin/logout/route.ts",
    "components/admin/AdminShell.tsx",
    "components/admin/AdminSignOutButton.tsx",
  ]
    .map(read)
    .join("\n");

  assert(!/service_role/i.test(adminSources), "Admin source must not reference service_role.");
  assert(!/secret[_-]?key/i.test(adminSources), "Admin source must not reference secret keys.");

  const packageJson = JSON.parse(read("package.json"));
  assert(packageJson.dependencies.next === "^16.2.10", "Next.js version changed unexpectedly.");
  assert(packageJson.dependencies.react === "^19.2.7", "React version changed unexpectedly.");
  assert(packageJson.dependencies["react-dom"] === "^19.2.7", "React DOM version changed unexpectedly.");
  assert(packageJson.dependencies["firebase-admin"] === "^14.1.0", "firebase-admin version changed unexpectedly.");

  console.log("PASS admin migration exists");
  console.log("PASS admin RLS policy is scoped to authenticated self-read");
  console.log("PASS admin route group is safe");
  console.log("PASS public login is outside protected layout");
  console.log("PASS requireAdmin uses verified claims");
  console.log("PASS admin logout POST exists");
  console.log("PASS no service role or secret key usage in admin source");
  console.log("PASS protected package versions are unchanged");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Admin auth verification failed.");
  process.exit(1);
}
