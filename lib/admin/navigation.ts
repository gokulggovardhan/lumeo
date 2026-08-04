import type { AdminRole } from "@/lib/admin/types";

export type AdminNavItem = {
  label: string;
  href: string;
  icon: string;
  // Roles that can act on this page. Undefined means every authenticated
  // admin role can at least view it (read-only for roles that can't edit).
  roles?: AdminRole[];
  // "reference" items are documentation/showroom pages with no live data --
  // rendered in a separate, visually secondary nav group.
  group?: "reference";
};

export const adminNavigation: AdminNavItem[] = [
  { label: "Overview", href: "/admin", icon: "overview" },
  { label: "Analytics", href: "/admin/analytics", icon: "analytics" },
  { label: "Errors", href: "/admin/errors", icon: "errors" },
  { label: "Health", href: "/admin/health", icon: "health" },
  { label: "PDF Tools", href: "/admin/tools", icon: "tools" },
  { label: "Homepage", href: "/admin/homepage", icon: "homepage" },
  { label: "Feature Flags", href: "/admin/feature-flags", icon: "flags" },
  { label: "Announcements", href: "/admin/announcements", icon: "announcements" },
  { label: "Inbox", href: "/admin/inbox", icon: "inbox" },
  { label: "SEO", href: "/admin/seo", icon: "seo" },
  { label: "Audit Log", href: "/admin/audit", icon: "audit" },
  { label: "Settings", href: "/admin/settings", icon: "settings", roles: ["owner"] },
  { label: "Administrators", href: "/admin/members", icon: "members", roles: ["owner"] },
  { label: "Design System", href: "/admin/design-system", icon: "design", group: "reference" },
  { label: "Guide", href: "/admin/guide", icon: "guide", group: "reference" },
];

export function visibleAdminNavigation(role: AdminRole | null): AdminNavItem[] {
  return adminNavigation.filter((item) => !item.roles || (role !== null && item.roles.includes(role)));
}

export function isActiveAdminRoute(pathname: string, href: string) {
  if (href === "/admin") {
    return pathname === "/admin";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}
