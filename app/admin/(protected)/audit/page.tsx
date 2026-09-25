import Link from "next/link";
import { AdminDataTable } from "@/components/admin/AdminDataTable";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminSectionCard } from "@/components/admin/AdminSectionCard";
import { requireAdmin } from "@/lib/admin/auth";
import { getAuditLogs, resolveAdminEmails } from "@/lib/admin/data";
import { canViewAudit } from "@/lib/admin/permissions";
import { pageNumber } from "@/lib/admin/pagination";
import { formatAdminDateTime } from "@/lib/admin/timezone";
import {
  AUDIT_ENTITY_TYPES,
  resolveAuditFilters,
} from "@/lib/admin/governance-filters";

const PAGE_SIZE = 50;

function buildQuery(params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await requireAdmin();
  const params = (await searchParams) ?? {};
  const page = pageNumber(Array.isArray(params.page) ? params.page[0] : params.page);
  const canView = canViewAudit(admin.role);

  if (!canView) {
    return (
      <div className="space-y-7">
        <AdminPageHeader
          eyebrow="Record of change"
          title="Audit Log"
          description="Read-only administrative history."
        />
        <AdminEmptyState
          title="No access"
          description="Your role does not have permission to view the audit log."
        />
      </div>
    );
  }

  const filters = resolveAuditFilters(params);
  const logs = filters.dateError
    ? { data: [], error: null }
    : await getAuditLogs(PAGE_SIZE + 1, (page - 1) * PAGE_SIZE, {
        action: filters.action || undefined,
        entityType: filters.entityType || undefined,
        startDate: filters.startIso,
        endDate: filters.endExclusiveIso,
      });
  if (logs.error) {
    return (
      <div className="space-y-7">
        <AdminPageHeader
          eyebrow="Record of change"
          title="Audit Log"
          description="Read-only administrative history."
        />
        <AdminEmptyState
          title="Audit records are unavailable"
          description="Administrative history could not be verified. Try again after the data service recovers."
        />
      </div>
    );
  }

  const hasNextPage = logs.data.length > PAGE_SIZE;
  const visibleLogs = logs.data.slice(0, PAGE_SIZE);
  const actorEmails = await resolveAdminEmails(
    visibleLogs.map((log) => log.actor_user_id).filter((id): id is string => Boolean(id)),
  );

  const carryParams = {
    action: filters.action || undefined,
    entity_type: filters.entityType || undefined,
    start: filters.startDate || undefined,
    end: filters.endDate || undefined,
  };

  return (
    <div className="space-y-7">
      <AdminPageHeader
        eyebrow="Record of change"
        title="Audit Log"
        description="Read-only administrative history. All date filters and timestamps use IST (Asia/Kolkata). Sensitive raw payloads are not displayed by default."
      />

      <AdminSectionCard title="Filters" description="Narrow by action text, entity type, or IST calendar-date range.">
        <form method="get" className="grid gap-4 md:grid-cols-4">
          <label className="block text-sm font-semibold text-[#F0EAD6]">
            Action contains
            <input
              type="text"
              name="action"
              defaultValue={filters.action}
              placeholder="e.g. update"
              className="mt-2 min-h-11 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-input)] px-3 text-base text-[var(--lumeo-paper-50)] placeholder:text-[var(--lumeo-paper-600)] sm:text-sm"
            />
          </label>
          <label className="block text-sm font-semibold text-[#F0EAD6]">
            Entity type
            <select
              name="entity_type"
              defaultValue={filters.entityType}
              className="mt-2 min-h-11 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-input)] px-3 text-base sm:text-sm"
            >
              <option value="">All</option>
              {AUDIT_ENTITY_TYPES.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-semibold text-[#F0EAD6]">
            From (IST)
            <input
              type="date"
              name="start"
              defaultValue={filters.startDate}
              className="mt-2 min-h-11 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-input)] px-3 text-base text-[var(--lumeo-paper-50)] sm:text-sm"
            />
          </label>
          <label className="block text-sm font-semibold text-[#F0EAD6]">
            To (IST)
            <input
              type="date"
              name="end"
              defaultValue={filters.endDate}
              className="mt-2 min-h-11 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-input)] px-3 text-sm text-[var(--lumeo-paper-50)]"
            />
          </label>
          <div className="flex items-end gap-3 md:col-span-4">
            <button type="submit" className="min-h-11 rounded-xl bg-[var(--emerald-600)] px-5 text-sm font-semibold text-[var(--text-on-accent)] transition hover:bg-[var(--emerald-500)]">
              Apply filters
            </button>
            {(filters.action || filters.entityType || filters.startDate || filters.endDate) && (
              <Link href="/admin/audit" className="min-h-11 rounded-xl border border-[#E8DFC8]/12 px-5 text-sm font-semibold leading-[2.75rem] text-[#F0EAD6]/70">
                Clear
              </Link>
            )}
          </div>
          {filters.dateError ? (
            <p role="alert" className="md:col-span-4 text-sm font-semibold text-[var(--text-danger)]">
              {filters.dateError}
            </p>
          ) : null}
        </form>
      </AdminSectionCard>

      <AdminSectionCard title="Recent administrative actions" description="Showing 50 records per page. Actor identifiers are resolved to email when the actor is a known administrator.">
        <AdminDataTable
          columns={["Time (IST)", "Actor", "Role", "Action", "Entity", "Summary"]}
          rows={visibleLogs.map((log) => [
            formatAdminDateTime(log.created_at),
            log.actor_user_id ? (actorEmails[log.actor_user_id] ?? log.actor_user_id) : "Unknown",
            log.actor_role ?? "Unknown",
            log.action,
            `${log.entity_type}${log.entity_id ? `:${log.entity_id}` : ""}`,
            <details key="summary" className="max-w-md">
              <summary className="cursor-pointer font-semibold text-[#F0EAD6]">{log.summary}</summary>
              <p className="mt-2 text-xs leading-5 text-[#F0EAD6]/50">
                Change details are intentionally summarized to avoid exposing sensitive values.
              </p>
            </details>,
          ])}
          empty={
            <AdminEmptyState
              title={filters.dateError ? "Choose a valid date range" : "No audit records"}
              description={filters.dateError ?? "Audit records will appear after Control Center actions are performed, or try clearing your filters."}
            />
          }
        />
        <div className="mt-4 flex gap-3">
          {page > 1 && (
            <Link className="rounded-xl border border-[#E8DFC8]/12 px-4 py-2 text-sm font-semibold" href={`/admin/audit${buildQuery({ ...carryParams, page: String(page - 1) })}`}>
              Previous
            </Link>
          )}
          {hasNextPage && (
            <Link className="rounded-xl border border-[#E8DFC8]/12 px-4 py-2 text-sm font-semibold" href={`/admin/audit${buildQuery({ ...carryParams, page: String(page + 1) })}`}>
              Next
            </Link>
          )}
        </div>
      </AdminSectionCard>
    </div>
  );
}
