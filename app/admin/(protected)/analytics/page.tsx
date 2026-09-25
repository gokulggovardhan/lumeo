import Link from "next/link";
import { AdminDataTable } from "@/components/admin/AdminDataTable";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminMetricCard } from "@/components/admin/AdminMetricCard";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminSectionCard } from "@/components/admin/AdminSectionCard";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { AnalyticsBarList } from "@/components/admin/analytics/AnalyticsBarList";
import { AnalyticsDistribution } from "@/components/admin/analytics/AnalyticsDistribution";
import { AnalyticsPrivacyNotice } from "@/components/admin/analytics/AnalyticsPrivacyNotice";
import { AnalyticsTrendChart } from "@/components/admin/analytics/AnalyticsTrendChart";
import {
  RecentActivityTable,
  RECENT_ACTIVITY_PREVIEW_SIZE,
} from "@/components/admin/analytics/RecentActivityTable";
import { resolveAnalyticsRange } from "@/lib/admin/analytics-range";
import {
  collapseUnknownLocationRuns,
  getAnalyticsSummary,
  getRecentAnalyticsEvents,
} from "@/lib/admin/data";
import { formatAdminDateTime, istIsoDate } from "@/lib/admin/timezone";

function formatDate(value: string | null) {
  return value ? formatAdminDateTime(value) : "None yet";
}

