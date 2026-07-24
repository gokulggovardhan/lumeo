import { AdminDataTable } from "@/components/admin/AdminDataTable";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import type { RecentActivityRow } from "@/lib/admin/data";

export const RECENT_ACTIVITY_PREVIEW_SIZE = 15;
export const RECENT_ACTIVITY_PAGE_SIZE = 25;

const EVENT_LABEL: Record<string, string> = {
  page_view: "Page view",
  tool_opened: "Tool opened",
  processing_started: "Processing started",
  processing_succeeded: "Processing succeeded",
  processing_failed: "Processing failed",
  download_started: "Download started",
};

function formatEventTime(value: string) {
  return new Date(value).toLocaleString("en", { dateStyle: "medium", timeStyle: "medium" });
}

export function RecentActivityTable({ rows }: { rows: RecentActivityRow[] }) {
  return (
    <AdminDataTable
      columns={["Time", "Event", "Tool", "Location", "Device"]}
      rows={rows.map((row) => {
        if (row.kind === "unknown_location_burst") {
          return [
            formatEventTime(row.latestAt),
            `${row.count} events`,
            "—",
            `Unknown location (${row.count})`,
            "—",
          ];
        }

        const { event } = row;
        return [
          formatEventTime(event.occurredAt),
          EVENT_LABEL[event.eventName] ?? event.eventName,
          event.toolSlug ?? "—",
          event.locationLabel,
          `${event.deviceClass} · ${event.browserFamily} · ${event.operatingSystem}`,
        ];
      })}
      empty={
        <AdminEmptyState
          title="No recent activity yet"
          description="Individual events will appear here as visitors interact with the public site."
        />
      }
    />
  );
}
