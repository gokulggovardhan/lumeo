import Link from "next/link";
import { AdminDataTable } from "@/components/admin/AdminDataTable";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminSectionCard } from "@/components/admin/AdminSectionCard";
import { requireAdmin } from "@/lib/admin/auth";
import { getAuditLogs } from "@/lib/admin/data";
import { canViewAudit } from "@/lib/admin/permissions";

function pageNumber(value: string | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams?: Promise<{ page?: string }>;
}) {
  const admin = await requireAdmin();
  const params = await searchParams;
  const page = pageNumber(params?.page);
  const logs = canViewAudit(admin.role) ? await getAuditLogs(50, (page - 1) * 50) : { data: [], error: null };

  return (
    <div className="space-y-7">
      <AdminPageHeader
        eyebrow="Record of change"
        title="Audit Log"
        description="Read-only administrative history. Sensitive raw payloads are not displayed by default."
      />
      <AdminSectionCard title="Recent administrative actions" description="Showing 50 records per page. Actor identifiers are shown only when safely stored.">
        <AdminDataTable
          columns={["Time", "Actor", "Role", "Action", "Entity", "Summary"]}
          rows={logs.data.map((log) => [
            new Date(log.created_at).toLocaleString(),
            log.actor_user_id ?? "Unknown",
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
          empty={<AdminEmptyState title="No audit records" description="Audit records will appear after Control Center actions are performed." />}
        />
        <div className="mt-4 flex gap-3">
          {page > 1 && <Link className="rounded-xl border border-[#E8DFC8]/12 px-4 py-2 text-sm font-semibold" href={`/admin/audit?page=${page - 1}`}>Previous</Link>}
          {logs.data.length === 50 && <Link className="rounded-xl border border-[#E8DFC8]/12 px-4 py-2 text-sm font-semibold" href={`/admin/audit?page=${page + 1}`}>Next</Link>}
        </div>
      </AdminSectionCard>
    </div>
  );
}
