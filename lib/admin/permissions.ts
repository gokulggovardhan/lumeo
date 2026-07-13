import type { AdminRole } from "@/lib/admin/types";

export function canViewControlCenter(role: AdminRole | null) {
  return role === "owner" || role === "admin" || role === "analyst";
}

export function canManageTools(role: AdminRole | null) {
  return role === "owner" || role === "admin";
}

export function canManageHomepage(role: AdminRole | null) {
  return role === "owner" || role === "admin";
}

export function canManageFeatureFlags(role: AdminRole | null) {
  return role === "owner" || role === "admin";
}

export function canManageAnnouncements(role: AdminRole | null) {
  return role === "owner" || role === "admin";
}

export function canManageSeo(role: AdminRole | null) {
  return role === "owner" || role === "admin";
}

export function canManageSettings(role: AdminRole | null) {
  return role === "owner";
}

export function canViewAudit(role: AdminRole | null) {
  return role === "owner" || role === "admin" || role === "analyst";
}

export function canViewAnalytics(role: AdminRole | null) {
  return role === "owner" || role === "admin" || role === "analyst";
}

export function assertPermission(allowed: boolean) {
  if (!allowed) {
    return {
      ok: false as const,
      message: "You do not have permission to make that change.",
    };
  }

  return { ok: true as const };
}
