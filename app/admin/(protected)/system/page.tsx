import { AdminDataTable } from "@/components/admin/AdminDataTable";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminSectionCard } from "@/components/admin/AdminSectionCard";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { requireAdmin } from "@/lib/admin/auth";
import { getSystemStatus } from "@/lib/admin/data";

export default async function SystemPage() {
  const admin = await requireAdmin();
  const status = await getSystemStatus(admin);
  const checks = [
    ["App environment", status.data.deploymentEnvironment],
    ["Supabase configuration", status.data.supabaseConfigured ? "Configured" : "Missing"],
    ["Database query", status.data.supabaseReachable ? "Reachable" : "Unavailable"],
    ["Authenticated admin", status.data.authenticatedAdmin ? "Verified" : "Unavailable"],
    ["Active role", status.data.activeRole ?? "Unavailable"],
    ["Analytics schema", status.data.analyticsCollectionStatus],
    ["Tool catalog count", status.data.toolCatalogCount],
    ["Homepage slot count", status.data.homepageSlotCount],
    ["Latest audit", status.data.latestAuditAt ?? "None"],
    ["Latest analytics", status.data.latestAnalyticsEventAt ?? "None"],
  ];

  return (
    <div className="space-y-7">
      <AdminPageHeader
        eyebrow="Operational status"
        title="System"
        description="Truthful configuration checks only. No fake uptime, infrastructure identifiers, or secret values."
        meta={<AdminStatusBadge tone={status.data.supabaseReachable ? "success" : "warning"}>{status.data.supabaseReachable ? "Ready" : "Check database"}</AdminStatusBadge>}
      />
      <AdminSectionCard title="System checks" description={`Checked at ${new Date(status.data.currentTimestamp).toLocaleString()}.`}>
        <AdminDataTable columns={["Check", "Result"]} rows={checks.map(([label, value]) => [label, String(value)])} />
      </AdminSectionCard>
    </div>
  );
}
