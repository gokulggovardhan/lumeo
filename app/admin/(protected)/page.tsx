import Link from "next/link";
import { AdminDataTable } from "@/components/admin/AdminDataTable";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminMetricCard } from "@/components/admin/AdminMetricCard";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminSectionCard } from "@/components/admin/AdminSectionCard";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { AnalyticsTrendChart } from "@/components/admin/analytics/AnalyticsTrendChart";
import { requireAdmin } from "@/lib/admin/auth";
import {
  getAnalyticsSummary,
  getAuditLogs,
  getFeedbackQueries,
  getPdfTools,
  getSiteSettings,
  getUnreadInboxCount,
} from "@/lib/admin/data";
import { getErrorLogSummary, getErrorLogs } from "@/lib/admin/errors";
import { formatAdminDateTime } from "@/lib/admin/timezone";

function formatDate(value: string | null) {
  return value ? formatAdminDateTime(value) : "Unavailable";
}

function settingEnabled(value: unknown) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      "enabled" in value &&
      (value as { enabled?: unknown }).enabled === true,
  );
}

function StatusRow({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: "success" | "warning" | "danger" | "neutral" | "gold";
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-[var(--border-hairline)] py-3 last:border-0">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[var(--text-primary)]">{label}</p>
        <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">{detail}</p>
      </div>
      <AdminStatusBadge tone={tone}>{value}</AdminStatusBadge>
    </div>
  );
}

