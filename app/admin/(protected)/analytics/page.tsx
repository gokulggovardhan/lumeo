import { AdminDataTable } from "@/components/admin/AdminDataTable";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminMetricCard } from "@/components/admin/AdminMetricCard";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminSectionCard } from "@/components/admin/AdminSectionCard";
import { AnalyticsBarList } from "@/components/admin/analytics/AnalyticsBarList";
import { AnalyticsPrivacyNotice } from "@/components/admin/analytics/AnalyticsPrivacyNotice";
import Link from "next/link";
import { AnalyticsTrendChart } from "@/components/admin/analytics/AnalyticsTrendChart";
import { RecentActivityTable, RECENT_ACTIVITY_PREVIEW_SIZE } from "@/components/admin/analytics/RecentActivityTable";
import { collapseUnknownLocationRuns, getAnalyticsSummary, getRecentAnalyticsEvents } from "@/lib/admin/data";

function formatDate(value: string | null) {
  return value
    ? new Date(value).toLocaleString("en", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "None yet";
}

export default async function AnalyticsPage() {
  const [summary, recentEvents] = await Promise.all([
    getAnalyticsSummary(),
    getRecentAnalyticsEvents(200),
  ]);
  const data = summary.data;
  const activityRows = collapseUnknownLocationRuns(recentEvents.data);
  const unavailable = data.dataStatus === "unavailable";
  const mostOpenedTool = data.topToolsByOpens[0];
  const noData = data.eventsToday === 0 && data.sevenDayTotals.length === 0;

  return (
    <div className="space-y-7">
      <AdminPageHeader
        eyebrow="Analytics V1"
        title="Discovery & operation analytics"
        description="Privacy-preserving public signals for page visits, tool discovery, and processing outcomes across every PDF tool."
      />
      <AnalyticsPrivacyNotice />

      {unavailable ? (
        <AdminEmptyState
          title="Analytics aggregates are unavailable"
          description="The secure admin aggregate reader could not return verified data. These cards are hidden to avoid showing misleading zero metrics."
        />
      ) : (
        <>
          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <AdminMetricCard
              label="Unique Visitors Today"
              value={data.uniqueVisitorsToday}
              detail="Distinct anonymous sessions seen today."
              tone="success"
            />
            <AdminMetricCard
              label="Events Today"
              value={data.eventsToday}
              detail="All approved public analytics events today."
            />
            <AdminMetricCard
              label="Page Views Today"
              value={data.pageViewsToday}
              detail="Public page-view events today."
            />
            <AdminMetricCard
              label="Tool Opens Today"
              value={data.toolOpens}
              detail="PDF tool workspaces opened today."
              tone="success"
            />
            <AdminMetricCard
              label="Most Opened Tool"
              value={mostOpenedTool?.toolSlug ?? "N/A"}
              detail={
                mostOpenedTool
                  ? `${mostOpenedTool.count} opens in the selected range.`
                  : "No tool-open events yet."
              }
              tone="gold"
            />
          </section>

          <AdminSectionCard
            title="Operation analytics"
            description="Processing lifecycle metrics from every PDF tool, today."
          >
            <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <AdminMetricCard
                label="Processing Started"
                value={data.processingStarted}
                detail="Conversions started today."
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
                detail="Conversions that errored."
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
                detail="Output files saved today."
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
          title="No discovery events yet"
          description="Analytics will appear after collection is enabled and public pages record real page-view or tool-open events."
        />
      ) : null}

      {!unavailable ? (
        <>
          <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <AnalyticsTrendChart points={data.sevenDayTotals} />
            <AdminSectionCard
              title="Collection status"
              description="Analytics V1 reports discovery and operation signals."
            >
              <div className="space-y-3 text-sm leading-6 text-[#F0EAD6]/62">
                <p>
                  Latest event:{" "}
                  <span className="font-semibold text-[#F0EAD6]">
                    {formatDate(data.latestEventAt)}
                  </span>
                </p>
                <p>
                  Active metrics: unique visitors, page views, tool opens,
                  processing lifecycle, top tools, device class, browser
                  family, operating-system family, and seven-day discovery
                  trend.
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

          <section className="grid gap-4 lg:grid-cols-1">
            <AdminSectionCard
              title="Seven-day activity table"
              description="Discovery events only. Operation lifecycle metrics are planned."
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
                    title="No discovery trend yet"
                    description="Page-view and tool-open rows will appear after public analytics collection is enabled."
                  />
                }
              />
            </AdminSectionCard>
          </section>

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

          <section className="grid gap-4 lg:grid-cols-1">
            <AnalyticsBarList
              title="Top locations"
              items={data.locationSummary.map((item) => ({
                label: item.label,
                value: item.count,
              }))}
              emptyText="No location data yet. Run migration 20260719017_analytics_location.sql to enable."
            />
          </section>

          <AdminSectionCard
            title="Recent activity"
            description="Most recent events, newest first, with the approximate location behind each click. Never includes a session id, IP address, or precise coordinates."
          >
            <RecentActivityTable rows={activityRows.slice(0, RECENT_ACTIVITY_PREVIEW_SIZE)} />
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
          </AdminSectionCard>
        </>
      ) : null}
    </div>
  );
}
