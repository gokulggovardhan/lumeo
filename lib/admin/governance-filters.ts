import { istDateEndExclusiveUtcIso, istDateStartUtcIso } from "@/lib/admin/timezone";
import type { AdminMemberView } from "@/lib/admin/data";
import type { AdminRole } from "@/lib/admin/types";

export const AUDIT_ENTITY_TYPES = [
  "admin_member",
  "announcement",
  "error_log",
  "feature_flag",
  "feedback_query",
  "pdf_tool",
  "seo_setting",
  "site_setting",
] as const;

export type MemberStatusFilter = "all" | "active" | "deactivated";

export type MemberFilters = {
  query: string;
  role: "all" | AdminRole;
  status: MemberStatusFilter;
};

export type AuditFilters = {
  action: string;
  entityType: string;
  startDate: string;
  endDate: string;
  startIso?: string;
  endExclusiveIso?: string;
  dateError: string | null;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export function resolveMemberFilters(
  params: Record<string, string | string[] | undefined>,
): MemberFilters {
  const role = first(params.role);
  const status = first(params.status);

  return {
    query: first(params.q).trim().slice(0, 120),
    role:
      role === "owner" || role === "admin" || role === "analyst"
        ? role
        : "all",
    status:
      status === "active" || status === "deactivated" ? status : "all",
  };
}

export function hasActiveMemberFilters(filters: MemberFilters) {
  return Boolean(
    filters.query || filters.role !== "all" || filters.status !== "all",
  );
}

export function filterAdminMembers(
  members: AdminMemberView[],
  filters: MemberFilters,
) {
  const query = filters.query.toLocaleLowerCase();

  return members.filter((member) => {
    if (
      query &&
      !`${member.email ?? ""} ${member.userId}`
        .toLocaleLowerCase()
        .includes(query)
    ) {
      return false;
    }
    if (filters.role !== "all" && member.role !== filters.role) return false;
    if (filters.status === "active" && !member.isActive) return false;
    if (filters.status === "deactivated" && member.isActive) return false;
    return true;
  });
}

function isValidIstCalendarDate(value: string) {
  return Boolean(istDateStartUtcIso(value));
}

export function resolveAuditFilters(
  params: Record<string, string | string[] | undefined>,
): AuditFilters {
  const action = first(params.action).trim().slice(0, 120);
  const requestedEntityType = first(params.entity_type).trim();
  const entityType = AUDIT_ENTITY_TYPES.includes(
    requestedEntityType as (typeof AUDIT_ENTITY_TYPES)[number],
  )
    ? requestedEntityType
    : "";
  const startDate = first(params.start).trim();
  const endDate = first(params.end).trim();
  const startValid = !startDate || isValidIstCalendarDate(startDate);
  const endValid = !endDate || isValidIstCalendarDate(endDate);

  let dateError: string | null = null;
  if (!startValid || !endValid) {
    dateError = "Choose valid calendar dates.";
  } else if (startDate && endDate && startDate > endDate) {
    dateError = "The start date must be on or before the end date.";
  }

  if (dateError) {
    return { action, entityType, startDate, endDate, dateError };
  }

  return {
    action,
    entityType,
    startDate,
    endDate,
    startIso: startDate ? istDateStartUtcIso(startDate) ?? undefined : undefined,
    endExclusiveIso: endDate ? istDateEndExclusiveUtcIso(endDate) ?? undefined : undefined,
    dateError: null,
  };
}
