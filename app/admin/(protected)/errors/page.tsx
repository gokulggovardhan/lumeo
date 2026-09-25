import Link from "next/link";
import { AdminDataTable } from "@/components/admin/AdminDataTable";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminMetricCard } from "@/components/admin/AdminMetricCard";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminSectionCard } from "@/components/admin/AdminSectionCard";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { AdminSubmitButton } from "@/components/admin/AdminSubmitButton";
import { requireAdmin } from "@/lib/admin/auth";
import { sanitizeErrorDiagnostic } from "@/lib/admin/error-display";
import { getErrorLogPage, getErrorLogSummary } from "@/lib/admin/errors";
import { asAdminFormAction } from "@/lib/admin/form-action";
import { ignoreErrorLog, reopenErrorLog, resolveErrorLog } from "@/app/admin/(protected)/errors/actions";
import { pageNumber } from "@/lib/admin/pagination";
import { canManageErrors, canViewErrors } from "@/lib/admin/permissions";
import { formatAdminDateTime } from "@/lib/admin/timezone";
import type { ErrorSeverity, ErrorSource, ErrorStatus } from "@/lib/supabase/database.types";

const PAGE_SIZE = 50;
const statuses: ErrorStatus[] = ["open", "resolved", "ignored"];
const severities: ErrorSeverity[] = ["low", "medium", "high", "critical"];
const sources: ErrorSource[] = ["client", "server_action", "route_handler", "error_boundary", "unhandled_rejection"];
const sorts = ["recent", "oldest", "occurrences"] as const;

const severityTone: Record<ErrorSeverity, "success" | "warning" | "danger" | "neutral"> = {
  low: "neutral",
  medium: "warning",
  high: "danger",
  critical: "danger",
};

const statusTone: Record<ErrorStatus, "success" | "warning" | "danger" | "neutral"> = {
  open: "warning",
  resolved: "success",
  ignored: "neutral",
};

