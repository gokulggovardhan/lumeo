import Link from "next/link";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminSectionCard } from "@/components/admin/AdminSectionCard";
import { RecentActivityTable, RECENT_ACTIVITY_PAGE_SIZE } from "@/components/admin/analytics/RecentActivityTable";
import { collapseUnknownLocationRuns } from "@/lib/admin/data";
import {
  getVerifiedRecentAnalyticsEvents,
  type VerifiedAnalyticsScope,
} from "@/lib/admin/verified-analytics";
import { pageNumber } from "@/lib/admin/pagination";

function analyticsScope(value: string | undefined): VerifiedAnalyticsScope {
  if (value === "synthetic" || value === "automation" || value === "all") return value;
  return "real_audience";
}

export default async function AnalyticsActivityPage({
  searchParams,
}: {
  searchParams?: Promise<{ page?: string; scope?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const page = pageNumber(params.page);
  const scope = analyticsScope(params.scope);
  const recentEvents = await getVerifiedRecentAnalyticsEvents(200, scope);

  if (recentEvents.error) {
    return (
      <div className="space-y-7">
        <AdminPageHeader
          eyebrow="Analytics"
          title="Full activity log"
          description="Recent trusted schema-v2 activity only."
        />
        <AdminEmptyState
          title="Recent activity is unavailable"
          description="The secure verified-events reader could not return data. Legacy events are not substituted."
        />
        <Link href="/admin/analytics" prefetch={false} className="text-sm font-semibold text-[var(--text-secondary)] hover:underline">
          ← Back to analytics
        </Link>
      </div>
    );
  }

  const rows = collapseUnknownLocationRuns(
    recentEvents.data.map((event) => ({
      occurredAt: event.occurredAt,
      eventName: event.eventName,
      toolSlug: event.toolSlug,
      deviceClass: event.deviceClass,
      browserFamily: event.browserFamily,
      operatingSystem: event.operatingSystem,
      locationLabel: event.locationLabel === "Unknown Location" ? "Unknown location" : event.locationLabel,
      success: event.success,
    })),
  );
  const totalPages = Math.max(1, Math.ceil(rows.length / RECENT_ACTIVITY_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = rows.slice(
    (safePage - 1) * RECENT_ACTIVITY_PAGE_SIZE,
    safePage * RECENT_ACTIVITY_PAGE_SIZE,
  );
  const scopeQuery = scope === "real_audience" ? "" : `&scope=${scope}`;

  return (
    <div className="space-y-7">
      <AdminPageHeader
        eyebrow="Analytics"
        title="Full activity log"
        description="Recent verified events, newest first. No visitor/session identifiers, raw IPs, exact coordinates or addresses are exposed."
      />

      <AdminSectionCard
        title={`Page ${safePage} of ${totalPages}`}
        description="Unresolved geographic events are grouped for readability. Genuine traffic remains counted in aggregate totals."
      >
        <RecentActivityTable rows={pageRows} />
        <div className="mt-4 flex items-center justify-between gap-3">
          <Link href={`/admin/analytics?scope=${scope}`} prefetch={false} className="text-sm font-semibold text-[var(--text-secondary)] hover:underline">
            ← Back to analytics
          </Link>
          <div className="flex gap-3">
            {safePage > 1 && (
              <Link
                className="rounded-xl border border-[var(--border-subtle)] px-4 py-2 text-sm font-semibold"
                href={`/admin/analytics/activity?page=${safePage - 1}${scopeQuery}`}
                prefetch={false}
              >
                Previous
              </Link>
            )}
            {safePage < totalPages && (
              <Link
                className="rounded-xl border border-[var(--border-subtle)] px-4 py-2 text-sm font-semibold"
                href={`/admin/analytics/activity?page=${safePage + 1}${scopeQuery}`}
                prefetch={false}
              >
                Next
              </Link>
            )}
          </div>
        </div>
      </AdminSectionCard>
    </div>
  );
}
