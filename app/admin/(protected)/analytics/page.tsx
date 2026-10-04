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
import { AudienceTrendChart } from "@/components/admin/analytics/AudienceTrendChart";
import {
  RecentActivityTable,
  RECENT_ACTIVITY_PREVIEW_SIZE,
} from "@/components/admin/analytics/RecentActivityTable";
import { resolveAnalyticsRange } from "@/lib/admin/analytics-range";
import { collapseUnknownLocationRuns } from "@/lib/admin/data";
import {
  getVerifiedAnalytics,
  getVerifiedRecentAnalyticsEvents,
  type VerifiedAnalyticsScope,
} from "@/lib/admin/verified-analytics";
import { formatAdminDateTime, istIsoDate } from "@/lib/admin/timezone";

function formatDate(value: string | null) {
  return value ? formatAdminDateTime(value) : "None yet";
}

function formatDuration(value: number | null) {
  if (value === null) return "N/A";
  return value < 1000 ? `${Math.round(value)}ms` : `${(value / 1000).toFixed(1)}s`;
}

function analyticsScope(value: string | undefined): VerifiedAnalyticsScope {
  if (value === "synthetic" || value === "automation" || value === "all") return value;
  return "real_audience";
}

const SCOPE_LABEL: Record<VerifiedAnalyticsScope, string> = {
  real_audience: "Genuine audience",
  synthetic: "Lumeo synthetic tests",
  automation: "Known automation",
  all: "All verified traffic",
};

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams?: Promise<{ range?: string; start?: string; end?: string; scope?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const range = resolveAnalyticsRange(params, new Date());
  const scope = analyticsScope(params.scope);
  const maxDate = istIsoDate();
  const [analytics, recentEvents] = await Promise.all([
    getVerifiedAnalytics({ startDate: range.startDate, endDate: range.endDate }, scope),
    getVerifiedRecentAnalyticsEvents(200, scope),
  ]);
  const data = analytics.data;
  const unavailable = data.dataStatus === "unavailable";
  const noData =
    !unavailable &&
    data.summary.pageViews === 0 &&
    data.summary.toolOpens === 0;
  const completed = data.summary.processingSucceeded + data.summary.processingFailed;
  const successRate =
    completed > 0
      ? Math.round((data.summary.processingSucceeded / completed) * 1000) / 10
      : null;
  const unreconciledStarts = Math.max(
    0,
    data.summary.processingStarted -
      data.summary.processingSucceeded -
      data.summary.processingFailed -
      data.summary.processingCancelled,
  );
  const activityRows = collapseUnknownLocationRuns(
    recentEvents.data.map((event) => ({
      occurredAt: event.occurredAt,
      eventName: event.eventName,
      toolSlug: event.toolSlug,
      deviceClass: event.deviceClass,
      browserFamily: event.browserFamily,
      operatingSystem: event.operatingSystem,
      locationLabel:
        event.locationLabel === "Unknown Location"
          ? "Unknown location"
          : event.locationLabel,
      success: event.success,
    })),
  );

  return (
    <div className="min-w-0 max-w-full space-y-7">
      <AdminPageHeader
        eyebrow="Analytics"
        title="Analytics"
        description="Verified audience traffic and product usage. Genuine-audience metrics exclude Lumeo synthetic browser tests and reliably identified automation. All date boundaries use Asia/Kolkata."
        meta={
          <Link
            href="/admin/analytics/activity"
            prefetch={false}
            className="inline-flex min-h-11 items-center rounded-xl border border-[var(--border-subtle)] px-4 text-sm font-semibold text-[var(--text-secondary)] hover:border-[var(--border-premium)] hover:text-[var(--text-primary)]"
          >
            Full activity log
          </Link>
        }
      />
      <AnalyticsPrivacyNotice />

      <AdminSectionCard
        title="Date range and traffic scope"
        description="Every metric, trend, location, page and tool ranking below uses this same bounded IST date range and traffic scope."
      >
        <form
          action="/admin/analytics"
          method="get"
          className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
        >
          <label className="text-xs font-semibold text-[var(--text-secondary)]">
            Range
            <select
              name="range"
              defaultValue={range.key}
              className="mt-2 min-h-11 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-input)] px-3 text-base text-[var(--text-primary)] sm:text-sm"
            >
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="this-month">This month</option>
              <option value="previous-month">Previous month</option>
              <option value="custom">Custom</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-[var(--text-secondary)]">
            Traffic
            <select
              name="scope"
              defaultValue={scope}
              className="mt-2 min-h-11 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-input)] px-3 text-base text-[var(--text-primary)] sm:text-sm"
            >
              <option value="real_audience">Genuine audience</option>
              <option value="synthetic">Lumeo synthetic tests</option>
              <option value="automation">Known automation</option>
              <option value="all">All verified traffic</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-[var(--text-secondary)]">
            Custom start (IST)
            <input type="date" name="start" defaultValue={params.start ?? range.startDate} max={maxDate} className="mt-2 min-h-11 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-input)] px-3 text-base text-[var(--text-primary)] sm:text-sm" />
          </label>
          <label className="text-xs font-semibold text-[var(--text-secondary)]">
            Custom end (IST)
            <input type="date" name="end" defaultValue={params.end ?? range.endDate} max={maxDate} className="mt-2 min-h-11 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-input)] px-3 text-base text-[var(--text-primary)] sm:text-sm" />
          </label>
          <div className="flex items-end">
            <button type="submit" className="min-h-11 w-full rounded-xl bg-[var(--action-primary)] px-5 text-sm font-bold text-[var(--text-on-accent)] transition hover:bg-[var(--action-primary-hover)] lg:w-auto">
              Apply
            </button>
          </div>
        </form>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
          <AdminStatusBadge tone="gold">Selected: {range.label}</AdminStatusBadge>
          <AdminStatusBadge tone={scope === "real_audience" ? "success" : "warning"}>
            {SCOPE_LABEL[scope]}
          </AdminStatusBadge>
          <span>{range.startDate} to {range.endDate} · IST</span>
        </div>
        {range.warning ? (
          <p className="mt-3 rounded-xl border border-[rgba(var(--lumeo-gold-rgb),0.24)] bg-[rgba(var(--lumeo-gold-rgb),0.08)] px-4 py-3 text-sm text-[var(--text-secondary)]">
            {range.warning} Showing the last 7 days instead.
          </p>
        ) : null}
      </AdminSectionCard>

      {unavailable ? (
        <AdminEmptyState
          title="Verified analytics are unavailable"
          description="The trusted schema-v2 aggregate could not be read. Lumeo withholds the metrics instead of falling back to legacy or fabricated traffic data."
        />
      ) : (
        <>
          <section aria-label="Verified traffic metrics" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <AdminMetricCard label="Page Views" value={data.summary.pageViews} detail={`${range.label} · genuine page/navigation views.`} tone="success" />
            <AdminMetricCard label="Unique Visitors" value={data.summary.uniqueVisitors} detail="Deduplicated first-party visitor identities; not a count of people with guaranteed physical identity." />
            <AdminMetricCard label="Sessions" value={data.summary.sessions} detail="Distinct 30-minute first-party browsing sessions." tone="gold" />
            <AdminMetricCard label="Known Location" value={data.summary.knownLocationPageViews} detail="Page views with genuine city + region + country from Cloudflare visitor-IP geolocation." />
            <AdminMetricCard label="Unknown Location" value={data.summary.unknownLocationPageViews} detail="Genuine page views kept in totals when complete geography is unavailable." tone={data.summary.unknownLocationPageViews ? "warning" : "neutral"} />
          </section>

          {noData ? (
            <AdminEmptyState
              title="No verified traffic in this range"
              description="This is a genuine zero after the trusted analytics cutover. Legacy pre-cutover records are not promoted into verified audience metrics."
            />
          ) : null}

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.55fr)]">
            <AudienceTrendChart points={data.daily} rangeLabel={range.label} />
            <AdminSectionCard title="Geographic coverage" description="Completeness of full City, State/Region, Country reporting.">
              <dl className="space-y-4 text-sm">
                <div><dt className="text-[var(--text-muted)]">Known-location page views</dt><dd className="mt-1 font-semibold text-[var(--text-primary)]">{data.summary.knownLocationPageViews}</dd></div>
                <div><dt className="text-[var(--text-muted)]">Unknown-location page views</dt><dd className="mt-1 font-semibold text-[var(--text-primary)]">{data.summary.unknownLocationPageViews}</dd></div>
                <div><dt className="text-[var(--text-muted)]">Coverage</dt><dd className="mt-1 font-semibold text-[var(--text-primary)]">{data.summary.locationCoveragePercent === null ? "N/A" : `${data.summary.locationCoveragePercent}%`}</dd></div>
                <div><dt className="text-[var(--text-muted)]">Latest verified event</dt><dd className="mt-1 font-semibold text-[var(--text-primary)]">{formatDate(data.summary.latestEventAt)}</dd></div>
              </dl>
            </AdminSectionCard>
          </section>

          <AdminSectionCard
            title="Top Locations"
            description="Complete visitor-IP locations only. Unknown Location is intentionally kept as one line at the bottom and remains part of total Page Views."
          >
            <AdminDataTable
              columns={["Location", "Page Views"]}
              rows={data.locations.map((location) => [
                <span key="location" className={location.unknown ? "text-[var(--text-muted)]" : "font-semibold text-[var(--text-primary)]"}>{location.label}</span>,
                location.pageViews,
              ])}
              empty={<AdminEmptyState title="No location data in this range" description="Traffic will appear as Unknown Location until trusted Cloudflare visitor geography is available." />}
            />
          </AdminSectionCard>

          <AdminSectionCard title="Country, State/Region and City" description="Page-view counts from trusted IP-geolocation fields only; missing levels are never guessed.">
            <div className="grid gap-4 lg:grid-cols-3">
              <AnalyticsBarList title="Countries" items={data.countries.map((item) => ({ label: item.label, value: item.pageViews }))} />
              <AnalyticsBarList title="States / Regions" items={data.regions.map((item) => ({ label: item.label, value: item.pageViews }))} />
              <AnalyticsBarList title="Cities" items={data.cities.map((item) => ({ label: item.label, value: item.pageViews }))} />
            </div>
          </AdminSectionCard>

          <AdminSectionCard title="Daily traffic" description={`Verified IST calendar-day audience totals for ${range.label.toLowerCase()}.`}>
            <AdminDataTable
              columns={["Date", "Page Views", "Visitors", "Sessions", "Known Location", "Unknown Location"]}
              rows={data.daily.map((metric) => [
                metric.date,
                metric.pageViews,
                metric.uniqueVisitors,
                metric.sessions,
                metric.knownLocationPageViews,
                metric.unknownLocationPageViews,
              ])}
              empty={<AdminEmptyState title="No daily traffic in this range" description="No verified audience page views were recorded for the selected calendar days." />}
            />
          </AdminSectionCard>

          <AdminSectionCard title="Top Pages" description="Actual page/navigation views only; static assets and API requests are not page views.">
            <AdminDataTable
              columns={["Page", "Page Views", "Visitors", "Sessions"]}
              rows={data.topPages.map((page) => [page.path, page.pageViews, page.visitors, page.sessions])}
              empty={<AdminEmptyState title="No page views in this range" description="No verified page navigation has been recorded." />}
            />
          </AdminSectionCard>

          <AdminSectionCard title="Operation analytics" description={`Verified product lifecycle signals for ${range.label.toLowerCase()} and the selected traffic scope.`}>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
              <AdminMetricCard label="Tool Opens" value={data.summary.toolOpens} detail="Tool workspaces opened." />
              <AdminMetricCard label="Processing Started" value={data.summary.processingStarted} detail="Processing attempts started." />
              <AdminMetricCard label="Succeeded" value={data.summary.processingSucceeded} detail="Usable outputs created." tone="success" />
              <AdminMetricCard label="Failed" value={data.summary.processingFailed} detail="Approved failure events." tone={data.summary.processingFailed ? "danger" : "neutral"} />
              <AdminMetricCard label="Cancelled" value={data.summary.processingCancelled} detail="Explicit cancellations." />
              <AdminMetricCard label="No terminal event" value={unreconciledStarts} detail="Started minus succeeded, failed and cancelled." tone={unreconciledStarts ? "warning" : "neutral"} />
              <AdminMetricCard label="Success Rate" value={successRate === null ? "N/A" : `${successRate}%`} detail="Succeeded ÷ succeeded+failed; cancellations excluded." tone="gold" />
            </section>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <AnalyticsDistribution succeeded={data.summary.processingSucceeded} failed={data.summary.processingFailed} />
              <AnalyticsBarList title="Error categories" items={data.errorSummary} emptyText="No verified failure categories in this range." />
              <AnalyticsBarList title="Failure stages" items={data.failureStageSummary} emptyText="No verified staged failures in this range." />
              <AnalyticsBarList title="Cancellation stages" items={data.cancellationStageSummary} emptyText="No verified staged cancellations in this range." />
            </div>
            <p className="mt-4 text-xs text-[var(--text-muted)]">Average successful processing duration: {formatDuration(data.summary.averageDurationMs)} · Downloads started: {data.summary.downloadsStarted}</p>
          </AdminSectionCard>

          <AdminSectionCard title="Tool performance" description="Tool rankings use the same verified date range and traffic scope as the audience metrics above.">
            <div className="grid gap-4 lg:grid-cols-2">
              <AnalyticsBarList title="Top tools by opens" items={data.topToolsByOpens.map((item) => ({ label: item.toolSlug, value: item.count }))} />
              <AnalyticsBarList title="Tools by successful processing" items={data.topToolsBySuccess.map((item) => ({ label: item.toolSlug, value: item.count }))} />
            </div>
          </AdminSectionCard>

          <AdminSectionCard title="Audience environment" description="Coarse technical dimensions only; no invasive fingerprinting.">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <AnalyticsBarList title="Device class" items={data.deviceSummary} />
              <AnalyticsBarList title="Browser family" items={data.browserSummary} />
              <AnalyticsBarList title="Operating system" items={data.osSummary} />
            </div>
          </AdminSectionCard>

          <AdminSectionCard title="Traffic integrity" description="Automation and historical unverified analytics are kept separate from the default Genuine audience view.">
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <AdminMetricCard label="Excluded Automation Page Views" value={data.integrity.excludedAutomationPageViews} detail="Synthetic tests and reliably identified bot/automation page views in this date range." />
              <AdminMetricCard label="Legacy Unverified Page Views" value={data.integrity.legacyPageViews} detail="Pre-cutover schema-v1 rows preserved historically but excluded from verified audience totals." tone={data.integrity.legacyPageViews ? "warning" : "neutral"} />
              <AdminMetricCard label="Verified Cutover" value={data.integrity.cutoverAt ? formatDate(data.integrity.cutoverAt) : "Not started"} detail="First trusted schema-v2 event." tone={data.integrity.cutoverAt ? "success" : "warning"} />
            </section>
          </AdminSectionCard>

          <AdminSectionCard title="Recent verified activity" description="Newest trusted events for the selected traffic class. No visitor/session key, raw IP, exact coordinate or address is displayed.">
            {recentEvents.error ? (
              <AdminEmptyState title="Recent activity is unavailable" description="Aggregate analytics are still valid, but the recent verified event reader is unavailable." />
            ) : (
              <>
                <RecentActivityTable rows={activityRows.slice(0, RECENT_ACTIVITY_PREVIEW_SIZE)} />
                {activityRows.length > RECENT_ACTIVITY_PREVIEW_SIZE ? (
                  <div className="mt-4 text-right">
                    <Link href={`/admin/analytics/activity?scope=${scope}`} prefetch={false} className="text-sm font-bold text-[var(--text-accent)] hover:underline">
                      View full activity log →
                    </Link>
                  </div>
                ) : null}
              </>
            )}
          </AdminSectionCard>
        </>
      )}
    </div>
  );
}