function buildQuery(params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

export default async function ErrorsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    page?: string;
    status?: string;
    severity?: string;
    source?: string;
    search?: string;
    route?: string;
    sort?: string;
  }>;
}) {
  const admin = await requireAdmin();
  const params = (await searchParams) ?? {};

  if (!canViewErrors(admin.role)) {
    return (
      <div className="space-y-7">
        <AdminPageHeader eyebrow="Operations" title="Errors" description="Client and server error monitoring." />
        <AdminEmptyState title="No access" description="Your role does not have permission to view this page." />
      </div>
    );
  }

  const canManage = canManageErrors(admin.role);
  const page = pageNumber(params.page);
  const status = statuses.includes(params.status as ErrorStatus) ? (params.status as ErrorStatus) : undefined;
  const severity = severities.includes(params.severity as ErrorSeverity) ? (params.severity as ErrorSeverity) : undefined;
  const source = sources.includes(params.source as ErrorSource) ? (params.source as ErrorSource) : undefined;
  const search = params.search?.trim().slice(0, 120) || undefined;
  const route = params.route?.trim().slice(0, 200) || undefined;
  const sort = sorts.includes(params.sort as (typeof sorts)[number])
    ? (params.sort as (typeof sorts)[number])
    : "recent";

  const [summary, logs] = await Promise.all([
    getErrorLogSummary(),
    getErrorLogPage(PAGE_SIZE, (page - 1) * PAGE_SIZE, { status, severity, source, search, route, sort }),
  ]);

  if (summary.error || logs.error) {
    return (
      <div className="space-y-7">
        <AdminPageHeader
          eyebrow="Operations"
          title="Errors"
          description="Client and server error monitoring."
        />
        <AdminEmptyState
          title="Error monitoring data is unavailable"
          description="Error counts or log rows could not be verified. No zero-state metrics are shown until the data service recovers."
        />
      </div>
    );
  }

  const carryParams = {
    status: params.status,
    severity: params.severity,
    source: params.source,
    search: params.search,
    route: params.route,
    sort: params.sort,
  };
  const pageStart = logs.data.rows.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const pageEnd = logs.data.rows.length === 0 ? 0 : pageStart + logs.data.rows.length - 1;

  return (
    <div className="space-y-7">
      <AdminPageHeader
        eyebrow="Operations"
        title="Errors"
        description="Client and server errors captured across the app, deduplicated by route and message."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AdminMetricCard label="Open" value={summary.data.openCount} detail="Not yet resolved or ignored." tone="warning" />
        <AdminMetricCard label="Critical (open)" value={summary.data.criticalOpenCount} detail="Highest severity, still open." tone="danger" />
        <AdminMetricCard label="Resolved" value={summary.data.resolvedCount} detail="Marked fixed." tone="success" />
        <AdminMetricCard label="Total occurrences" value={summary.data.totalOccurrences} detail="Across all logged errors, all time." tone="neutral" />
      </div>

      <AdminSectionCard title="Filters" description="Narrow verified error records without exposing raw diagnostics.">
        <form method="get" className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="block text-sm font-semibold text-[#F0EAD6]">
            Message contains
            <input
              type="text"
              name="search"
              defaultValue={params.search}
              placeholder="e.g. Failed to fetch"
              className="mt-2 min-h-11 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-input)] px-3 text-base text-[var(--lumeo-paper-50)] placeholder:text-[var(--lumeo-paper-600)] sm:text-sm"
            />
          </label>
          <label className="block text-sm font-semibold text-[#F0EAD6]">
            Route contains
            <input
              type="text"
              name="route"
              defaultValue={params.route}
              placeholder="e.g. /pdf/merge"
              className="mt-2 min-h-11 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-input)] px-3 text-base text-[var(--lumeo-paper-50)] placeholder:text-[var(--lumeo-paper-600)] sm:text-sm"
            />
          </label>
          <label className="block text-sm font-semibold text-[#F0EAD6]">
            Status
            <select
              name="status"
              defaultValue={params.status ?? ""}
              className="mt-2 min-h-11 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-input)] px-3 text-base sm:text-sm"
            >
              <option value="">All</option>
              {statuses.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-semibold text-[#F0EAD6]">
            Severity
            <select
              name="severity"
              defaultValue={params.severity ?? ""}
              className="mt-2 min-h-11 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-input)] px-3 text-sm"
            >
              <option value="">All</option>
              {severities.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-semibold text-[#F0EAD6]">
            Source
            <select
              name="source"
              defaultValue={params.source ?? ""}
              className="mt-2 min-h-11 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-input)] px-3 text-base sm:text-sm"
            >
              <option value="">All</option>
              {sources.map((value) => (
                <option key={value} value={value}>{value.replaceAll("_", " ")}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-semibold text-[#F0EAD6]">
            Order
            <select
              name="sort"
              defaultValue={sort}
              className="mt-2 min-h-11 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-input)] px-3 text-base sm:text-sm"
            >
              <option value="recent">Newest activity</option>
              <option value="occurrences">Most occurrences</option>
              <option value="oldest">Oldest activity</option>
            </select>
          </label>
          <div className="flex items-end gap-3">
            <button type="submit" className="min-h-11 rounded-xl bg-[var(--emerald-600)] px-5 text-sm font-semibold text-[var(--text-on-accent)] transition hover:bg-[var(--emerald-500)]">
              Apply filters
            </button>
            {(params.status || params.severity || params.source || params.search || params.route || params.sort) && (
              <Link href="/admin/errors" className="min-h-11 rounded-xl border border-[#E8DFC8]/12 px-5 text-sm font-semibold leading-[2.75rem] text-[#F0EAD6]/70">
                Clear
              </Link>
            )}
          </div>
        </form>
      </AdminSectionCard>

      <AdminSectionCard title="Error log" description={`Showing ${pageStart}–${pageEnd} of ${logs.data.total} matching records.`}>
        <AdminDataTable
          columns={["Severity", "Message", "Route", "Occurrences", "First seen (IST)", "Last seen (IST)", "Status", canManage ? "Actions" : "" ].filter(Boolean)}
          rows={logs.data.rows.map((log) => {
            const safeMessage = sanitizeErrorDiagnostic(log.message, 2000) ?? "Unknown error";
            const safeStack = sanitizeErrorDiagnostic(log.stack, 4000);
            const cells: React.ReactNode[] = [
              <AdminStatusBadge key="severity" tone={severityTone[log.severity]}>{log.severity}</AdminStatusBadge>,
              <details key="message" className="max-w-md">
                <summary className="cursor-pointer font-semibold text-[#F0EAD6]">{safeMessage}</summary>
                {safeStack && (
                  <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-[rgba(8,16,29,0.58)] p-3 text-xs leading-5 text-[#F0EAD6]/60">
                    <code>{safeStack}</code>
                  </pre>
                )}
                <p className="mt-2 text-xs leading-5 text-[#F0EAD6]/50">
                  {log.source} · {log.browser_family ?? "Unknown browser"} · {log.operating_system ?? "Unknown OS"} · {log.device_class ?? "Unknown device"}
                </p>
              </details>,
              log.route ?? "—",
              log.occurrence_count,
              formatAdminDateTime(log.first_seen_at),
              formatAdminDateTime(log.last_seen_at),
              <AdminStatusBadge key="status" tone={statusTone[log.status]}>{log.status}</AdminStatusBadge>,
            ];

            if (canManage) {
              cells.push(
                <div key="actions" className="flex flex-wrap gap-2">
                  {log.status !== "resolved" && (
                    <form action={asAdminFormAction(resolveErrorLog)}>
                      <input type="hidden" name="id" value={log.id} />
                      <AdminSubmitButton variant="primary" pendingLabel="...">Resolve</AdminSubmitButton>
                    </form>
                  )}
                  {log.status !== "ignored" && (
                    <form action={asAdminFormAction(ignoreErrorLog)}>
                      <input type="hidden" name="id" value={log.id} />
                      <AdminSubmitButton variant="secondary" pendingLabel="...">Ignore</AdminSubmitButton>
                    </form>
                  )}
                  {log.status !== "open" && (
                    <form action={asAdminFormAction(reopenErrorLog)}>
                      <input type="hidden" name="id" value={log.id} />
                      <AdminSubmitButton variant="secondary" pendingLabel="...">Reopen</AdminSubmitButton>
                    </form>
                  )}
                </div>,
              );
            }

            return cells;
          })}
          empty={<AdminEmptyState title="No errors logged" description="Errors will appear here as they're captured across the app, or try clearing your filters." />}
        />
        <div className="mt-4 flex gap-3">
          {page > 1 && (
            <Link className="rounded-xl border border-[#E8DFC8]/12 px-4 py-2 text-sm font-semibold" href={`/admin/errors${buildQuery({ ...carryParams, page: String(page - 1) })}`}>
              Previous
            </Link>
          )}
          {page * PAGE_SIZE < logs.data.total && (
            <Link className="rounded-xl border border-[#E8DFC8]/12 px-4 py-2 text-sm font-semibold" href={`/admin/errors${buildQuery({ ...carryParams, page: String(page + 1) })}`}>
              Next
            </Link>
          )}
        </div>
      </AdminSectionCard>
    </div>
  );
}
