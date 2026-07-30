import Link from "next/link";
import { AdminDataTable } from "@/components/admin/AdminDataTable";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminSectionCard } from "@/components/admin/AdminSectionCard";
import { requireAdmin } from "@/lib/admin/auth";
import { getAuditLogs, resolveAdminEmails } from "@/lib/admin/data";
import { canViewAudit } from "@/lib/admin/permissions";
import { formatAdminDateTime } from "@/lib/admin/timezone";

const entityTypes = [
  "admin_member",
  "announcement",
  "feature_flag",
  "feedback_query",
  "pdf_tool",
  "seo_setting",
  "site_setting",
];

function pageNumber(value: string | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
}

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
  searchParams?: Promise<{ page?: string; action?: string; entity_type?: string; start?: string; end?: string }>;
}) {
  const admin = await requireAdmin();
  const params = (await searchParams) ?? {};
  const page = pageNumber(params.page);
  const canView = canViewAudit(admin.role);

  const filters = {
    action: params.action?.trim() || undefined,
    entityType: params.entity_type?.trim() || undefined,
    startDate: params.start ? new Date(params.start).toISOString() : undefined,
    endDate: params.end ? new Date(new Date(params.end).getTime() + 24 * 60 * 60 * 1000).toISOString() : undefined,
  };

  const logs = canView ? await getAuditLogs(50, (page - 1) * 50, filters) : { data: [], error: null };
  const actorEmails = canView
    ? await resolveAdminEmails(logs.data.map((log) => log.actor_user_id).filter((id): id is string => Boolean(id)))
    : {};

  const carryParams = { action: params.action, entity_type: params.entity_type, start: params.start, end: params.end };

  return (
    <div className="space-y-7">
      <AdminPageHeader
        eyebrow="Record of change"
        title="Audit Log"
        description="Read-only administrative history. Sensitive raw payloads are not displayed by default."
      />

      <AdminSectionCard title="Filters" description="Narrow by action text, entity type, or date range.">
        <form method="get" className="grid gap-4 md:grid-cols-4">
          <label className="block text-sm font-semibold text-[#F0EAD6]">
            Action contains
            <input
              type="text"
              name="action"
              defaultValue={params.action}
              placeholder="e.g. update"
              className="mt-2 min-h-11 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-input)] px-3 text-sm text-[var(--lumeo-paper-50)] placeholder:text-[var(--lumeo-paper-600)]"
            />
          </label>
          <label className="block text-sm font-semibold text-[#F0EAD6]">
            Entity type
            <select
              name="entity_type"
              defaultValue={params.entity_type ?? ""}
              className="mt-2 min-h-11 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-input)] px-3 text-sm"
            >
              <option value="">All</option>
              {entityTypes.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-semibold text-[#F0EAD6]">
            From
            <input
              type="date"
              name="start"
              defaultValue={params.start}
              className="mt-2 min-h-11 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-input)] px-3 text-sm text-[var(--lumeo-paper-50)]"
            />
          </label>
          <label className="block text-sm font-semibold text-[#F0EAD6]">
            To
            <input
              type="date"
              name="end"
              defaultValue={params.end}
              className="mt-2 min-h-11 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-input)] px-3 text-sm text-[var(--lumeo-paper-50)]"
            />
          </label>
          <div className="flex items-end gap-3 md:col-span-4">
            <button type="submit" className="min-h-11 rounded-xl bg-[var(--emerald-600)] px-5 text-sm font-semibold text-[var(--text-on-accent)] transition hover:bg-[var(--emerald-500)]">
              Apply filters
            </button>
            {(params.action || params.entity_type || params.start || params.end) && (
              <Link href="/admin/audit" className="min-h-11 rounded-xl border border-[#E8DFC8]/12 px-5 text-sm font-semibold leading-[2.75rem] text-[#F0EAD6]/70">
                Clear
              </Link>
            )}
          </div>
        </form>
      </AdminSectionCard>

      <AdminSectionCard title="Recent administrative actions" description="Showing 50 records per page. Actor identifiers are resolved to email when the actor is a known administrator.">
        <AdminDataTable
          columns={["Time", "Actor", "Role", "Action", "Entity", "Summary"]}
          rows={logs.data.map((log) => [
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
          empty={<AdminEmptyState title="No audit records" description="Audit records will appear after Control Center actions are performed, or try clearing your filters." />}
        />
        <div className="mt-4 flex gap-3">
          {page > 1 && (
            <Link className="rounded-xl border border-[#E8DFC8]/12 px-4 py-2 text-sm font-semibold" href={`/admin/audit${buildQuery({ ...carryParams, page: String(page - 1) })}`}>
              Previous
            </Link>
          )}
          {logs.data.length === 50 && (
            <Link className="rounded-xl border border-[#E8DFC8]/12 px-4 py-2 text-sm font-semibold" href={`/admin/audit${buildQuery({ ...carryParams, page: String(page + 1) })}`}>
              Next
            </Link>
          )}
        </div>
      </AdminSectionCard>
    </div>
  );
}
