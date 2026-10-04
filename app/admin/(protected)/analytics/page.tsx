import Link from "next/link";
import { AdminDataTable } from "@/components/admin/AdminDataTable";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminMetricCard } from "@/components/admin/AdminMetricCard";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminSectionCard } from "@/components/admin/AdminSectionCard";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { AnalyticsBarList } from "@/components/admin/analytics/AnalyticsBarList";
import { AnalyticsPrivacyNotice } from "@/components/admin/analytics/AnalyticsPrivacyNotice";
import { AnalyticsTrendChart } from "@/components/admin/analytics/AnalyticsTrendChart";
import { LiveTrafficPanel } from "@/components/admin/analytics/LiveTrafficPanel";
import { resolveAnalyticsRange } from "@/lib/admin/analytics-range";
import { formatAdminDateTime, istIsoDate } from "@/lib/admin/timezone";
import {
  getVerifiedLiveTraffic,
  getVerifiedRecentEvents,
  getVerifiedTraffic,
} from "@/lib/admin/verified-analytics";
import { formatLocationLabel } from "@/lib/analytics/location-names";

function formatDate(value: string | null) {
  return value ? formatAdminDateTime(value) : "None yet";
}

function formatDuration(value: number | null) {
  if (value === null) return "N/A";
  return value < 1000
    ? `${Math.round(value)}ms`
    : `${(value / 1000).toFixed(1)}s`;
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
  const range = resolveAnalyticsRange(params, new Date());
  const maxDate = istIsoDate();

  const [verified, recent, live] = await Promise.all([
    getVerifiedTraffic(
      { startDate: range.startDate, endDate: range.endDate },
      "real_audience",
    ),
    getVerifiedRecentEvents(40, "real_audience"),
    getVerifiedLiveTraffic("real_audience"),
  ]);

  const data = verified.data;
  const unavailable = !data;
  const summary = data?.summary;
  const noPageViews = Boolean(data && summary?.pageViews === 0);

  const completed =
    (summary?.processingSucceeded ?? 0) + (summary?.processingFailed ?? 0);
  const successRate =
    completed > 0
      ? Math.round(((summary?.processingSucceeded ?? 0) / completed) * 1000) / 10
      : null;

  const hasFailureBreakdown = Boolean(
    data &&
      (data.errorSummary.length > 0 ||
        data.failureStageSummary.length > 0 ||
        data.cancellationStageSummary.length > 0),
  );

  return (
    <div className="min-w-0 max-w-full space-y-7">
      <AdminPageHeader
        eyebrow="Analytics"
        title="Verified traffic analytics"
        description="Real Audience only: live hits, verified visitors, sessions, page views, tool usage and approximate Cloudflare network geography."
        meta={
          <Link
            href="/admin/analytics/activity"
            prefetch={false}
            className="inline-flex min-h-11 items-center rounded-xl border border-[var(--border-subtle)] px-4 text-sm font-semibold text-[var(--text-secondary)] hover:border-[var(--border-premium)] hover:text-[var(--text-primary)]"
          >
            Activity log
          </Link>
        }
      />

      <AnalyticsPrivacyNotice />

      <LiveTrafficPanel
        initialData={live.data}
        initialError={live.error}
      />

      <AdminSectionCard
        title="Date range"
        description="All non-live analytics below use the same IST calendar-day boundaries. Live Traffic always keeps its rolling realtime windows."
      >
        <form
          action="/admin/analytics"
          method="get"
          className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
        >
          <label className="text-xs font-semibold text-[var(--text-secondary)]">
            Range
            <select
              name="range"
              defaultValue={range.key}
              className="mt-2 min-h-11 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-input)] px-3 text-base text-[var(--text-primary)] sm:text-sm"
            >
              <option value="today">Today</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="custom">Custom</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-[var(--text-secondary)]">
            Custom start
            <input
              type="date"
              name="start"
              defaultValue={params.start ?? range.startDate}
              max={maxDate}
              className="mt-2 min-h-11 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-input)] px-3 text-base text-[var(--text-primary)] sm:text-sm"
            />
          </label>
          <label className="text-xs font-semibold text-[var(--text-secondary)]">
            Custom end
            <input
              type="date"
              name="end"
              defaultValue={params.end ?? range.endDate}
              max={maxDate}
              className="mt-2 min-h-11 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-input)] px-3 text-base text-[var(--text-primary)] sm:text-sm"
            />
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              className="min-h-11 w-full rounded-xl bg-[var(--action-primary)] px-5 text-sm font-bold text-[var(--text-on-accent)] transition hover:bg-[var(--action-primary-hover)] lg:w-auto"
            >
              Apply
            </button>
          </div>
        </form>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
          <AdminStatusBadge tone="gold">Real Audience</AdminStatusBadge>
          <AdminStatusBadge tone="gold">Selected: {range.label}</AdminStatusBadge>
          <span>{range.startDate} to {range.endDate}</span>
          {data?.asOf ? (
            <span>· Last updated {formatAdminDateTime(data.asOf, "medium")}</span>
          ) : null}
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
          description="Unable to refresh analytics. Legacy browser analytics are intentionally not substituted."
        />
      ) : (
        <>
          {data.integrity.reconciliationIssue ? (
            <div className="rounded-2xl border border-[rgba(var(--lumeo-gold-rgb),0.34)] bg-[rgba(var(--lumeo-gold-rgb),0.09)] px-4 py-3 text-sm text-[var(--text-secondary)]">
              <strong className="text-[var(--text-primary)]">
                Data reconciliation issue detected.
              </strong>{" "}
              Uncorrelated historical lifecycle events are excluded from primary
              processing metrics. Current visitor/location metrics remain verified.
            </div>
          ) : null}

          <AdminSectionCard
            title="Real Audience"
            description="Verified people and browsing activity for the selected range."
          >
            <section
              aria-label="Real Audience metrics"
              className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
            >
              <AdminMetricCard
                label="Unique Visitors"
                value={summary!.uniqueVisitors}
                detail="Distinct verified visitor pseudonyms with page views."
                definition="A privacy-safe persistent first-party pseudonym counted once in the selected range when it has a verified page view."
                tone="success"
              />
              <AdminMetricCard
                label="Sessions"
                value={summary!.sessions}
                detail="Distinct verified 30-minute browsing sessions."
                definition="A privacy-safe first-party session pseudonym. The session cookie expires after 30 minutes."
              />
              <AdminMetricCard
                label="Page Views"
                value={summary!.pageViews}
                detail="Verified Real Audience page-view events."
                tone="gold"
              />
              <AdminMetricCard
                label="Tool Opens"
                value={summary!.toolOpens}
                detail="Verified tool workspace opens."
                definition="A verified tool_opened event. Opening a tool is separate from successfully completing processing."
              />
            </section>

            {noPageViews ? (
              <div className="mt-4">
                <AdminEmptyState
                  title="No verified page views in this period"
                  description="This is a genuine zero for Real Audience."
                />
              </div>
            ) : null}
          </AdminSectionCard>

          <AnalyticsTrendChart
            rangeLabel={range.label}
            points={data.daily.map((point) => ({
              date: point.date,
              pageViews: point.pageViews,
              uniqueVisitors: point.uniqueVisitors,
              sessions: point.sessions,
            }))}
          />

          <AdminSectionCard
            title="Geography"
            description="Approximate Cloudflare network geography for verified page views only. No GPS, exact coordinates or addresses."
          >
            <div className="grid gap-5 xl:grid-cols-[minmax(16rem,0.55fr)_minmax(0,1.45fr)]">
              <div className="rounded-xl border border-[var(--border-hairline)] p-4">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                  Location integrity
                </h3>
                <dl className="mt-4 space-y-4 text-sm">
                  <div>
                    <dt className="text-[var(--text-muted)]">Known-location page views</dt>
                    <dd className="mt-1 font-semibold text-[var(--text-primary)]">
                      {summary!.knownLocationPageViews}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[var(--text-muted)]">Unknown-location page views</dt>
                    <dd className="mt-1 font-semibold text-[var(--text-primary)]">
                      {summary!.unknownLocationPageViews}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[var(--text-muted)]">Coverage</dt>
                    <dd className="mt-1 font-semibold text-[var(--text-primary)]">
                      {data.integrity.locationCoveragePercent === null
                        ? "N/A"
                        : `${data.integrity.locationCoveragePercent}%`}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[var(--text-muted)]">Reconciliation</dt>
                    <dd className="mt-1 font-semibold text-[var(--text-primary)]">
                      {summary!.knownLocationPageViews + summary!.unknownLocationPageViews} = {summary!.pageViews} page views
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="grid min-w-0 gap-4 lg:grid-cols-3">
                <AnalyticsBarList
                  title="Countries"
                  emptyText="No verified country data in this period."
                  items={data.countries.slice(0, 12).map((row) => ({
                    label: formatLocationLabel(null, null, row.countryCode),
                    value: row.pageViews,
                  }))}
                />
                <AnalyticsBarList
                  title="Regions"
                  emptyText="No verified region data in this period."
                  items={data.regions.slice(0, 12).map((row) => ({
                    label: formatLocationLabel(
                      null,
                      row.regionCode ?? row.region,
                      row.countryCode,
                    ),
                    value: row.pageViews,
                  }))}
                />
                <AnalyticsBarList
                  title="Cities"
                  emptyText="No verified city data in this period."
                  items={data.cities.slice(0, 12).map((row) => ({
                    label: formatLocationLabel(
                      row.city,
                      row.regionCode ?? row.region,
                      row.countryCode,
                    ),
                    value: row.pageViews,
                  }))}
                />
              </div>
            </div>
          </AdminSectionCard>

          <AdminSectionCard
            title="Page performance"
            description="Verified Real Audience traffic by public path for the selected range."
          >
            <AdminDataTable
              columns={["Page", "Page views", "Visitors", "Sessions"]}
              rows={data.topPages.map((row) => [
                row.pagePath,
                row.pageViews,
                row.visitors,
                row.sessions,
              ])}
              empty={
                <AdminEmptyState
                  title="No verified page views in this period"
                  description="Page performance will appear when Real Audience page views are recorded."
                />
              }
            />
          </AdminSectionCard>

          <AdminSectionCard
            title="Tool usage"
            description="Tool opening and successful processing remain separate business actions."
          >
            <div className="grid gap-4 lg:grid-cols-2">
              <AnalyticsBarList
                title="Top tools by opens"
                emptyText="No tool activity in this period."
                items={data.topToolsByOpens.map((item) => ({
                  label: item.toolSlug,
                  value: item.count,
                }))}
              />
              <AnalyticsBarList
                title="Tools by successful processing"
                emptyText="No successful processing in this period."
                items={data.topToolsBySuccess.map((item) => ({
                  label: item.toolSlug,
                  value: item.count,
                }))}
              />
            </div>
          </AdminSectionCard>

          <AdminSectionCard
            title="Operation analytics"
            description="Processing metrics use correlated server-assigned attempt IDs. Historical uncorrelated events are excluded."
          >
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <AdminMetricCard
                label="Processing Started"
                value={summary!.processingStarted}
                detail="Correlated processing attempts started in this range."
              />
              <AdminMetricCard
                label="Processing Succeeded"
                value={summary!.processingSucceeded}
                detail="Correlated attempts with a success terminal event."
                tone="success"
              />
              <AdminMetricCard
                label="Processing Failed"
                value={summary!.processingFailed}
                detail="Correlated attempts with a failure terminal event."
                tone={summary!.processingFailed ? "danger" : "neutral"}
              />
              <AdminMetricCard
                label="Processing Cancelled"
                value={summary!.processingCancelled}
                detail="Correlated attempts explicitly cancelled."
              />
              <AdminMetricCard
                label="No terminal event"
                value={summary!.unfinishedAttempts}
                detail="Started attempts with no correlated terminal event in this range."
                tone={summary!.unfinishedAttempts ? "warning" : "neutral"}
              />
              <AdminMetricCard
                label="Success Rate"
                value={successRate === null ? "N/A" : `${successRate}%`}
                detail="Succeeded ÷ (succeeded + failed)."
                definition="Calculated only from correlated succeeded and failed attempts. Cancelled and unfinished attempts are not included."
                tone="gold"
              />
              <AdminMetricCard
                label="Downloads Started"
                value={summary!.downloadsStarted}
                detail="Verified output download initiations."
              />
              <AdminMetricCard
                label="Average Duration"
                value={formatDuration(summary!.averageSuccessfulDurationMs)}
                detail="Correlated successful processing attempts only."
              />
            </section>

            {hasFailureBreakdown ? (
              <div className="mt-4 grid gap-4 lg:grid-cols-3">
                {data.errorSummary.length > 0 ? (
                  <AnalyticsBarList
                    title="Error categories"
                    items={data.errorSummary.map((item) => ({
                      label: item.label,
                      value: item.count,
                    }))}
                  />
                ) : null}
                {data.failureStageSummary.length > 0 ? (
                  <AnalyticsBarList
                    title="Failure stages"
                    items={data.failureStageSummary.map((item) => ({
                      label: item.label,
                      value: item.count,
                    }))}
                  />
                ) : null}
                {data.cancellationStageSummary.length > 0 ? (
                  <AnalyticsBarList
                    title="Cancellation stages"
                    items={data.cancellationStageSummary.map((item) => ({
                      label: item.label,
                      value: item.count,
                    }))}
                  />
                ) : null}
              </div>
            ) : (
              <p className="mt-4 text-sm text-[var(--text-muted)]">
                No processing failures or cancellations in this period.
              </p>
            )}
          </AdminSectionCard>

          <AdminSectionCard
            title="Audience environment"
            description="Each verified visitor is assigned once per dimension using their latest page-view environment in the selected range."
          >
            {!data.integrity.environmentReconciles ? (
              <p className="mb-4 rounded-xl border border-[rgba(var(--lumeo-gold-rgb),0.28)] bg-[rgba(var(--lumeo-gold-rgb),0.08)] px-3 py-2 text-sm text-[var(--text-secondary)]">
                Data reconciliation issue detected for audience environment.
              </p>
            ) : null}
            <div className="grid gap-4 md:grid-cols-3">
              <AnalyticsBarList
                title="Device"
                emptyText="No verified visitors in this period."
                items={data.deviceSummary.map((item) => ({
                  label: item.label,
                  value: item.visitors,
                }))}
              />
              <AnalyticsBarList
                title="Browser"
                emptyText="No verified visitors in this period."
                items={data.browserSummary.map((item) => ({
                  label: item.label,
                  value: item.visitors,
                }))}
              />
              <AnalyticsBarList
                title="Operating system"
                emptyText="No verified visitors in this period."
                items={data.osSummary.map((item) => ({
                  label: item.label,
                  value: item.visitors,
                }))}
              />
            </div>
            <p className="mt-3 text-xs text-[var(--text-muted)]">
              Each dimension reconciles to {summary!.uniqueVisitors} verified unique visitors.
            </p>
          </AdminSectionCard>

          <AdminSectionCard
            title="Recent operational activity"
            description="Latest verified tool and processing events. Ordinary page views stay in Live Traffic and are not repeated here."
          >
            {recent.error ? (
              <AdminEmptyState
                title="Recent operational activity is unavailable"
                description="The selected-range aggregate above remains valid."
              />
            ) : (
              <AdminDataTable
                columns={["Time", "Event", "Tool", "Location", "Device"]}
                rows={recent.data.slice(0, 40).map((event) => [
                  formatAdminDateTime(event.occurredAt, "medium"),
                  event.eventName,
                  event.toolSlug ?? "—",
                  formatLocationLabel(
                    event.city,
                    event.regionCode ?? event.region,
                    event.countryCode,
                  ),
                  `${event.deviceClass} · ${event.browserFamily} · ${event.operatingSystem}`,
                ])}
                empty={
                  <AdminEmptyState
                    title="No recent operational activity"
                    description="Tool and processing events will appear here when they occur."
                  />
                }
              />
            )}
          </AdminSectionCard>

          <details className="rounded-2xl border border-[var(--border-hairline)] bg-[rgba(var(--lumeo-paper-rgb),0.018)]">
            <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-[var(--text-secondary)]">
              Data integrity / diagnostics
            </summary>
            <div className="border-t border-[var(--border-hairline)] px-4 py-4">
              <dl className="grid gap-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
                <div>
                  <dt className="text-[var(--text-muted)]">Verified events</dt>
                  <dd className="mt-1 font-semibold text-[var(--text-primary)]">
                    {data.integrity.verifiedEvents}
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--text-muted)]">Legacy events excluded</dt>
                  <dd className="mt-1 font-semibold text-[var(--text-primary)]">
                    {data.integrity.legacyEvents}
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--text-muted)]">Legacy page views excluded</dt>
                  <dd className="mt-1 font-semibold text-[var(--text-primary)]">
                    {data.integrity.legacyPageViews}
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--text-muted)]">Verified cutover</dt>
                  <dd className="mt-1 font-semibold text-[var(--text-primary)]">
                    {formatDate(data.integrity.cutoverAt)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--text-muted)]">Lifecycle reconciliation</dt>
                  <dd className="mt-1 font-semibold text-[var(--text-primary)]">
                    {data.integrity.lifecycleReconciles ? "OK" : "Needs attention"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--text-muted)]">Environment reconciliation</dt>
                  <dd className="mt-1 font-semibold text-[var(--text-primary)]">
                    {data.integrity.environmentReconciles ? "OK" : "Needs attention"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--text-muted)]">Uncorrelated lifecycle events</dt>
                  <dd className="mt-1 font-semibold text-[var(--text-primary)]">
                    {data.integrity.uncorrelatedProcessingEvents}
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--text-muted)]">Correlation cutover</dt>
                  <dd className="mt-1 font-semibold text-[var(--text-primary)]">
                    {formatDate(data.integrity.operationCorrelationCutoverAt)}
                  </dd>
                </div>
              </dl>
            </div>
          </details>
        </>
      )}
    </div>
  );
}
