import { AdminDataTable } from "@/components/admin/AdminDataTable";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminMetricCard } from "@/components/admin/AdminMetricCard";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminSectionCard } from "@/components/admin/AdminSectionCard";
import { getAnalyticsSummary } from "@/lib/admin/data";

export default async function AnalyticsPage() {
  const summary = await getAnalyticsSummary();
  const data = summary.data;

  return (
    <div className="space-y-7">
      <AdminPageHeader
        eyebrow="Privacy-preserving analytics"
        title="Analytics"
        description="Read-only reporting foundation for anonymous operational events. No public tracking is added in this phase."
      />
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <AdminMetricCard label="Events Today" value={data.eventsToday} detail="Anonymous events recorded today." />
        <AdminMetricCard label="Tool Opens" value={data.toolOpens} detail="Aggregated opens from daily metrics." />
        <AdminMetricCard label="Started" value={data.processingStarted} detail="Processing starts from daily metrics." />
        <AdminMetricCard label="Success Rate" value={data.successRate === null ? "N/A" : `${data.successRate}%`} detail="Only shown when real outcomes exist." />
      </section>
      <AdminSectionCard title="Seven-day tool metrics" description="Real aggregate rows only. Empty means collection has not started.">
        <AdminDataTable
          columns={["Date", "Tool", "Opens", "Started", "Succeeded", "Failed"]}
          rows={data.dailyMetrics.map((metric) => [
            metric.metric_date,
            metric.tool_slug,
            metric.tool_opens,
            metric.processing_started,
            metric.processing_succeeded,
            metric.processing_failed,
          ])}
          empty={
            <AdminEmptyState
              title="No analytics events yet"
              description="Analytics will appear after privacy-preserving event collection is enabled."
            />
          }
        />
      </AdminSectionCard>
    </div>
  );
}