function formatDuration(value: number | null) {
  if (value === null) return "N/A";
  return value < 1000 ? `${Math.round(value)}ms` : `${(value / 1000).toFixed(1)}s`;
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams?: Promise<{ range?: string; start?: string; end?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const range = resolveAnalyticsRange(params, new Date());
  const maxDate = istIsoDate();
  const [summary, recentEvents] = await Promise.all([
    getAnalyticsSummary({ startDate: range.startDate, endDate: range.endDate }),
    getRecentAnalyticsEvents(200),
  ]);
  const data = summary.data;
  const unavailable = data.dataStatus === "unavailable";
  const noData = !unavailable && data.eventsToday === 0 && data.sevenDayTotals.length === 0;
  const activityRows = collapseUnknownLocationRuns(recentEvents.data);

  return (
    <div className="min-w-0 max-w-full space-y-7">
      <AdminPageHeader
        eyebrow="Analytics"
        title="Analytics"
        description="Discovery & operation analytics, organized for quick decisions with privacy-preserving public signals. All date boundaries use Asia/Kolkata calendar days."
        meta={<Link href="/admin/analytics/activity" className="inline-flex min-h-11 items-center rounded-xl border border-[var(--border-subtle)] px-4 text-sm font-semibold text-[var(--text-secondary)] hover:border-[var(--border-premium)] hover:text-[var(--text-primary)]">Full activity log</Link>}
      />
      <AnalyticsPrivacyNotice />

      <AdminSectionCard title="Date range" description="Every metric, trend, ranking, and breakdown below uses this same bounded server-side aggregate.">
        <form action="/admin/analytics" method="get" className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
          <label className="text-xs font-semibold text-[var(--text-secondary)]">Range
            <select name="range" defaultValue={range.key} className="mt-2 min-h-11 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-input)] px-3 text-base text-[var(--text-primary)] sm:text-sm">
              <option value="today">Today</option><option value="yesterday">Yesterday</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="this-month">This month</option><option value="previous-month">Previous month</option><option value="custom">Custom</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-[var(--text-secondary)]">Custom start (IST)
            <input type="date" name="start" defaultValue={params.start ?? range.startDate} max={maxDate} className="mt-2 min-h-11 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-input)] px-3 text-base text-[var(--text-primary)] sm:text-sm" />
          </label>
          <label className="text-xs font-semibold text-[var(--text-secondary)]">Custom end (IST)
            <input type="date" name="end" defaultValue={params.end ?? range.endDate} max={maxDate} className="mt-2 min-h-11 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-input)] px-3 text-base text-[var(--text-primary)] sm:text-sm" />
          </label>
          <div className="flex items-end"><button type="submit" className="min-h-11 w-full rounded-xl bg-[var(--action-primary)] px-5 text-sm font-bold text-[var(--text-on-accent)] transition hover:bg-[var(--action-primary-hover)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--lumeo-aura-rgb),0.2)] lg:w-auto">Apply</button></div>
        </form>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
          <AdminStatusBadge tone="gold">Selected: {range.label}</AdminStatusBadge>
          <span>{range.startDate} to {range.endDate} · IST</span>
        </div>
        {range.warning ? <p className="mt-3 rounded-xl border border-[rgba(var(--lumeo-gold-rgb),0.24)] bg-[rgba(var(--lumeo-gold-rgb),0.08)] px-4 py-3 text-sm text-[var(--text-secondary)]">{range.warning} Showing the last 7 days instead.</p> : null}
      </AdminSectionCard>

      {unavailable ? (
        <AdminEmptyState title="Analytics aggregates are unavailable" description="The secure aggregate reader could not return verified data. Metrics are withheld instead of presenting unverified zero values." />
      ) : (
        <>
          <section aria-label="Key analytics metrics" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <AdminMetricCard label="Unique Visitors" value={data.uniqueVisitorsToday} detail={`${range.label} · distinct temporary sessions.`} tone="success" />
            <AdminMetricCard label="Page Views" value={data.pageViewsToday} detail={`${range.label} · public page views.`} />
            <AdminMetricCard label="Tool Opens" value={data.toolOpens} detail={`${range.label} · tool workspaces opened.`} tone="gold" />
            <AdminMetricCard label="Downloads Started" value={data.downloadsStarted} detail={`${range.label} · output downloads started.`} />
          </section>

          {noData ? <AdminEmptyState title="No analytics events in this range" description="This is a verified empty result, not an application failure. Choose another period or wait for new public activity." /> : null}

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.55fr)]">
            <AnalyticsTrendChart points={data.sevenDayTotals} rangeLabel={range.label} />
            <AdminSectionCard title="Operational readout" description="A concise interpretation of the selected period.">
              <dl className="space-y-4 text-sm">
                <div><dt className="text-[var(--text-muted)]">Latest verified event</dt><dd className="mt-1 font-semibold text-[var(--text-primary)]">{formatDate(data.latestEventAt)}</dd></div>
                <div><dt className="text-[var(--text-muted)]">Most opened tool</dt><dd className="mt-1 font-semibold text-[var(--text-primary)]">{data.topToolsByOpens[0] ? `${data.topToolsByOpens[0].toolSlug} · ${data.topToolsByOpens[0].count}` : "No tool opens in range"}</dd></div>
                <div><dt className="text-[var(--text-muted)]">Processing health</dt><dd className="mt-1 font-semibold text-[var(--text-primary)]">{data.successRate === null ? "No completed attempts" : `${data.successRate}% success rate`}</dd></div>
              </dl>
            </AdminSectionCard>
          </section>

          <AdminSectionCard title="Operation analytics" description={`Processing lifecycle metrics for ${range.label.toLowerCase()}.`}>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <AdminMetricCard label="Processing Started" value={data.processingStarted} detail="Real processing attempts started." />
              <AdminMetricCard label="Processing Succeeded" value={data.processingSucceeded} detail="Usable outputs created." tone="success" />
              <AdminMetricCard label="Processing Failed" value={data.processingFailed} detail="Attempts reporting approved failure events." tone={data.processingFailed ? "danger" : "neutral"} />
              <AdminMetricCard label="Success Rate" value={data.successRate === null ? "N/A" : `${data.successRate}%`} detail="Succeeded ÷ completed attempts." tone="gold" />
              <AdminMetricCard label="Average Duration" value={formatDuration(data.averageDurationMs)} detail="Successful processing events only." />
            </section>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <AnalyticsDistribution succeeded={data.processingSucceeded} failed={data.processingFailed} />
              <AnalyticsBarList title="Error categories" items={data.errorSummary.map((item) => ({ label: item.errorCode, value: item.count }))} emptyText="No analytics error categories were recorded in this range." />
            </div>
          </AdminSectionCard>

          <AdminSectionCard title="Tool performance" description="Compare discovery with successful processing without inventing conversion rates for tools that do not emit lifecycle events.">
            <div className="grid gap-4 lg:grid-cols-2">
              <AnalyticsBarList title="Top tools by opens" items={data.topToolsByOpens.map((item) => ({ label: item.toolSlug, value: item.count }))} />
              <AnalyticsBarList title="Tools by successful processing" items={data.topToolsBySuccess.map((item) => ({ label: item.toolSlug, value: item.count }))} />
            </div>
          </AdminSectionCard>

          <AdminSectionCard title="Daily activity" description={`Verified IST calendar-day totals for ${range.label.toLowerCase()}.`}>
            <AdminDataTable columns={["Date", "Unique visitors", "Page views", "Tool opens", "Succeeded", "Failed", "Events"]} rows={data.sevenDayTotals.map((metric) => [metric.date, metric.uniqueVisitors, metric.pageViews, metric.toolOpens, metric.succeeded, metric.failed, metric.events])} empty={<AdminEmptyState title="No daily analytics in this range" description="No approved analytics events were recorded for the selected calendar days." />} />
          </AdminSectionCard>

          <AdminSectionCard title="Audience and environment" description="Coarse, privacy-preserving dimensions only. Location is approximate network-derived data.">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <AnalyticsBarList title="Device class" items={data.deviceSummary.map((item) => ({ label: item.label, value: item.count }))} />
              <AnalyticsBarList title="Browser family" items={data.browserSummary.map((item) => ({ label: item.label, value: item.count }))} />
              <AnalyticsBarList title="Operating system" items={data.osSummary.map((item) => ({ label: item.label, value: item.count }))} />
              <AnalyticsBarList title="Approximate locations" items={data.locationSummary.map((item) => ({ label: item.label, value: item.count }))} emptyText="No approximate location data is available for this range." />
            </div>
          </AdminSectionCard>

          <AdminSectionCard title="Recent activity" description="Latest approved public events, newest first. No session identifier, IP address, or precise coordinate is displayed.">
            {recentEvents.error ? <AdminEmptyState title="Recent activity is unavailable" description="Aggregate analytics are still valid, but the recent-events reader could not return verified rows." /> : <>
              <RecentActivityTable rows={activityRows.slice(0, RECENT_ACTIVITY_PREVIEW_SIZE)} />
              {activityRows.length > RECENT_ACTIVITY_PREVIEW_SIZE ? <div className="mt-4 text-right"><Link href="/admin/analytics/activity" className="text-sm font-bold text-[var(--text-accent)] hover:underline">View full activity log →</Link></div> : null}
            </>}
          </AdminSectionCard>
        </>
      )}
    </div>
  );
}
