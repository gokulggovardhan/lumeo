import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const requiredFiles = [
  "supabase/migrations/20260712001_admin_members.sql",
  "supabase/migrations/20260919001_admin_security_hardening.sql",
  "lib/supabase/proxy.ts",
  "lib/admin/auth.ts",
  "lib/admin/types.ts",
  "app/admin/login/page.tsx",
  "app/admin/login/actions.ts",
  "app/admin/(protected)/layout.tsx",
  "app/admin/(protected)/page.tsx",
  "app/admin/logout/route.ts",
  "components/admin/AdminLoginSubmitButton.tsx",
  "components/admin/ControlCenterShell.tsx",
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

  const baseMigration = read("supabase/migrations/20260712001_admin_members.sql");
  assert(/create table if not exists public\.admin_members/i.test(baseMigration), "admin_members table migration is missing.");
  assert(/enable row level security/i.test(baseMigration), "admin_members RLS is not enabled.");

  const hardeningMigration = read("supabase/migrations/20260919001_admin_security_hardening.sql");
  for (const helper of [
    "current_admin_role",
    "is_active_admin",
    "is_owner",
    "can_manage_content",
  ]) {
    assert(
      new RegExp(`revoke execute on function public\\.${helper}\\(\\) from anon`, "i").test(hardeningMigration),
      `${helper} must not remain anonymously executable.`,
    );
  }
  assert(
    /using \(\(select auth\.uid\(\)\) = user_id\)/i.test(hardeningMigration),
    "admin_members self-read policy must use an init-plan-safe auth.uid() lookup.",
  );

  const authSource = read("lib/admin/auth.ts");
  assert(authSource.includes("getClaims()"), "Admin authorization must use getClaims().");
  assert(!authSource.includes("getSession("), "Admin authorization must not use getSession().");
  assert(authSource.includes("getAdminContextWithClient"), "Same-client admin authorization helper is missing.");

  const protectedLayout = read("app/admin/(protected)/layout.tsx");
  assert(protectedLayout.includes("requireAdmin"), "Protected admin layout must call requireAdmin().");

  const loginAction = read("app/admin/login/actions.ts");
  assert(loginAction.includes("getAdminContextWithClient(supabase)"), "Login must authorize with the same Supabase client that signed in.");
  assert(loginAction.includes('revalidatePath("/admin", "layout")'), "Login must revalidate protected admin state before redirect.");
  assert(!/const password[^\n]*\.trim\(/.test(loginAction), "Login must not trim or normalize password text.");
  assert(loginAction.includes("not-authorized"), "Admin login action must reject non-admin users.");

  const proxySource = read("lib/supabase/proxy.ts");
  assert(proxySource.includes("setAll(cookiesToSet, headers)"), "Supabase proxy must accept auth response headers.");
  assert(proxySource.includes("applySessionHeaders(response, headers)"), "Supabase proxy must preserve auth cache-control metadata.");
  assert(proxySource.includes("await supabase.auth.getClaims()"), "Supabase proxy must validate/refresh claims.");

  const loginPage = read("app/admin/login/page.tsx");
  assert(loginPage.includes('autoComplete="username"'), "Login email must support username autofill semantics.");
  assert(loginPage.includes('autoComplete="current-password"'), "Login password must support password-manager autofill.");
  assert((loginPage.match(/text-base/g) ?? []).length >= 2, "iPhone login inputs must render at 16px to avoid focus zoom.");
  assert(loginPage.includes("safe-area-inset-bottom"), "Login page must respect iPhone safe-area insets.");
  assert(loginPage.includes("AdminLoginSubmitButton"), "Login must use a pending-aware submit button.");

  const logoutSource = read("app/admin/logout/route.ts");
  assert(/export async function POST/.test(logoutSource), "Admin logout must expose POST.");
  assert(!/export async function GET/.test(logoutSource), "Admin logout must not expose GET.");
  assert(logoutSource.includes("signOut()"), "Admin logout must call Supabase signOut().");
  assert(logoutSource.includes('revalidatePath("/admin", "layout")'), "Logout must revalidate protected admin state.");

  const nextConfig = read("next.config.ts");
  assert(nextConfig.includes('source: "/admin/:path*"'), "Admin routes need an explicit cache policy.");
  assert(nextConfig.includes("private, no-store"), "Admin responses must be non-cacheable.");

  const adminSources = requiredFiles
    .filter((file) => /\.(ts|tsx)$/.test(file))
    .map(read)
    .join("\n");

  assert(!/service_role/i.test(adminSources), "Admin browser/application source must not reference service_role.");
  assert(!/secret[_-]?key/i.test(adminSources), "Admin browser/application source must not reference secret keys.");

  console.log("PASS admin route protection uses verified claims");
  console.log("PASS login authorizes on the same Supabase client");
  console.log("PASS Supabase SSR cache headers are preserved");
  console.log("PASS login/logout revalidate protected state");
  console.log("PASS iPhone-safe login fields and safe areas are present");
  console.log("PASS admin responses are marked private/no-store");
  console.log("PASS anonymous execution is revoked from internal admin helpers");
  console.log("PASS no service role or secret key usage in admin application source");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Admin auth verification failed.");
  process.exit(1);
}
