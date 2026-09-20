import Link from "next/link";
import { AdminDataTable } from "@/components/admin/AdminDataTable";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminMetricCard } from "@/components/admin/AdminMetricCard";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminSectionCard } from "@/components/admin/AdminSectionCard";
import { AnalyticsBarList } from "@/components/admin/analytics/AnalyticsBarList";
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

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    range?: string;
    start?: string;
    end?: string;
  }>;
}) {
  const params = (await searchParams) ?? {};
  const now = new Date();
  const range = resolveAnalyticsRange(params, now);
  const maxDate = istIsoDate(now);

  const [summary, recentEvents] = await Promise.all([
    getAnalyticsSummary({
      startDate: range.startDate,
      endDate: range.endDate,
    }),
    getRecentAnalyticsEvents(200),
  ]);

  const data = summary.data;
  const activityRows = collapseUnknownLocationRuns(recentEvents.data);
  const unavailable = data.dataStatus === "unavailable";
  const mostOpenedTool = data.topToolsByOpens[0];
  const noData = data.eventsToday === 0 && data.sevenDayTotals.length === 0;
  const periodDetail = `${range.startDate} to ${range.endDate} · IST`;

  return (
    <div className="min-w-0 max-w-full space-y-7">
      <AdminPageHeader
        eyebrow="Analytics"
        title="Discovery & operation analytics"
        description="Privacy-preserving public signals for page visits, tool discovery, and processing outcomes. All date filters use Asia/Kolkata calendar days."
      />
      <AnalyticsPrivacyNotice />

      <AdminSectionCard
        title="Date range"
        description="Use the same bounded server-side aggregate for cards, trends, tool rankings, devices, browsers, operating systems, errors, and approximate locations."
      >
        <form
          action="/admin/analytics"
          method="get"
          className="grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
        >
          <label className="text-sm font-semibold text-[#F0EAD6]">
            Range
            <select
              name="range"
              defaultValue={range.key}
              className="mt-2 min-h-11 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-input)] px-3 text-sm text-[var(--lumeo-paper-50)]"
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

          <label className="text-sm font-semibold text-[#F0EAD6]">
            Custom start
            <input
              type="date"
              name="start"
              defaultValue={params.start ?? range.startDate}
              max={maxDate}
              className="mt-2 min-h-11 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-input)] px-3 text-sm text-[var(--lumeo-paper-50)]"
            />
          </label>

          <label className="text-sm font-semibold text-[#F0EAD6]">
            Custom end
            <input
              type="date"
              name="end"
              defaultValue={params.end ?? range.endDate}
              max={maxDate}
              className="mt-2 min-h-11 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-input)] px-3 text-sm text-[var(--lumeo-paper-50)]"
            />
          </label>

          <div className="flex items-end">
            <button
              type="submit"
              className="min-h-11 w-full touch-manipulation rounded-xl bg-[var(--action-primary)] px-5 text-sm font-bold text-[var(--text-on-accent)] transition hover:bg-[var(--action-primary-hover)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--lumeo-aura-rgb),0.2)] lg:w-auto"
            >
              Apply
            </button>
          </div>
        </form>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-[#F0EAD6]/56">
          <span className="rounded-full border border-[var(--border-subtle)] px-3 py-1.5">
            Selected: {range.label}
          </span>
          <span>{periodDetail}</span>
        </div>
        {range.warning ? (
          <p className="mt-3 rounded-xl border border-[#CBA052]/22 bg-[#CBA052]/10 px-4 py-3 text-sm text-[#F0EAD6]/80">
            {range.warning} Showing the last 7 days instead.
          </p>
        ) : null}
      </AdminSectionCard>

      {unavailable ? (
        <AdminEmptyState
          title="Analytics aggregates are unavailable"
          description="The secure admin aggregate reader could not return verified data. These cards are hidden to avoid showing misleading zero metrics."
        />
      ) : (
        <>
          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <AdminMetricCard
              label="Unique Visitors"
              value={data.uniqueVisitorsToday}
              detail={`${range.label} · distinct anonymous sessions.`}
              tone="success"
            />
            <AdminMetricCard
              label="Events"
              value={data.eventsToday}
              detail={`${range.label} · approved public analytics events.`}
            />
            <AdminMetricCard
              label="Page Views"
              value={data.pageViewsToday}
              detail={`${range.label} · public page-view events.`}
            />
            <AdminMetricCard
              label="Tool Opens"
              value={data.toolOpens}
              detail={`${range.label} · tool workspaces opened.`}
              tone="success"
            />
            <AdminMetricCard
              label="Most Opened Tool"
              value={mostOpenedTool?.toolSlug ?? "N/A"}
              detail={
                mostOpenedTool
                  ? `${mostOpenedTool.count} opens in ${range.label.toLowerCase()}.`
                  : "No tool-open events in this range."
              }
              tone="gold"
            />
          </section>

          <AdminSectionCard
            title="Operation analytics"
            description={`Processing lifecycle metrics for ${range.label.toLowerCase()}.`}
          >
            <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <AdminMetricCard
                label="Processing Started"
                value={data.processingStarted}
                detail="Conversions started in the selected range."
              />
              <AdminMetricCard
                label="Processing Succeeded"
                value={data.processingSucceeded}
                detail="Conversions completed successfully."
                tone="success"
              />
              <AdminMetricCard
                label="Processing Failed"
                value={data.processingFailed}
                detail="Conversions that reported a failure."
                tone={data.processingFailed > 0 ? "warning" : "neutral"}
              />
              <AdminMetricCard
                label="Success Rate"
                value={data.successRate === null ? "N/A" : `${data.successRate}%`}
                detail="Succeeded ÷ (succeeded + failed)."
                tone="gold"
              />
              <AdminMetricCard
                label="Downloads Started"
                value={data.downloadsStarted}
                detail="Output downloads started in the selected range."
              />
            </section>
            {data.averageDurationMs !== null ? (
              <p className="mt-4 text-sm leading-6 text-[#F0EAD6]/62">
                Average successful processing time:{" "}
                <span className="font-semibold text-[#F0EAD6]">
                  {(data.averageDurationMs / 1000).toFixed(1)}s
                </span>
              </p>
            ) : null}
          </AdminSectionCard>
        </>
      )}

      {!unavailable && noData ? (
        <AdminEmptyState
          title="No analytics events in this range"
          description="This is a valid empty result, not an application failure. Choose another period or wait for new public activity."
        />
      ) : null}

      {!unavailable ? (
        <>
          <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <AnalyticsTrendChart
              points={data.sevenDayTotals}
              rangeLabel={range.label}
            />
            <AdminSectionCard
              title="Collection status"
              description="Only approved privacy-preserving operational signals are shown."
            >
              <div className="space-y-3 text-sm leading-6 text-[#F0EAD6]/62">
                <p>
                  Latest event in selected range:{" "}
                  <span className="font-semibold text-[#F0EAD6]">
                    {formatDate(data.latestEventAt)}
                  </span>
                </p>
                <p>
                  Active metrics: unique visitors, page views, tool opens,
                  processing lifecycle, top tools, device class, browser
                  family, operating-system family, error categories, and
                  approximate network-derived location.
                </p>
              </div>
            </AdminSectionCard>
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <AnalyticsBarList
              title="Unique visitors by day"
              items={data.sevenDayTotals.map((item) => ({
                label: item.date,
                value: item.uniqueVisitors,
              }))}
            />
            <AnalyticsBarList
              title="Page views by day"
              items={data.sevenDayTotals.map((item) => ({
                label: item.date,
                value: item.pageViews,
              }))}
            />
            <AnalyticsBarList
              title="Tool opens by day"
              items={data.sevenDayTotals.map((item) => ({
                label: item.date,
                value: item.toolOpens,
              }))}
            />
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <AnalyticsBarList
              title="Top tools by opens"
              items={data.topToolsByOpens.map((item) => ({
                label: item.toolSlug,
                value: item.count,
              }))}
            />
            <AnalyticsBarList
              title="Top tools by successful conversion"
              items={data.topToolsBySuccess.map((item) => ({
                label: item.toolSlug,
                value: item.count,
              }))}
            />
          </section>

          <AdminSectionCard
            title="Daily activity table"
            description={`Selected IST calendar days for ${range.label.toLowerCase()}. Operation lifecycle totals are included in the cards above.`}
          >
            <AdminDataTable
              columns={["Date", "Unique Visitors", "Page Views", "Tool Opens", "Events"]}
              rows={data.sevenDayTotals.map((metric) => [
                metric.date,
                metric.uniqueVisitors,
                metric.pageViews,
                metric.toolOpens,
                metric.events,
              ])}
              empty={
                <AdminEmptyState
                  title="No daily analytics in this range"
                  description="No approved analytics events were recorded for the selected calendar days."
                />
              }
            />
          </AdminSectionCard>

          <section className="grid gap-4 lg:grid-cols-3">
            <AnalyticsBarList
              title="Device class"
              items={data.deviceSummary.map((item) => ({
                label: item.label,
                value: item.count,
              }))}
            />
            <AnalyticsBarList
              title="Browser family"
              items={data.browserSummary.map((item) => ({
                label: item.label,
                value: item.count,
              }))}
            />
            <AnalyticsBarList
              title="Operating system"
              items={data.osSummary.map((item) => ({
                label: item.label,
                value: item.count,
              }))}
            />
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <AnalyticsBarList
              title="Approximate visitor locations"
              items={data.locationSummary.map((item) => ({
                label: item.label,
                value: item.count,
              }))}
              emptyText="No approximate network-derived location data is available for this range."
            />
            <AnalyticsBarList
              title="Error categories"
              items={data.errorSummary.map((item) => ({
                label: item.errorCode,
                value: item.count,
              }))}
              emptyText="No analytics error categories were recorded in this range."
            />
          </section>

          <AdminSectionCard
            title="Recent activity"
            description="Latest public events, newest first. This live feed is independent of the selected aggregate range and is capped at 200 events. Location is approximate network-derived data only; no session id, IP address, or precise coordinates are displayed."
          >
            {recentEvents.error ? (
              <AdminEmptyState
                title="Recent activity is unavailable"
                description="Aggregate analytics are still valid, but the recent-events reader could not return verified rows."
              />
            ) : (
              <>
                <RecentActivityTable
                  rows={activityRows.slice(0, RECENT_ACTIVITY_PREVIEW_SIZE)}
                />
                {activityRows.length > RECENT_ACTIVITY_PREVIEW_SIZE ? (
                  <div className="mt-4 text-right">
                    <Link
                      href="/admin/analytics/activity"
                      className="text-sm font-bold text-[var(--text-accent)] hover:underline"
                    >
                      View full activity log →
                    </Link>
                  </div>
                ) : null}
              </>
            )}
          </AdminSectionCard>
        </>
      ) : null}
    </div>
  );
}
