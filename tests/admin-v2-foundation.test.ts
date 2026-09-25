import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("Admin Console V2 keeps server authorization and private session boundaries", () => {
  const layout = read("app/admin/(protected)/layout.tsx");
  const shell = read("components/admin/ControlCenterShell.tsx");
  const auth = read("lib/admin/auth.ts");

  assert.match(layout, /await requireAdmin\(\)/);
  assert.match(shell, /AdminSessionBoundary/);
  assert.match(auth, /supabase\.auth\.getClaims\(\)/);
  assert.match(auth, /\.from\("admin_members"\)/);
  assert.doesNotMatch(shell, /service_role|SUPABASE_SERVICE_ROLE_KEY/);
});

test("Admin Console V2 navigation is grouped and owner controls remain role-gated", () => {
  const navigation = read("lib/admin/navigation.ts");

  for (const group of ["main", "operations", "content", "governance", "owner"]) {
    assert.match(navigation, new RegExp(`group: "${group}"`));
  }

  assert.match(navigation, /label: "Dashboard", href: "\/admin"/);
  assert.match(navigation, /label: "Administrators"[\s\S]*roles: \["owner"\]/);
  assert.match(navigation, /label: "Settings"[\s\S]*roles: \["owner"\]/);
});

test("Admin Console V2 Dashboard derives attention and metrics from real protected readers", () => {
  const dashboard = read("app/admin/(protected)/page.tsx");

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
    assert.match(dashboard, new RegExp(reader));
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
    assert.ok(dashboard.includes(section), `missing Dashboard section: ${section}`);
  }

  assert.doesNotMatch(dashboard, /fake|placeholder|AI insight/i);
});

test("Admin Console V2 mobile navigation remains keyboard and pointer dismissible", () => {
  const mobile = read("components/admin/ControlCenterMobileNav.tsx");

  assert.match(mobile, /event\.key === "Escape"/);
  assert.match(mobile, /document\.addEventListener\("pointerdown", handlePointerDown, true\)/);
  assert.match(mobile, /onClick=\{\(\) => setOpen\(false\)\}/);
  assert.match(mobile, /aria-expanded=\{open\}/);
  assert.match(mobile, /aria-controls="admin-mobile-menu"/);
  assert.match(mobile, /<Link href="\/"/);
  assert.match(mobile, /Cloudflare · IST/);
  assert.doesNotMatch(mobile, /useEffect\(\(\) => \{\s*setOpen\(false\)/);
});

test("Admin Console V2 runtime identity stays Cloudflare-native", () => {
  const layout = read("app/admin/(protected)/layout.tsx");
  const topbar = read("components/admin/AdminTopbar.tsx");

  assert.match(layout, /LUMEO_DEPLOYMENT_ENV/);
  assert.match(layout, /LUMEO_BUILD_SHA/);
  assert.match(topbar, /Cloudflare · IST/);
  assert.doesNotMatch(`${layout}\n${topbar}`, /VERCEL_/);
});
