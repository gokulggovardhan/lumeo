export type AdminNavItem = {
  label: string;
  href: string;
  icon: string;
};

export const adminNavigation: AdminNavItem[] = [
  { label: "Overview", href: "/admin", icon: "overview" },
  { label: "Analytics", href: "/admin/analytics", icon: "analytics" },
  { label: "PDF Tools", href: "/admin/tools", icon: "tools" },
  { label: "Homepage", href: "/admin/homepage", icon: "homepage" },
  { label: "Feature Flags", href: "/admin/feature-flags", icon: "flags" },
  { label: "Announcements", href: "/admin/announcements", icon: "announcements" },
  { label: "SEO", href: "/admin/seo", icon: "seo" },
  { label: "Audit Log", href: "/admin/audit", icon: "audit" },
  { label: "System", href: "/admin/system", icon: "system" },
  { label: "Settings", href: "/admin/settings", icon: "settings" },
];

export function isActiveAdminRoute(pathname: string, href: string) {
  if (href === "/admin") {
    return pathname === "/admin";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}
