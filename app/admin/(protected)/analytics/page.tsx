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
    getVerifiedRecentEvents(100, "real_audience"),
    getVerifiedLiveTraffic("real_audience"),
  ]);

  const data = verified.data;
  const unavailable = !data;
  const summary = data?.summary;
  const noData = Boolean(data && summary?.pageViews === 0 && data.integrity.verifiedEvents === 0);

  const completed =
    (summary?.processingSucceeded ?? 0) + (summary?.processingFailed ?? 0);
  const successRate =
    completed > 0
      ? Math.round(((summary?.processingSucceeded ?? 0) / completed) * 1000) / 10
      : null;
  const unreconciled = Math.max(
    0,
    (summary?.processingStarted ?? 0) -
      (summary?.processingSucceeded ?? 0) -
      (summary?.processingFailed ?? 0) -
      (summary?.processingCancelled ?? 0),
  );

  return (
    <div className="min-w-0 max-w-full space-y-7">
      <AdminPageHeader
        eyebrow="Analytics"
        title="Verified traffic analytics"
        description="Real audience analytics only: verified visitors, sessions, page views, live hits, tool usage and approximate Cloudflare network geography."
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
        description="All verified metrics below use the same Asia/Kolkata calendar-day boundaries."
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
            <input
              type="date"
              name="start"
              defaultValue={params.start ?? range.startDate}
              max={maxDate}
              className="mt-2 min-h-11 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-input)] px-3 text-base text-[var(--text-primary)] sm:text-sm"
            />
          </label>
          <label className="text-xs font-semibold text-[var(--text-secondary)]">
            Custom end (IST)
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
          description="The server-verified aggregate could not be read. Legacy browser analytics are intentionally not substituted because they mix real users with test and automation traffic."
        />
      ) : (
        <>
          {data.integrity.verifiedEvents === 0 ? (
            <AdminEmptyState
              title="Verified analytics cutover has no events yet"
              description="The verified schema-v2 pipeline is ready, but this selected range contains no server-verified events yet. Legacy rows remain historical evidence and are not promoted into real-audience metrics."
            />
          ) : null}

          <section
            aria-label="Verified traffic metrics"
            className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
          >
            <AdminMetricCard
              label="Unique Visitors"
              value={summary!.uniqueVisitors}
              detail="Persistent privacy-safe visitor pseudonyms with page views in this range."
              tone="success"
            />
            <AdminMetricCard
              label="Sessions"
              value={summary!.sessions}
              detail="Distinct 30-minute first-party sessions with page views."
            />
            <AdminMetricCard
              label="Page Views"
              value={summary!.pageViews}
              detail="Verified page-view events for real audience."
              tone="gold"
            />
            <AdminMetricCard
              label="Tool Opens"
              value={summary!.toolOpens}
              detail="Verified tool workspace opens."
            />
          </section>

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.6fr)]">
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
              title="Location integrity"
              description="Known location requires Cloudflare-verified country + region + city. Anything less remains unknown."
            >
              <dl className="space-y-4 text-sm">
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
            </AdminSectionCard>
          </section>

          {noData ? (
            <AdminEmptyState
              title="No verified traffic in this range"
              description="This is a genuine zero for real audience."
            />
          ) : null}

          <AdminSectionCard
            title="Top Locations"
            description="Ranked by verified page views. Location is approximate network geography from Cloudflare, not GPS and never a precise address."
          >
            <AdminDataTable
              columns={["Location", "Page views", "Visitors", "Sessions"]}
              rows={[
                ...data.locations.map((row) => [
                  formatLocationLabel(
                    row.city,
                    row.regionCode ?? row.region,
                    row.countryCode,
                  ),
                  row.pageViews,
                  row.visitors,
                  row.sessions,
                ]),
                ...(summary!.unknownLocationPageViews > 0
                  ? [[
                      "Unknown Location",
                      summary!.unknownLocationPageViews,
                      "—",
                      "—",
                    ]]
                  : []),
              ]}
              empty={
                <AdminEmptyState
                  title="No verified city-level locations"
                  description="Page views without complete Cloudflare city, region and country data remain in Unknown Location rather than being guessed."
                />
              }
            />
          </AdminSectionCard>

          <AdminSectionCard
            title="Geography drill-down"
            description="Country, region and city rankings are derived only from verified page-view events."
          >
            <div className="grid gap-4 lg:grid-cols-3">
              <AnalyticsBarList
                title="Countries by page views"
                items={data.countries.slice(0, 12).map((row) => ({
                  label: formatLocationLabel(null, null, row.countryCode),
                  value: row.pageViews,
                }))}
              />
              <AnalyticsBarList
                title="Regions by page views"
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
                title="Cities by page views"
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
          </AdminSectionCard>

          <AdminSectionCard
            title="Page performance"
            description="Verified discovery traffic by public path."
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
                  title="No verified page traffic"
                  description="No verified page views were recorded in this range."
                />
              }
            />
          </AdminSectionCard>

          <AdminSectionCard
            title="Operation analytics"
            description="Conversion lifecycle metrics stay separated from visitor counting."
          >
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <AdminMetricCard
                label="Processing Started"
                value={summary!.processingStarted}
                detail="Verified processing attempts started."
              />
              <AdminMetricCard
                label="Processing Succeeded"
                value={summary!.processingSucceeded}
                detail="Usable outputs created."
                tone="success"
              />
              <AdminMetricCard
                label="Processing Failed"
                value={summary!.processingFailed}
                detail="Approved failure events."
                tone={summary!.processingFailed ? "danger" : "neutral"}
              />
              <AdminMetricCard
                label="Processing Cancelled"
                value={summary!.processingCancelled}
                detail="Explicit cancellation terminal outcomes."
              />
              <AdminMetricCard
                label="No terminal event"
                value={unreconciled}
                detail="Started minus succeeded, failed and cancelled."
                tone={unreconciled ? "warning" : "neutral"}
              />
              <AdminMetricCard
                label="Success Rate"
                value={successRate === null ? "N/A" : `${successRate}%`}
                detail="Succeeded ÷ succeeded+failed."
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
                detail="Successful processing events only."
              />
            </section>
            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              <AnalyticsBarList
                title="Error categories"
                items={data.errorSummary.map((item) => ({
                  label: item.label,
                  value: item.count,
                }))}
              />
              <AnalyticsBarList
                title="Failure stages"
                items={data.failureStageSummary.map((item) => ({
                  label: item.label,
                  value: item.count,
                }))}
              />
              <AnalyticsBarList
                title="Cancellation stages"
                items={data.cancellationStageSummary.map((item) => ({
                  label: item.label,
                  value: item.count,
                }))}
              />
            </div>
          </AdminSectionCard>

          <AdminSectionCard
            title="Tool performance"
            description="Verified opens and successful processing only."
          >
            <div className="grid gap-4 lg:grid-cols-2">
              <AnalyticsBarList
                title="Top tools by opens"
                items={data.topToolsByOpens.map((item) => ({
                  label: item.toolSlug,
                  value: item.count,
                }))}
              />
              <AnalyticsBarList
                title="Tools by successful processing"
                items={data.topToolsBySuccess.map((item) => ({
                  label: item.toolSlug,
                  value: item.count,
                }))}
              />
            </div>
          </AdminSectionCard>

          <AdminSectionCard
            title="Audience environment"
            description="Technical breakdowns count distinct verified visitor pseudonyms rather than raw event volume."
          >
            <div className="grid gap-4 md:grid-cols-3">
              <AnalyticsBarList
                title="Device class"
                items={data.deviceSummary.map((item) => ({
                  label: item.label,
                  value: item.visitors,
                }))}
              />
              <AnalyticsBarList
                title="Browser family"
                items={data.browserSummary.map((item) => ({
                  label: item.label,
                  value: item.visitors,
                }))}
              />
              <AnalyticsBarList
                title="Operating system"
                items={data.osSummary.map((item) => ({
                  label: item.label,
                  value: item.visitors,
                }))}
              />
            </div>
          </AdminSectionCard>

          <AdminSectionCard
            title="Data integrity"
            description="Schema-v1 data is retained for audit history but excluded from verified visitor and location metrics."
          >
            <dl className="grid gap-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
              <div>
                <dt className="text-[var(--text-muted)]">Verified events in range</dt>
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
            </dl>
          </AdminSectionCard>

          <AdminSectionCard
            title="Recent verified activity"
            description="Newest verified events for real audience. No visitor/session key, raw IP, precise coordinate, filename or document content is displayed."
          >
            {recent.error ? (
              <AdminEmptyState
                title="Recent verified activity is unavailable"
                description="The aggregate above remains valid."
              />
            ) : (
              <AdminDataTable
                columns={["Time (IST)", "Event", "Page / tool", "Location", "Device"]}
                rows={recent.data.slice(0, 25).map((event) => [
                  formatAdminDateTime(event.occurredAt, "medium"),
                  event.eventName,
                  event.toolSlug ?? event.pagePath ?? "—",
                  formatLocationLabel(
                    event.city,
                    event.regionCode ?? event.region,
                    event.countryCode,
                  ),
                  `${event.deviceClass} · ${event.browserFamily} · ${event.operatingSystem}`,
                ])}
                empty={
                  <AdminEmptyState
                    title="No recent verified activity"
                    description="Verified activity will appear after the cutover begins receiving events."
                  />
                }
              />
            )}
          </AdminSectionCard>
        </>
      )}
    </div>
  );
}
