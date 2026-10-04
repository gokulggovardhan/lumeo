import Link from "next/link";
import { AdminDataTable } from "@/components/admin/AdminDataTable";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminSectionCard } from "@/components/admin/AdminSectionCard";
import { pageNumber } from "@/lib/admin/pagination";
import { formatAdminDateTime } from "@/lib/admin/timezone";
import {
  getVerifiedRecentEvents,
  type VerifiedTrafficScope,
} from "@/lib/admin/verified-analytics";
import { formatLocationLabel } from "@/lib/analytics/location-names";

const PAGE_SIZE = 25;

function parseTrafficScope(value: string | undefined): VerifiedTrafficScope {
  return value === "synthetic" || value === "automation" || value === "all"
    ? value
    : "real_audience";
}

function trafficLabel(scope: VerifiedTrafficScope) {
  if (scope === "real_audience") return "Real audience";
  if (scope === "synthetic") return "Lumeo synthetic tests";
  if (scope === "automation") return "Bots & suspected automation";
  return "All verified traffic";
}

function hrefFor(page: number, scope: VerifiedTrafficScope) {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (scope !== "real_audience") params.set("traffic", scope);
  const query = params.toString();
  return query ? `/admin/analytics/activity?${query}` : "/admin/analytics/activity";
}

export default async function AnalyticsActivityPage({
  searchParams,
}: {
  searchParams?: Promise<{ page?: string; traffic?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const page = pageNumber(params.page);
  const trafficScope = parseTrafficScope(params.traffic);
  const recentEvents = await getVerifiedRecentEvents(200, trafficScope);

  if (recentEvents.error) {
    return (
      <div className="space-y-7">
        <AdminPageHeader
          eyebrow="Analytics"
          title="Verified activity log"
          description="Recent schema-v2 events only. Legacy browser analytics is excluded."
        />
        <AdminEmptyState
          title="Verified activity is unavailable"
          description="The secure verified event reader could not return data."
        />
        <Link
          href="/admin/analytics"
          prefetch={false}
          className="text-sm font-semibold text-[var(--text-secondary)] hover:underline"
        >
          ← Back to analytics
        </Link>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(recentEvents.data.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const rows = recentEvents.data.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  return (
    <div className="space-y-7">
      <AdminPageHeader
        eyebrow="Analytics"
        title="Verified activity log"
        description={`${trafficLabel(trafficScope)} · newest verified events first · capped at 200 events.`}
      />

      <AdminSectionCard
        title={`Page ${safePage} of ${totalPages}`}
        description="No visitor/session key, raw IP, precise coordinate, filename or document content is exposed."
      >
        <AdminDataTable
          columns={["Time (IST)", "Event", "Page / tool", "Location", "Device"]}
          rows={rows.map((event) => [
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
              title="No verified recent activity"
              description="Events will appear after the verified server-side analytics cutover receives traffic."
            />
          }
        />

        <div className="mt-4 flex items-center justify-between gap-3">
          <Link
            href={trafficScope === "real_audience" ? "/admin/analytics" : `/admin/analytics?traffic=${trafficScope}`}
            prefetch={false}
            className="text-sm font-semibold text-[var(--text-secondary)] hover:underline"
          >
            ← Back to analytics
          </Link>
          <div className="flex gap-3">
            {safePage > 1 ? (
              <Link
                className="rounded-xl border border-[var(--border-subtle)] px-4 py-2 text-sm font-semibold"
                href={hrefFor(safePage - 1, trafficScope)}
                prefetch={false}
              >
                Previous
              </Link>
            ) : null}
            {safePage < totalPages ? (
              <Link
                className="rounded-xl border border-[var(--border-subtle)] px-4 py-2 text-sm font-semibold"
                href={hrefFor(safePage + 1, trafficScope)}
                prefetch={false}
              >
                Next
              </Link>
            ) : null}
          </div>
        </div>
      </AdminSectionCard>
    </div>
  );
}
