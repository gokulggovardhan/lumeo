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
import {
  collapseUnknownLocationRuns,
  getRecentAnalyticsEvents,
  getVerifiedAnalytics,
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
  const [verified, recentEvents] = await Promise.all([
    getVerifiedAnalytics({ startDate: range.startDate, endDate: range.endDate }),
    getRecentAnalyticsEvents(200),
  ]);
  const data = verified.data;
  const unavailable = data.dataStatus === "unavailable";
  const noData = !unavailable && data.pageViews === 0;
  const activityRows = collapseUnknownLocationRuns(recentEvents.data);
  const automation = data.trafficCounts.filter(
    (row) => row.trafficClass !== "real_audience",
  );
  const topLocationRows = [
    ...data.topLocations.map((row) => [
      row.label,
      row.pageViews,
      row.visitors,
      row.sessions,
    ]),
    ...(data.unknownLocationPageViews > 0
      ? [["Unknown Location", data.unknownLocationPageViews, "—", "—"]]
      : []),
  ];

  return (
    <div className="min-w-0 max-w-full space-y-7">
      <AdminPageHeader
        eyebrow="Analytics"
        title="Analytics"
        description="Verified real-audience traffic and PDF-tool activity. Page views, visitors, sessions, and approximate location use the same selected IST date range."
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
        title="Date range"
        description="Every verified traffic metric, trend, location, page, and tool breakdown below uses this same Asia/Kolkata date range."
      >
        <form
          action="/admin/analytics"
          method="get"
          className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
        >
          <label className="text-xs font-semibold text-[var(--text-secondary)]">
            Range
            <select name="range" defaultValue={range.key} className="mt-2 min-h-11 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-input)] px-3 text-base text-[var(--text-primary)] sm:text-sm">
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
            Custom start (IST)
            <input type="date" name="start" defaultValue={params.start ?? range.startDate} max={maxDate} className="mt-2 min-h-11 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-input)] px-3 text-base text-[var(--text-primary)] sm:text-sm" />
          </label>
          <label className="text-xs font-semibold text-[var(--text-secondary)]">
            Custom end (IST)
            <input type="date" name="end" defaultValue={params.end ?? range.endDate} max={maxDate} className="mt-2 min-h-11 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-input)] px-3 text-base text-[var(--text-primary)] sm:text-sm" />
          </label>
          <div className="flex items-end">
            <button type="submit" className="min-h-11 w-full rounded-xl bg-[var(--action-primary)] px-5 text-sm font-bold text-[var(--text-on-accent)] lg:w-auto">
              Apply
            </button>
          </div>
        </form>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
          <AdminStatusBadge tone="gold">Selected: {range.label}</AdminStatusBadge>
          <span>{range.startDate} to {range.endDate} · IST</span>
        </div>
        {range.warning ? (
          <p className="mt-3 rounded-xl border border-[var(--border-premium)] px-4 py-3 text-sm text-[var(--text-secondary)]">
            {range.warning} Showing the last 7 days instead.
          </p>
        ) : null}
      </AdminSectionCard>

      {unavailable ? (
        <AdminEmptyState
          title="Verified analytics are unavailable"
          description="Schema-v2 audience analytics could not be verified. Metrics are withheld instead of falling back to legacy or fabricated values."
        />
      ) : (
        <>
          <section aria-label="Verified traffic metrics" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <AdminMetricCard label="Page Views" value={data.pageViews} detail={`${range.label} · genuine visitor navigation views.`} tone="success" />
            <AdminMetricCard label="Unique Visitors" value={data.uniqueVisitors} detail="Deduplicated first-party visitor identifiers; no fingerprinting." />
            <AdminMetricCard label="Sessions" value={data.sessions} detail="Distinct 30-minute first-party browsing sessions." tone="gold" />
            <AdminMetricCard label="Known Location" value={data.knownLocationPageViews} detail="Page views with Cloudflare city + region + country." />
            <AdminMetricCard label="Unknown Location" value={data.unknownLocationPageViews} detail="Real page views without a complete trustworthy location." />
          </section>

          {noData ? (
            <AdminEmptyState
              title="No verified real-audience page views in this range"
              description="This is a truthful zero. Legacy pre-cutover events and synthetic production tests are not promoted into genuine visitor traffic."
            />
          ) : null}

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.55fr)]">
            <AudienceTrendChart points={data.daily} rangeLabel={range.label} />
            <AdminSectionCard title="Traffic integrity" description="Checks that make the audience totals auditable.">
              <dl className="space-y-4 text-sm">
                <div>
                  <dt className="text-[var(--text-muted)]">Location coverage</dt>
                  <dd className="mt-1 font-semibold text-[var(--text-primary)]">
                    {data.locationCoveragePercent === null ? "N/A" : `${data.locationCoveragePercent}%`}
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--text-muted)]">Known + Unknown</dt>
                  <dd className="mt-1 font-semibold text-[var(--text-primary)]">
                    {data.knownLocationPageViews} + {data.unknownLocationPageViews} = {data.pageViews} page views
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--text-muted)]">Latest verified page view</dt>
                  <dd className="mt-1 font-semibold text-[var(--text-primary)]">{formatDate(data.latestPageViewAt)}</dd>
                </div>
                <div>
                  <dt className="text-[var(--text-muted)]">Verified cutover</dt>
                  <dd className="mt-1 font-semibold text-[var(--text-primary)]">{formatDate(data.cutoverAt)}</dd>
                </div>
                {data.legacyPageViews > 0 ? (
                  <div>
                    <dt className="text-[var(--text-muted)]">Legacy page views in selected range</dt>
                    <dd className="mt-1 font-semibold text-[var(--text-primary)]">{data.legacyPageViews} · retained as history, excluded from verified audience/location totals.</dd>
                  </div>
                ) : null}
              </dl>
            </AdminSectionCard>
          </section>

          <AdminSectionCard title="Daily traffic" description={`Page views, visitors, sessions, and geographic completeness for ${range.label.toLowerCase()}.`}>
            <AdminDataTable
              columns={["Date", "Page views", "Visitors", "Sessions", "Known location", "Unknown location"]}
              rows={data.daily.map((row) => [
                row.date,
                row.pageViews,
                row.uniqueVisitors,
                row.sessions,
                row.knownLocationPageViews,
                row.unknownLocationPageViews,
              ])}
              empty={<AdminEmptyState title="No daily traffic" description="No verified real-audience page views were recorded for these IST calendar days." />}
            />
          </AdminSectionCard>

          <AdminSectionCard title="Top locations" description="Full City, State/Region, Country locations ranked by genuine page views. Unknown Location is never ranked as a city and remains at the bottom.">
            <AdminDataTable
              columns={["Location", "Page views", "Visitors", "Sessions"]}
              rows={topLocationRows}
              empty={<AdminEmptyState title="No resolvable locations" description="Traffic without a complete Cloudflare city, region, and country is counted under Unknown Location instead of being guessed." />}
            />
          </AdminSectionCard>

          <AdminSectionCard title="Geographic breakdown" description="Real Cloudflare IP-geolocation only. Partial data is useful at its own level but is never completed by guessing.">
            <div className="grid gap-4 lg:grid-cols-3">
              <AnalyticsBarList title="Countries · page views" items={data.countries.map((item) => ({ label: item.label, value: item.pageViews }))} />
              <AnalyticsBarList title="States / regions · page views" items={data.regions.map((item) => ({ label: item.label, value: item.pageViews }))} />
              <AnalyticsBarList title="Cities · page views" items={data.cities.map((item) => ({ label: item.label, value: item.pageViews }))} />
            </div>
          </AdminSectionCard>

          <AdminSectionCard title="Top pages" description="Actual page-view events only; static assets, API calls, fonts, images, and Worker requests are not counted as website hits.">
            <AdminDataTable
              columns={["Page", "Page views", "Visitors", "Sessions"]}
              rows={data.topPages.map((row) => [row.path, row.pageViews, row.visitors, row.sessions])}
              empty={<AdminEmptyState title="No page views yet" description="Top pages will appear after verified real-audience navigation events are recorded." />}
            />
          </AdminSectionCard>

          <AdminSectionCard title="Automated / synthetic traffic" description="Kept separate from genuine audience metrics. Only explicit Lumeo synthetic tests and Cloudflare-verified bots are classified automatically; uncertain visitors are not guessed as bots.">
            <AdminDataTable
              columns={["Traffic class", "Page views", "Visitors", "Sessions"]}
              rows={automation.map((row) => [
                row.trafficClass.replaceAll("_", " "),
                row.pageViews,
                row.visitors,
                row.sessions,
              ])}
              empty={<AdminEmptyState title="No classified automation in this range" description="No explicit synthetic or Cloudflare-verified bot page views were recorded." />}
            />
          </AdminSectionCard>

          <AdminSectionCard title="Operation analytics" description={`Verified real-audience PDF-tool lifecycle metrics for ${range.label.toLowerCase()}.`}>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
              <AdminMetricCard label="Tool Opens" value={data.toolOpens} detail="Tool workspaces opened by the verified audience." tone="gold" />
              <AdminMetricCard label="Processing Started" value={data.processingStarted} detail="Processing attempts started." />
              <AdminMetricCard label="Processing Succeeded" value={data.processingSucceeded} detail="Usable outputs created." tone="success" />
              <AdminMetricCard label="Processing Failed" value={data.processingFailed} detail="Approved failure events." tone={data.processingFailed ? "danger" : "neutral"} />
              <AdminMetricCard label="Processing Cancelled" value={data.processingCancelled} detail="Explicit cancellations." />
              <AdminMetricCard label="Success Rate" value={data.successRate === null ? "N/A" : `${data.successRate}%`} detail="Succeeded ÷ succeeded + failed." />
              <AdminMetricCard label="Average Duration" value={formatDuration(data.averageDurationMs)} detail="Successful processing events only." />
            </section>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <AnalyticsDistribution succeeded={data.processingSucceeded} failed={data.processingFailed} />
              <AnalyticsBarList title="Failure stages" items={data.failureStageSummary.map((item) => ({ label: item.label, value: item.count }))} emptyText="No verified failure stages in this range." />
              <AnalyticsBarList title="Cancellation stages" items={data.cancellationStageSummary.map((item) => ({ label: item.label, value: item.count }))} emptyText="No verified cancellation stages in this range." />
            </div>
          </AdminSectionCard>

          <AdminSectionCard title="Tool performance" description="Verified real-audience tool usage for the same selected date range.">
            <div className="grid gap-4 lg:grid-cols-2">
              <AnalyticsBarList title="Top tools by opens" items={data.topToolsByOpens.map((item) => ({ label: item.toolSlug, value: item.count }))} />
              <AnalyticsBarList title="Tools by successful processing" items={data.topToolsBySuccess.map((item) => ({ label: item.toolSlug, value: item.count }))} />
            </div>
          </AdminSectionCard>

          <AdminSectionCard title="Audience environment" description="Privacy-preserving visitor counts; no raw IP, exact coordinates, or device fingerprint is exposed.">
            <div className="grid gap-4 md:grid-cols-3">
              <AnalyticsBarList title="Device class" items={data.deviceSummary.map((item) => ({ label: item.label, value: item.count }))} />
              <AnalyticsBarList title="Browser family" items={data.browserSummary.map((item) => ({ label: item.label, value: item.count }))} />
              <AnalyticsBarList title="Operating system" items={data.osSummary.map((item) => ({ label: item.label, value: item.count }))} />
            </div>
          </AdminSectionCard>

          <AdminSectionCard title="Recent verified activity" description="Newest real-audience events only. No IP address, visitor/session key, raw cookie token, GPS coordinate, or street-level location is displayed.">
            {recentEvents.error ? (
              <AdminEmptyState title="Recent activity is unavailable" description="Aggregate analytics remain independent from the recent-event feed." />
            ) : (
              <>
                <RecentActivityTable rows={activityRows.slice(0, RECENT_ACTIVITY_PREVIEW_SIZE)} />
                {activityRows.length > RECENT_ACTIVITY_PREVIEW_SIZE ? (
                  <div className="mt-4 text-right">
                    <Link href="/admin/analytics/activity" prefetch={false} className="text-sm font-bold text-[var(--text-accent)] hover:underline">
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
