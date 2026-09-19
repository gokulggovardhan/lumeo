import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const requiredFiles = [
  "supabase/migrations/20260712001_admin_members.sql",
  "supabase/migrations/20260919160000_admin_security_hardening.sql",
  "lib/supabase/proxy.ts",
  "lib/admin/auth.ts",
  "lib/admin/types.ts",
  "app/admin/login/page.tsx",
  "app/admin/login/actions.ts",
  "app/admin/(protected)/layout.tsx",
  "app/admin/(protected)/page.tsx",
  "app/admin/logout/route.ts",
  "app/admin/session/route.ts",
  "components/admin/AdminLoginSubmitButton.tsx",
  "components/admin/AdminSessionBoundary.tsx",
  "components/admin/ControlCenterShell.tsx",
  "playwright.admin.config.ts",
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

  const hardeningMigration = read("supabase/migrations/20260919160000_admin_security_hardening.sql");
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
  assert(proxySource.includes("applyAdminCachePolicy"), "Supabase proxy must enforce the admin no-store policy at the request boundary.");

  const loginPage = read("app/admin/login/page.tsx");
  assert(loginPage.includes('autoComplete="username"'), "Login email must support username autofill semantics.");
  assert(loginPage.includes('autoComplete="current-password"'), "Login password must support password-manager autofill.");
  assert((loginPage.match(/text-base/g) ?? []).length >= 2, "iPhone login inputs must render at 16px to avoid focus zoom.");
  assert(loginPage.includes("safe-area-inset-bottom"), "Login page must respect iPhone safe-area insets.");
  assert(loginPage.includes("AdminLoginSubmitButton"), "Login must use a pending-aware submit button.");

  const logoutSource = read("app/admin/logout/route.ts");
  assert(/export async function POST/.test(logoutSource), "Admin logout must expose POST.");
  assert(!/export async function GET/.test(logoutSource), "Admin logout must not expose GET.");
  assert(logoutSource.includes('signOut({ scope: "local" })'), "Admin logout must revoke only the current Supabase session.");
  assert(logoutSource.includes('Location: "/admin/login?message=signed-out"'), "Logout redirect must stay relative to the current origin.");
  assert(logoutSource.includes('revalidatePath("/admin", "layout")'), "Logout must revalidate protected admin state.");

  const sessionRoute = read("app/admin/session/route.ts");
  assert(sessionRoute.includes("getAdminContext()"), "Session probe must use server-side admin authorization.");
  assert(sessionRoute.includes("authenticated: admin.authenticated"), "Session probe must report server-authenticated state.");
  assert(sessionRoute.includes("authorized: admin.authorized"), "Session probe must report server authorization state.");
  assert(sessionRoute.includes("status: 200"), "Expected signed-out session probes must not create browser console errors.");
  assert(sessionRoute.includes("private, no-store"), "Session probe must never be cached.");

  const signOutButton = read("components/admin/AdminSignOutButton.tsx");
  assert(signOutButton.includes("ADMIN_SIGNED_OUT_MARKER"), "Sign-out must mark the current tab before navigation.");
  assert(signOutButton.includes("onSubmit={markSignedOut}"), "Sign-out marker must be set before the logout POST.");

  const historyBoundary = read("components/admin/AdminSessionBoundary.tsx");
  assert(historyBoundary.includes('"pagehide"'), "Admin history boundary must observe pagehide.");
  assert(historyBoundary.includes('"pageshow"'), "Admin history boundary must observe pageshow.");
  assert(historyBoundary.includes('"popstate"'), "Admin history boundary must observe browser Back/Forward navigation.");
  assert(historyBoundary.includes("event.persisted"), "Admin history boundary must detect BFCache restoration.");
  assert(historyBoundary.includes("isBackForwardNavigation()"), "Admin history boundary must detect full back/forward document restores.");
  assert(historyBoundary.includes("ADMIN_SIGNED_OUT_MARKER"), "Admin history boundary must honor the same-tab logout marker.");
  assert(historyBoundary.includes('fetch("/admin/session"'), "History restoration must revalidate against the server.");
  assert(historyBoundary.includes("window.location.replace"), "Failed history revalidation must replace the protected history entry.");
  assert(!historyBoundary.includes("getSession("), "History protection must not trust a client-only session read.");

  const shellSource = read("components/admin/ControlCenterShell.tsx");
  assert(shellSource.includes("AdminSessionBoundary"), "Protected admin shell must mount the history/session boundary.");

  const nextConfig = read("next.config.ts");
  assert(nextConfig.includes('source: "/admin/:path*"'), "Admin routes need an explicit cache policy.");
  assert(nextConfig.includes("private, no-store"), "Admin responses must be non-cacheable.");

  const playwrightConfig = read("playwright.admin.config.ts");
  assert(
    playwrightConfig.includes("npm run build && npm run start"),
    "Admin browser E2E must run against a production Next.js server.",
  );

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
  console.log("PASS logout revokes only the current administrator session");
  console.log("PASS iPhone-safe login fields and safe areas are present");
  console.log("PASS admin responses are marked private/no-store");
  console.log("PASS admin browser E2E runs against production Next.js output");
  console.log("PASS BFCache and Back/Forward restoration revalidate server authorization and fail closed");
  console.log("PASS logout redirect remains same-origin and marks the current tab");
  console.log("PASS anonymous execution is revoked from internal admin helpers");
  console.log("PASS no service role or secret key usage in admin application source");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Admin auth verification failed.");
  process.exit(1);
}
