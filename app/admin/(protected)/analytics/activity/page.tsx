import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminSectionCard } from "@/components/admin/AdminSectionCard";
import { RecentActivityTable, RECENT_ACTIVITY_PAGE_SIZE } from "@/components/admin/analytics/RecentActivityTable";
import { collapseUnknownLocationRuns, getRecentAnalyticsEvents } from "@/lib/admin/data";

function pageNumber(value: string | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
}

export default async function AnalyticsActivityPage({
  searchParams,
}: {
  searchParams?: Promise<{ page?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const page = pageNumber(params.page);

  // The recent-events RPC caps at 200 rows -- plenty for browsing recent
  // activity without needing real SQL offset pagination. Collapsed once
  // over the full set so unknown-location bursts stay grouped consistently
  // across pages, then sliced per page.
  const recentEvents = await getRecentAnalyticsEvents(200);
  const rows = collapseUnknownLocationRuns(recentEvents.data);
  const totalPages = Math.max(1, Math.ceil(rows.length / RECENT_ACTIVITY_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = rows.slice((safePage - 1) * RECENT_ACTIVITY_PAGE_SIZE, safePage * RECENT_ACTIVITY_PAGE_SIZE);

  return (
    <div className="space-y-7">
      <AdminPageHeader
        eyebrow="Analytics V1"
        title="Full activity log"
        description="Every recent public event, newest first, with the approximate location behind each click. Capped at the 200 most recent events."
      />

      <AdminSectionCard
        title={`Page ${safePage} of ${totalPages}`}
        description="Consecutive events with no resolvable location are grouped into one row."
      >
        <RecentActivityTable rows={pageRows} />
        <div className="mt-4 flex items-center justify-between gap-3">
          <Link href="/admin/analytics" className="text-sm font-semibold text-[#F0EAD6]/70 hover:underline">
            ← Back to analytics
          </Link>
          <div className="flex gap-3">
            {safePage > 1 && (
              <Link
                className="rounded-xl border border-[#E8DFC8]/12 px-4 py-2 text-sm font-semibold"
                href={`/admin/analytics/activity?page=${safePage - 1}`}
              >
                Previous
              </Link>
            )}
            {safePage < totalPages && (
              <Link
                className="rounded-xl border border-[#E8DFC8]/12 px-4 py-2 text-sm font-semibold"
                href={`/admin/analytics/activity?page=${safePage + 1}`}
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
