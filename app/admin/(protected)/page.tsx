import Link from "next/link";
import { AdminDataTable } from "@/components/admin/AdminDataTable";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminMetricCard } from "@/components/admin/AdminMetricCard";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminSectionCard } from "@/components/admin/AdminSectionCard";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { requireAdmin } from "@/lib/admin/auth";
import { getOverviewData, getUnreadInboxCount } from "@/lib/admin/data";
import { getErrorLogSummary } from "@/lib/admin/errors";
import { formatAdminDateTime } from "@/lib/admin/timezone";

function MetricLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="block rounded-[var(--radius-xl)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--lumeo-aura-rgb),0.2)]">
      {children}
    </Link>
  );
}

function formatDate(value: string | null) {
  return value ? formatAdminDateTime(value) : "Unavailable";
}

export default async function AdminPage() {
  const admin = await requireAdmin();
  const [overview, unreadInbox, errorSummary] = await Promise.all([
    getOverviewData(),
    getUnreadInboxCount(),
    getErrorLogSummary(),
  ]);
  const data = overview.data;
  const analyticsUnavailable = data.analyticsDataStatus === "unavailable";
  const deploymentEnvironment = process.env.LUMEO_DEPLOYMENT_ENV ?? "local";
  const gitCommitSha = process.env.LUMEO_BUILD_SHA ?? null;
  const deploymentPlatform =
    deploymentEnvironment === "production" || deploymentEnvironment === "preview"
      ? "Cloudflare Workers"
      : deploymentEnvironment === "ci"
        ? "Cloudflare Worker CI"
        : "Local development";
  const checkedAt = new Date().toISOString();
  const latestAuditAt = data.recentAuditLogs[0]?.created_at ?? null;

  return (
    <div className="space-y-7">
      <AdminPageHeader
        eyebrow="Operations desk"
        title="Lumeo Control Center"
        description="Private operations for live tools, analytics, messages, incidents, SEO, announcements, and owner controls."
        meta={
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4 text-sm">
            <p className="text-[#F0EAD6]/52">Signed in</p>
            <p className="mt-1 font-bold text-[#F0EAD6]">{admin.email || "Administrator"}</p>
            <p className="mt-1 text-xs uppercase tracking-[0.16em] text-[#CBA052]/70">{admin.role}</p>
          </div>
        }
      />

      {(overview.error || unreadInbox.error || errorSummary.error) && (
        <AdminEmptyState
          title="Some Control Center data is unavailable"
          description="The protected admin shell is working, but one or more database reads could not complete."
        />
      )}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricLink href="/admin/tools">
          <AdminMetricCard label="Enabled Tools" value={data.enabledTools} detail="Real enabled tools in the catalog." tone="success" />
        </MetricLink>
        <MetricLink href="/admin/announcements">
          <AdminMetricCard label="Active Announcements" value={data.activeAnnouncements} detail="Announcements currently marked active." tone="neutral" />
        </MetricLink>
        <MetricLink href="/admin/tools">
          <AdminMetricCard label="Maintenance Tools" value={data.maintenanceTools} detail="Tools intentionally unavailable for maintenance." tone={data.maintenanceTools > 0 ? "warning" : "success"} />
        </MetricLink>
        <MetricLink href="/admin/analytics">
          <AdminMetricCard label="Events Today" value={analyticsUnavailable ? "Unavailable" : data.analyticsEventsToday} detail="Privacy-preserving analytics events today." tone={analyticsUnavailable ? "warning" : "neutral"} />
        </MetricLink>
      </section>
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <MetricLink href="/admin/analytics">
          <AdminMetricCard label="Public Page Views" value={analyticsUnavailable ? "Unavailable" : data.analyticsPageViewsToday} detail="Public page-view events today." tone={analyticsUnavailable ? "warning" : "neutral"} />
        </MetricLink>
        <MetricLink href="/admin/analytics">
          <AdminMetricCard label="Most Opened Tool" value={analyticsUnavailable ? "Unavailable" : data.mostUsedTool ?? "N/A"} detail="Based on tool-open events." tone={analyticsUnavailable ? "warning" : "neutral"} />
        </MetricLink>
        <MetricLink href="/admin/errors">
          <AdminMetricCard
            label="Open Errors"
            value={errorSummary.error ? "Unavailable" : errorSummary.data.openCount}
            detail={errorSummary.error ? "Error monitoring could not be verified." : errorSummary.data.criticalOpenCount > 0 ? `${errorSummary.data.criticalOpenCount} critical error${errorSummary.data.criticalOpenCount === 1 ? "" : "s"} need attention.` : "Unresolved application errors."}
            tone={errorSummary.error ? "warning" : errorSummary.data.criticalOpenCount > 0 ? "danger" : errorSummary.data.openCount > 0 ? "warning" : "success"}
          />
        </MetricLink>
        <MetricLink href="/admin/analytics">
          <AdminMetricCard label="Tool Opens Today" value={analyticsUnavailable ? "Unavailable" : data.analyticsToolOpensToday} detail="PDF tool workspaces opened today." tone={analyticsUnavailable ? "warning" : "gold"} />
        </MetricLink>
        <MetricLink href="/admin/inbox">
          <AdminMetricCard label="Unread Messages" value={unreadInbox.data} detail="Inbox queries and feedback awaiting a first read." tone={unreadInbox.data > 0 ? "warning" : "success"} />
        </MetricLink>
      </section>

      <AdminSectionCard title="System readiness" description="Truthful checks from the current request and database foundation.">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <AdminStatusBadge tone={data.databaseReachable ? "success" : "warning"}>Database</AdminStatusBadge>
          <AdminStatusBadge tone={(admin.authenticated && admin.authorized) ? "success" : "warning"}>Authentication</AdminStatusBadge>
          <AdminStatusBadge tone={admin.role ? "success" : "warning"}>Admin membership</AdminStatusBadge>
          <AdminStatusBadge tone={data.analyticsEnabled ? "success" : "neutral"}>Analytics {data.analyticsEnabled ? "enabled" : "disabled"}</AdminStatusBadge>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-4">
            <p className="text-sm font-semibold text-[#F0EAD6]">Runtime / revision</p>
            <p className="mt-2 text-sm leading-6 text-[#F0EAD6]/56">
              {deploymentPlatform} · {gitCommitSha ? gitCommitSha.slice(0, 12) : "revision unavailable"}
            </p>
          </div>
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-4">
            <p className="text-sm font-semibold text-[#F0EAD6]">Deployment environment</p>
            <p className="mt-2 text-sm leading-6 text-[#F0EAD6]/56">
              {deploymentEnvironment} · checked {formatDate(checkedAt)}
            </p>
          </div>
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-4">
            <p className="text-sm font-semibold text-[#F0EAD6]">Latest admin action</p>
            <p className="mt-2 text-sm leading-6 text-[#F0EAD6]/56">{formatDate(latestAuditAt)}</p>
          </div>
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-4">
            <p className="text-sm font-semibold text-[#F0EAD6]">Latest analytics event</p>
            <p className="mt-2 text-sm leading-6 text-[#F0EAD6]/56">{formatDate(data.latestAnalyticsEventAt)}</p>
          </div>
        </div>
      </AdminSectionCard>

      <AdminSectionCard
        title="Most recent administrative actions"
        description="Latest audit records for meaningful Control Center changes."
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
    </div>
  );
}