export default async function AdminPage() {
  const admin = await requireAdmin();
  const [
    tools,
    analytics,
    unreadInbox,
    inbox,
    errorSummary,
    recentErrors,
    audit,
    settings,
  ] = await Promise.all([
    getPdfTools(),
    getAnalyticsSummary(),
    getUnreadInboxCount(),
    getFeedbackQueries(5, 0),
    getErrorLogSummary(),
    getErrorLogs(5, 0, { status: "open" }),
    getAuditLogs(5),
    getSiteSettings(),
  ]);

  const deploymentEnvironment = process.env.LUMEO_DEPLOYMENT_ENV ?? "local";
  const gitCommitSha = process.env.LUMEO_BUILD_SHA ?? null;
  const analyticsUnavailable =
    Boolean(analytics.error) || analytics.data.dataStatus === "unavailable";
  const maintenanceTools = tools.data.filter((tool) => tool.status === "maintenance");
  const disabledTools = tools.data.filter((tool) => !tool.is_enabled);
  const maintenanceSetting = settings.data.find((setting) => setting.key === "maintenance_mode");
  const analyticsSetting = settings.data.find((setting) => setting.key === "public_analytics_enabled");
  const maintenanceMode = settingEnabled(maintenanceSetting?.value);
  const analyticsEnabled = settingEnabled(analyticsSetting?.value);
  const toolBySlug = new Map(tools.data.map((tool) => [tool.slug, tool]));

  const attention: Array<{
    title: string;
    detail: string;
    href: string;
    tone: "warning" | "danger" | "neutral";
  }> = [];

  if (maintenanceMode) {
    attention.push({
      title: "Global maintenance mode is enabled",
      detail: "Public visitors are seeing the maintenance experience.",
      href: "/admin/settings",
      tone: "danger",
    });
  }
  if (!errorSummary.error && errorSummary.data.criticalOpenCount > 0) {
    attention.push({
      title: `${errorSummary.data.criticalOpenCount} critical error${errorSummary.data.criticalOpenCount === 1 ? "" : "s"} unresolved`,
      detail: "Review the highest-severity application errors.",
      href: "/admin/errors?status=open&severity=critical",
      tone: "danger",
    });
  } else if (!errorSummary.error && errorSummary.data.openCount > 0) {
    attention.push({
      title: `${errorSummary.data.openCount} open error${errorSummary.data.openCount === 1 ? "" : "s"}`,
      detail: "Review unresolved application errors.",
      href: "/admin/errors?status=open",
      tone: "warning",
    });
  }
  if (unreadInbox.data > 0) {
    attention.push({
      title: `${unreadInbox.data} unread Inbox message${unreadInbox.data === 1 ? "" : "s"}`,
      detail: "Feedback or enquiries are waiting for a first read.",
      href: "/admin/inbox",
      tone: "warning",
    });
  }
  if (maintenanceTools.length > 0) {
    attention.push({
      title: `${maintenanceTools.length} tool${maintenanceTools.length === 1 ? "" : "s"} in maintenance`,
      detail: maintenanceTools.slice(0, 3).map((tool) => tool.name).join(", "),
      href: "/admin/tools",
      tone: "warning",
    });
  }
  if (analyticsUnavailable) {
    attention.push({
      title: "Analytics data is unavailable",
      detail: "The secure aggregate reader could not return verified metrics.",
      href: "/admin/analytics",
      tone: "warning",
    });
  }
  if (tools.error || settings.error || inbox.error || errorSummary.error || recentErrors.error || audit.error) {
    attention.push({
      title: "Some Admin data could not be verified",
      detail: "One or more protected database reads are unavailable.",
      href: "/admin/health",
      tone: "warning",
    });
  }

  const processingTotal = analytics.data.processingSucceeded + analytics.data.processingFailed;
  const topTools = analytics.data.topToolsByOpens.slice(0, 5);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Admin Console V2"
        title="Dashboard"
        description="A concise operational view of Lumeo health, usage, tool state, messages, errors, and recent administrative change."
        meta={
          <div className="rounded-xl border border-[var(--border-hairline)] bg-[rgba(var(--lumeo-paper-rgb),0.025)] px-3 py-2 text-right">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-subtle)]">Current revision</p>
            <p className="mt-1 font-mono text-xs text-[var(--text-secondary)]">
              {gitCommitSha ? gitCommitSha.slice(0, 12) : "Unavailable"}
            </p>
          </div>
        }
      />

      <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <AdminSectionCard
          title="Platform status"
          description="Verified from the current authenticated request, database-backed Admin reads, analytics aggregate, and Cloudflare runtime metadata."
        >
          <StatusRow
            label="Database"
            value={tools.error ? "Unavailable" : "Operational"}
            detail={tools.error ? "The tool catalog query could not be verified." : "Supabase-backed Admin reads are responding."}
            tone={tools.error ? "danger" : "success"}
          />
          <StatusRow
            label="Authentication"
            value="Authorized"
            detail={`${admin.role} access verified server-side through the active Admin membership.`}
            tone="success"
          />
          <StatusRow
            label="Analytics"
            value={analyticsUnavailable ? "Unavailable" : analyticsEnabled ? "Enabled" : "Disabled"}
            detail={analyticsUnavailable ? "Verified aggregates are not available." : analyticsEnabled ? "Privacy-preserving public analytics is enabled." : "Collection is intentionally disabled by the owner setting."}
            tone={analyticsUnavailable ? "warning" : analyticsEnabled ? "success" : "neutral"}
          />
          <StatusRow
            label="Runtime"
            value={deploymentEnvironment === "production" ? "Production" : deploymentEnvironment}
            detail={`Cloudflare runtime · ${gitCommitSha ? `revision ${gitCommitSha.slice(0, 12)}` : "revision unavailable"}`}
            tone={deploymentEnvironment === "production" ? "success" : "gold"}
          />
          <div className="mt-4 text-right">
            <Link href="/admin/health" className="text-xs font-semibold text-[var(--text-accent)] hover:underline">
              Open detailed Health →
            </Link>
          </div>
        </AdminSectionCard>

        <AdminSectionCard
          title="Requires attention"
          description="Only conditions backed by current Admin data are shown here."
        >
          {attention.length === 0 ? (
            <div className="rounded-xl border border-[rgba(var(--lumeo-seal-rgb),0.25)] bg-[rgba(var(--lumeo-seal-rgb),0.07)] p-4">
              <p className="text-sm font-semibold text-[var(--text-primary)]">Nothing needs immediate attention</p>
              <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">
                No critical errors, unread Inbox messages, maintenance tools, global maintenance mode, or unavailable core data were detected.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {attention.map((item) => (
                <Link
                  key={`${item.href}-${item.title}`}
                  href={item.href}
                  className="block rounded-xl border border-[var(--border-hairline)] bg-[rgba(var(--lumeo-paper-rgb),0.025)] p-3 transition hover:border-[var(--border-premium)] hover:bg-[rgba(var(--lumeo-paper-rgb),0.04)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[var(--text-primary)]">{item.title}</p>
                      <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">{item.detail}</p>
                    </div>
                    <AdminStatusBadge tone={item.tone}>{item.tone === "danger" ? "Critical" : "Review"}</AdminStatusBadge>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </AdminSectionCard>
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[var(--text-primary)]">Important metrics</p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">Today · verified analytics only.</p>
          </div>
          <Link href="/admin/analytics" className="text-xs font-semibold text-[var(--text-accent)] hover:underline">
            Analytics →
          </Link>
        </div>
        {analyticsUnavailable ? (
          <AdminEmptyState
            title="Analytics metrics are unavailable"
            description="The dashboard will not substitute zeros for a failed analytics aggregate."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <AdminMetricCard label="Page Views" value={analytics.data.pageViewsToday} detail="Public page-view events today." />
            <AdminMetricCard label="Tool Opens" value={analytics.data.toolOpens} detail="PDF tool workspaces opened today." tone="gold" />
            <AdminMetricCard
              label="Processing Success"
              value={analytics.data.successRate === null ? "N/A" : `${analytics.data.successRate}%`}
              detail={processingTotal > 0 ? `${processingTotal} completed processing outcomes.` : "No completed processing outcomes today."}
              tone={analytics.data.successRate !== null && analytics.data.successRate < 90 ? "warning" : "success"}
            />
            <AdminMetricCard label="Downloads" value={analytics.data.downloadsStarted} detail="Output downloads started today." />
          </div>
        )}
      </section>

      {!analyticsUnavailable ? (
        <section className="grid min-w-0 gap-4 xl:grid-cols-[1.4fr_0.6fr]">
          <AnalyticsTrendChart points={analytics.data.sevenDayTotals} rangeLabel="Last 7 days" />

          <AdminSectionCard
            title="Processing health"
            description="Today’s real processing lifecycle signals."
          >
            <div className="space-y-1">
              <StatusRow label="Started" value={String(analytics.data.processingStarted)} detail="Processing operations started." tone="neutral" />
              <StatusRow label="Succeeded" value={String(analytics.data.processingSucceeded)} detail="Processing operations completed successfully." tone="success" />
              <StatusRow label="Failed" value={String(analytics.data.processingFailed)} detail="Processing operations reporting failure." tone={analytics.data.processingFailed > 0 ? "warning" : "neutral"} />
              <StatusRow
                label="Average duration"
                value={analytics.data.averageDurationMs === null ? "N/A" : `${(analytics.data.averageDurationMs / 1000).toFixed(1)}s`}
                detail="Average duration of successful processing."
                tone="gold"
              />
            </div>
          </AdminSectionCard>
        </section>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-2">
        <AdminSectionCard
          title="Tool activity"
          description="Most-opened tools today, mapped to the current catalog state."
          action={<Link href="/admin/tools" className="text-xs font-semibold text-[var(--text-accent)] hover:underline">Manage tools →</Link>}
        >
          {topTools.length === 0 ? (
            <AdminEmptyState title="No tool activity yet" description="No tool-open events have been recorded today." />
          ) : (
            <div className="space-y-1">
              {topTools.map((item, index) => {
                const tool = toolBySlug.get(item.toolSlug);
                const unavailable = !tool || !tool.is_enabled || tool.status === "maintenance";
                return (
                  <div key={item.toolSlug} className="flex items-center gap-3 border-b border-[var(--border-hairline)] py-3 last:border-0">
                    <span className="w-5 font-mono text-xs text-[var(--text-subtle)]">{String(index + 1).padStart(2, "0")}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{tool?.name ?? item.toolSlug}</p>
                      <p className="mt-0.5 truncate text-xs text-[var(--text-muted)]">{tool?.route ?? item.toolSlug}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold tabular-nums text-[var(--text-primary)]">{item.count}</p>
                      <AdminStatusBadge tone={unavailable ? "warning" : "success"}>
                        {tool?.status ?? "Unknown"}
                      </AdminStatusBadge>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </AdminSectionCard>

        <AdminSectionCard
          title="Inbox summary"
          description="Latest feedback and enquiries. Unread state is sourced from the protected Inbox table."
          action={<Link href="/admin/inbox" className="text-xs font-semibold text-[var(--text-accent)] hover:underline">Open Inbox →</Link>}
        >
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <p className="text-3xl font-semibold tracking-[-0.03em] text-[var(--text-primary)]">{unreadInbox.data}</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">Unread messages</p>
            </div>
            <AdminStatusBadge tone={unreadInbox.data > 0 ? "warning" : "success"}>
              {unreadInbox.data > 0 ? "Needs review" : "Caught up"}
            </AdminStatusBadge>
          </div>

          {inbox.error ? (
            <AdminEmptyState title="Inbox preview unavailable" description="The Inbox page remains available, but this preview could not be verified." />
          ) : inbox.data.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">No messages yet.</p>
          ) : (
            <div className="space-y-1">
              {inbox.data.slice(0, 4).map((item) => (
                <div key={item.id} className="flex items-start gap-3 border-t border-[var(--border-hairline)] py-3">
                  <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${item.is_read ? "bg-[var(--text-subtle)]" : "bg-[var(--lumeo-gold-400)]"}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{item.subject || item.type}</p>
                    <p className="mt-0.5 truncate text-xs text-[var(--text-muted)]">{item.name || item.email || "Anonymous"} · {formatDate(item.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </AdminSectionCard>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <AdminSectionCard
          title="Recent errors"
          description="Newest unresolved application errors."
          action={<Link href="/admin/errors?status=open" className="text-xs font-semibold text-[var(--text-accent)] hover:underline">View errors →</Link>}
        >
          {recentErrors.error ? (
            <AdminEmptyState title="Error preview unavailable" description="Error monitoring could not be verified for this preview." />
          ) : (
            <AdminDataTable
              columns={["Severity", "Message", "Occurrences", "Last seen"]}
              rows={recentErrors.data.map((error) => [
                <AdminStatusBadge key="severity" tone={error.severity === "critical" || error.severity === "high" ? "danger" : error.severity === "medium" ? "warning" : "neutral"}>{error.severity}</AdminStatusBadge>,
                <span key="message" className="block max-w-[24rem] truncate font-medium text-[var(--text-primary)]">{error.message}</span>,
                error.occurrence_count,
                formatDate(error.last_seen_at),
              ])}
              empty={<AdminEmptyState title="No unresolved errors" description="No open error logs are currently recorded." />}
            />
          )}
        </AdminSectionCard>

        <AdminSectionCard
          title="Recent Admin activity"
          description="Latest audited administrative changes."
          action={<Link href="/admin/audit" className="text-xs font-semibold text-[var(--text-accent)] hover:underline">Audit Log →</Link>}
        >
          {audit.error ? (
            <AdminEmptyState title="Audit preview unavailable" description="Audit history could not be verified for this preview." />
          ) : (
            <AdminDataTable
              columns={["Time", "Action", "Summary"]}
              rows={audit.data.map((log) => [formatDate(log.created_at), log.action, log.summary])}
              empty={<AdminEmptyState title="No recent Admin changes" description="Audited changes will appear here after Admin actions are performed." />}
            />
          )}
        </AdminSectionCard>
      </section>

      <AdminSectionCard title="Quick actions" description="Direct links to common operational tasks.">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {[
            ["/admin/errors?status=open", "Review errors"],
            ["/admin/inbox", "Open Inbox"],
            ["/admin/tools", "Manage tools"],
            ["/admin/health", "Check Health"],
            ["/admin/announcements", "Announcements"],
            [admin.role === "owner" ? "/admin/settings" : "/admin/audit", admin.role === "owner" ? "Owner settings" : "Audit Log"],
          ].map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className="rounded-xl border border-[var(--border-hairline)] bg-[rgba(var(--lumeo-paper-rgb),0.02)] px-3 py-3 text-sm font-semibold text-[var(--text-secondary)] transition hover:border-[var(--border-premium)] hover:bg-[rgba(var(--lumeo-paper-rgb),0.04)] hover:text-[var(--text-primary)]"
            >
              {label} →
            </Link>
          ))}
        </div>
      </AdminSectionCard>

      {disabledTools.length > 0 && maintenanceTools.length === 0 ? (
        <p className="text-xs text-[var(--text-subtle)]">
          {disabledTools.length} tool{disabledTools.length === 1 ? "" : "s"} disabled in the catalog. Disabled is not treated as an incident.
        </p>
      ) : null}
    </div>
  );
}
