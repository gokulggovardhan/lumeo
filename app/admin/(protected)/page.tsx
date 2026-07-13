import { AdminDataTable } from "@/components/admin/AdminDataTable";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminMetricCard } from "@/components/admin/AdminMetricCard";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminSectionCard } from "@/components/admin/AdminSectionCard";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { requireAdmin } from "@/lib/admin/auth";
import { getOverviewData, getSystemStatus } from "@/lib/admin/data";

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString("en", { dateStyle: "medium", timeStyle: "short" }) : "Unavailable";
}

export default async function AdminPage() {
  const admin = await requireAdmin();
  const [overview, system] = await Promise.all([getOverviewData(), getSystemStatus(admin)]);
  const data = overview.data;

  return (
    <div className="space-y-7">
      <AdminPageHeader
        eyebrow="Operations desk"
        title="Lumeo Control Center"
        description="A calm private workspace for managing Lumeo PDF configuration, catalog readiness, and operational foundations."
        meta={
          <div className="rounded-2xl border border-[#E8DFC8]/10 bg-[#111A2B] p-4 text-sm">
            <p className="text-[#F0EAD6]/52">Signed in</p>
            <p className="mt-1 font-bold text-[#F0EAD6]">{admin.email || "Administrator"}</p>
            <p className="mt-1 text-xs uppercase tracking-[0.16em] text-[#CBA052]/70">{admin.role}</p>
          </div>
        }
      />

      {(overview.error || system.error) && (
        <AdminEmptyState
          title="Some Control Center data is unavailable"
          description="The protected admin shell is working, but one or more database reads could not complete."
        />
      )}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <AdminMetricCard label="Enabled PDF Tools" value={data.enabledTools} detail="Real enabled tools in the catalog." tone="success" />
        <AdminMetricCard label="Active Announcements" value={data.activeAnnouncements} detail="Announcements currently marked active." tone="neutral" />
        <AdminMetricCard label="Enabled Feature Flags" value={data.enabledFeatureFlags} detail="Flags currently enabled in the database." tone="gold" />
        <AdminMetricCard label="Events Today" value={data.analyticsEventsToday} detail="Privacy-preserving analytics events today." tone="neutral" />
      </section>

      <AdminSectionCard title="System readiness" description="Truthful checks from the current request and database foundation.">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <AdminStatusBadge tone={system.data.supabaseReachable ? "success" : "warning"}>Database</AdminStatusBadge>
          <AdminStatusBadge tone={system.data.authenticatedAdmin ? "success" : "warning"}>Authentication</AdminStatusBadge>
          <AdminStatusBadge tone={admin.role ? "success" : "warning"}>Admin membership</AdminStatusBadge>
          <AdminStatusBadge tone="neutral">Analytics schema-ready</AdminStatusBadge>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-[#E8DFC8]/8 bg-[#0C1220]/42 p-4">
            <p className="text-sm font-semibold text-[#F0EAD6]">Platform configuration progress</p>
            <p className="mt-2 text-sm leading-6 text-[#F0EAD6]/56">
              {data.tools.length} catalog tools and {data.homepageSlots.length} homepage slots are readable.
            </p>
          </div>
          <div className="rounded-2xl border border-[#E8DFC8]/8 bg-[#0C1220]/42 p-4">
            <p className="text-sm font-semibold text-[#F0EAD6]">Deployment environment</p>
            <p className="mt-2 text-sm leading-6 text-[#F0EAD6]/56">
              {system.data.deploymentEnvironment} · checked {formatDate(system.data.currentTimestamp)}
            </p>
          </div>
        </div>
      </AdminSectionCard>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <AdminSectionCard title="Most recent administrative actions" description="Latest audit records, when administrators begin making changes.">
          <AdminDataTable
            columns={["Time", "Action", "Summary"]}
            rows={data.recentAuditLogs.map((log) => [
              formatDate(log.created_at),
              log.action,
              log.summary,
            ])}
            empty={
              <AdminEmptyState
                title="No audit actions yet"
                description="Audit records will appear after Control Center actions are used."
              />
            }
          />
        </AdminSectionCard>

        <AdminSectionCard title="Analytics foundation" description="No fake charts. Real events will appear when collection is enabled.">
          <div className="rounded-[1.2rem] border border-dashed border-[#CBA052]/20 bg-[#0C1220]/42 p-6">
            <p className="text-sm font-semibold text-[#F0EAD6]">Analytics will appear after privacy-preserving event collection is enabled.</p>
            <p className="mt-3 text-sm leading-6 text-[#F0EAD6]/54">
              Current success rate: {data.processingSuccessRate === null ? "Unavailable" : `${data.processingSuccessRate}%`}
            </p>
          </div>
        </AdminSectionCard>
      </div>

      <AdminSectionCard title="Homepage slot status" description="Five configurable slots plus one permanent All PDF Tools card.">
        <div className="grid gap-3 md:grid-cols-3">
          {data.homepageSlots.map((slot) => (
            <div key={slot.slot_number} className="rounded-2xl border border-[#E8DFC8]/8 bg-[#0C1220]/42 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#CBA052]/70">Slot {slot.slot_number}</p>
              <p className="mt-2 text-sm font-semibold text-[#F0EAD6]">{slot.tool?.name ?? "Unassigned"}</p>
            </div>
          ))}
          <div className="rounded-2xl border border-[#1E6B4A]/35 bg-[#1E6B4A]/10 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#CBA052]/70">Permanent</p>
            <p className="mt-2 text-sm font-semibold text-[#F0EAD6]">All PDF Tools</p>
          </div>
        </div>
      </AdminSectionCard>
    </div>
  );
}
