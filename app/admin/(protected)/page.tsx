import Link from "next/link";
import { AdminDataTable } from "@/components/admin/AdminDataTable";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminMetricCard } from "@/components/admin/AdminMetricCard";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminSectionCard } from "@/components/admin/AdminSectionCard";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { requireAdmin } from "@/lib/admin/auth";
import { getOverviewData, getSystemStatus } from "@/lib/admin/data";

function MetricLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="block rounded-[var(--radius-xl)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--lumeo-aura-rgb),0.2)]">
      {children}
    </Link>
  );
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString("en", { dateStyle: "medium", timeStyle: "short" }) : "Unavailable";
}

export default async function AdminPage() {
  const admin = await requireAdmin();
  const [overview, system] = await Promise.all([getOverviewData(), getSystemStatus(admin)]);
  const data = overview.data;
  const analyticsUnavailable = data.analyticsDataStatus === "unavailable";

  return (
    <div className="space-y-7">
      <AdminPageHeader
        eyebrow="Operations desk"
        title="Lumeo Control Center"
        description="A calm private workspace for managing Lumeo PDF configuration, catalog readiness, and operational foundations."
        meta={
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4 text-sm">
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
        <MetricLink href="/admin/tools">
          <AdminMetricCard label="Enabled PDF Tools" value={data.enabledTools} detail="Real enabled tools in the catalog." tone="success" />
        </MetricLink>
        <MetricLink href="/admin/announcements">
          <AdminMetricCard label="Active Announcements" value={data.activeAnnouncements} detail="Announcements currently marked active." tone="neutral" />
        </MetricLink>
        <MetricLink href="/admin/feature-flags">
          <AdminMetricCard label="Enabled Feature Flags" value={data.enabledFeatureFlags} detail="Flags currently enabled in the database." tone="gold" />
        </MetricLink>
        <MetricLink href="/admin/analytics">
          <AdminMetricCard label="Events Today" value={analyticsUnavailable ? "Unavailable" : data.analyticsEventsToday} detail="Privacy-preserving analytics events today." tone={analyticsUnavailable ? "warning" : "neutral"} />
        </MetricLink>
      </section>
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricLink href="/admin/analytics">
          <AdminMetricCard label="Public Page Views" value={analyticsUnavailable ? "Unavailable" : data.analyticsPageViewsToday} detail="Public page-view events today." tone={analyticsUnavailable ? "warning" : "neutral"} />
        </MetricLink>
        <MetricLink href="/admin/analytics">
          <AdminMetricCard label="Most Opened Tool" value={analyticsUnavailable ? "Unavailable" : data.mostUsedTool ?? "N/A"} detail="Based on tool-open events." tone={analyticsUnavailable ? "warning" : "neutral"} />
        </MetricLink>
        <MetricLink href="/admin/settings">
          <AdminMetricCard label="Analytics Status" value={system.data.adminAnalyticsRpcStatus === "unavailable" ? "Read unavailable" : system.data.analyticsEnabled ? "Enabled" : "Disabled"} detail="Controlled by public_analytics_enabled." tone={system.data.adminAnalyticsRpcStatus === "unavailable" ? "warning" : system.data.analyticsEnabled ? "success" : "neutral"} />
        </MetricLink>
        <MetricLink href="/admin/analytics">
          <AdminMetricCard label="Tool Opens Today" value={analyticsUnavailable ? "Unavailable" : data.analyticsToolOpensToday} detail="PDF tool workspaces opened today." tone={analyticsUnavailable ? "warning" : "gold"} />
        </MetricLink>
      </section>

      <AdminSectionCard title="System readiness" description="Truthful checks from the current request and database foundation.">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <AdminStatusBadge tone={system.data.supabaseReachable ? "success" : "warning"}>Database</AdminStatusBadge>
          <AdminStatusBadge tone={system.data.authenticatedAdmin ? "success" : "warning"}>Authentication</AdminStatusBadge>
          <AdminStatusBadge tone={admin.role ? "success" : "warning"}>Admin membership</AdminStatusBadge>
          <AdminStatusBadge tone={system.data.analyticsEnabled ? "success" : "neutral"}>Analytics {system.data.analyticsEnabled ? "enabled" : "disabled"}</AdminStatusBadge>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-4">
            <p className="text-sm font-semibold text-[#F0EAD6]">Platform configuration progress</p>
            <p className="mt-2 text-sm leading-6 text-[#F0EAD6]/56">
              {data.tools.length} catalog tools and {data.homepageSlots.length} homepage slots are readable.
            </p>
          </div>
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-4">
            <p className="text-sm font-semibold text-[#F0EAD6]">Deployment environment</p>
            <p className="mt-2 text-sm leading-6 text-[#F0EAD6]/56">
              {system.data.deploymentEnvironment} · checked {formatDate(system.data.currentTimestamp)}
            </p>
          </div>
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-4">
            <p className="text-sm font-semibold text-[#F0EAD6]">Latest admin action</p>
            <p className="mt-2 text-sm leading-6 text-[#F0EAD6]/56">{formatDate(system.data.latestAuditAt)}</p>
          </div>
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-4">
            <p className="text-sm font-semibold text-[#F0EAD6]">Latest analytics event</p>
            <p className="mt-2 text-sm leading-6 text-[#F0EAD6]/56">{formatDate(system.data.latestAnalyticsEventAt)}</p>
          </div>
        </div>
      </AdminSectionCard>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <AdminSectionCard
          title="Most recent administrative actions"
          description="Latest audit records, when administrators begin making changes."
          action={<Link href="/admin/audit" className="text-sm font-semibold text-[var(--text-accent)] hover:underline">View all</Link>}
        >
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

        <AdminSectionCard title="Analytics V1" description="Discovery analytics only. No fake charts or lifecycle placeholders.">
          <div className="rounded-[1.2rem] border border-dashed border-[#CBA052]/20 bg-[var(--surface-elevated)] p-6">
            <p className="text-sm font-semibold text-[#F0EAD6]">Analytics V1 measures public page visits, tool discovery, and coarse platform usage.</p>
            <p className="mt-3 text-sm leading-6 text-[#F0EAD6]/54">
              Processing lifecycle analytics will be added later through the shared browser-tool framework so every current and future PDF tool reports events consistently.
            </p>
          </div>
        </AdminSectionCard>
      </div>

      <AdminSectionCard
        title="Homepage slot status"
        description="Five configurable slots plus one permanent All PDF Tools card."
        action={<Link href="/admin/homepage" className="text-sm font-semibold text-[var(--text-accent)] hover:underline">Manage slots</Link>}
      >
        <div className="grid gap-3 md:grid-cols-3">
          {data.homepageSlots.map((slot) => (
            <div key={slot.slot_number} className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-4">
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
