import type { AdminRole } from "@/lib/admin/types";

export type AdminNavGroup = "main" | "operations" | "content" | "governance" | "owner";

export type AdminNavItem = {
  label: string;
  href: string;
  icon: string;
  group: AdminNavGroup;
  roles?: AdminRole[];
};

export type AdminNavigationGroup = {
  id: AdminNavGroup;
  label: string;
  items: AdminNavItem[];
};

export const adminNavigation: AdminNavItem[] = [
  { label: "Dashboard", href: "/admin", icon: "overview", group: "main" },
  { label: "Analytics", href: "/admin/analytics", icon: "analytics", group: "main" },
  { label: "Tools", href: "/admin/tools", icon: "tools", group: "main" },

  { label: "Health", href: "/admin/health", icon: "health", group: "operations" },
  { label: "Errors", href: "/admin/errors", icon: "errors", group: "operations" },
  { label: "Inbox", href: "/admin/inbox", icon: "inbox", group: "operations" },

  { label: "Announcements", href: "/admin/announcements", icon: "announcements", group: "content" },
  { label: "SEO", href: "/admin/seo", icon: "seo", group: "content" },

  { label: "Audit Log", href: "/admin/audit", icon: "audit", group: "governance" },

  { label: "Administrators", href: "/admin/members", icon: "members", group: "owner", roles: ["owner"] },
  { label: "Settings", href: "/admin/settings", icon: "settings", group: "owner", roles: ["owner"] },
];

const groupOrder: ReadonlyArray<{ id: AdminNavGroup; label: string }> = [
  { id: "main", label: "Main" },
  { id: "operations", label: "Operations" },
  { id: "content", label: "Content" },
  { id: "governance", label: "Governance" },
  { id: "owner", label: "Owner" },
];

export function visibleAdminNavigation(role: AdminRole | null): AdminNavItem[] {
  return adminNavigation.filter((item) => !item.roles || (role !== null && item.roles.includes(role)));
}

export function groupedAdminNavigation(role: AdminRole | null): AdminNavigationGroup[] {
  const visible = visibleAdminNavigation(role);

  return groupOrder
    .map((group) => ({
      ...group,
      items: visible.filter((item) => item.group === group.id),
    }))
    .filter((group) => group.items.length > 0);
}

export function isActiveAdminRoute(pathname: string, href: string) {
  if (href === "/admin") {
    return pathname === "/admin";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}
