import Link from "next/link";
import { updateTool } from "@/app/admin/(protected)/tools/actions";
import { AdminDataTable } from "@/components/admin/AdminDataTable";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminMetricCard } from "@/components/admin/AdminMetricCard";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminSectionCard } from "@/components/admin/AdminSectionCard";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { AdminSubmitButton } from "@/components/admin/AdminSubmitButton";
import { requireAdmin } from "@/lib/admin/auth";
import { getAnalyticsSummary, getPdfTools, getToolCategories } from "@/lib/admin/data";
import { asAdminFormAction } from "@/lib/admin/form-action";
import { canManageTools } from "@/lib/admin/permissions";
import {
  filterAdminTools,
  hasActiveToolFilters,
  resolveToolFilters,
} from "@/lib/admin/tool-filters";
import { formatAdminDate } from "@/lib/admin/timezone";

const TOOL_STATUSES = ["active", "beta", "coming_soon", "hidden", "maintenance"] as const;

function statusTone(status: string) {
  if (status === "active") return "success" as const;
  if (status === "maintenance") return "danger" as const;
  if (status === "beta" || status === "coming_soon") return "warning" as const;
  return "neutral" as const;
}

export default async function ToolsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await requireAdmin();
  const params = (await searchParams) ?? {};
  const filters = resolveToolFilters(params);
  const [tools, categories, analytics] = await Promise.all([
    getPdfTools(),
    getToolCategories(),
    getAnalyticsSummary(),
  ]);
  const canEdit = canManageTools(admin.role);

  if (tools.error || categories.error) {
    return (
      <div className="space-y-7">
        <AdminPageHeader eyebrow="Catalog" title="Tools" description="Manage the database catalog for Lumeo PDF tools." />
        <AdminEmptyState title="Tool catalog is unavailable" description="Tool or category state could not be verified, so catalog changes are disabled until the data service recovers." />
      </div>
    );
  }

  const filteredTools = filterAdminTools(tools.data, filters);
  const activeFilters = hasActiveToolFilters(filters);
  const enabledCount = tools.data.filter((tool) => tool.is_enabled).length;
  const maintenanceCount = tools.data.filter(
    (tool) => tool.status === "maintenance",
  ).length;
  const usageAvailable = analytics.data.dataStatus === "available";
  const opensBySlug = new Map(
    analytics.data.topToolsByOpens.map((item) => [item.toolSlug, item.count]),
  );

  return (
    <div className="min-w-0 space-y-7">
      <AdminPageHeader
        eyebrow="Catalog"
        title="Tools"
        description="Search, review, and safely update the live PDF tool catalog. Status, availability, and maintenance changes use the existing protected server action and audit trail."
        meta={
          <AdminStatusBadge tone={canEdit ? "success" : "neutral"}>
            {canEdit ? "Editing enabled" : "Analyst · read only"}
          </AdminStatusBadge>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AdminMetricCard label="Catalog tools" value={tools.data.length} detail="Database-backed tool records." />
        <AdminMetricCard label="Enabled" value={enabledCount} detail="Available to public catalog resolution." tone="success" />
        <AdminMetricCard label="Maintenance" value={maintenanceCount} detail="Tools with a maintenance state or message." tone={maintenanceCount ? "warning" : "neutral"} />
        <AdminMetricCard label="Filtered results" value={filteredTools.length} detail={activeFilters ? "Matches the current URL-backed filters." : "Showing the complete catalog."} tone="gold" />
      </section>

      <AdminSectionCard
        title="Public state policy"
        description="The selected state and Enabled publicly flag resolve to one effective public behavior. Disabled always wins and fails closed."
      >
        <div className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-5">
          {[
            ["Active", "Listed and usable."],
            ["Beta", "Listed and usable, with a Beta label."],
            ["Coming soon", "Listed but blocked, with Coming Soon shown publicly."],
            ["Maintenance", "Listed but blocked, with the maintenance notice shown."],
            ["Hidden", "Not listed and blocked on its direct route."],
          ].map(([label, detail]) => (
            <div key={label} className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-base)] p-3">
              <p className="font-semibold text-[var(--text-primary)]">{label}</p>
              <p className="mt-1 leading-5 text-[var(--text-muted)]">{detail}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs leading-5 text-[var(--text-subtle)]">
          Turning off Enabled publicly overrides every state: the tool is removed from public discovery and its direct workspace is blocked.
        </p>
      </AdminSectionCard>

      <AdminSectionCard title="Find tools" description="Filters are server-rendered and encoded in the URL, so operational views can be bookmarked or shared.">
        <form action="/admin/tools" method="get" className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(13rem,1.5fr)_repeat(4,minmax(9rem,1fr))_auto]">
          <label className="text-xs font-semibold text-[var(--text-secondary)]">
            Search
            <input type="search" name="q" defaultValue={filters.query} placeholder="Name, slug, route, description" className="mt-2 min-h-11 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-input)] px-3 text-base text-[var(--text-primary)] placeholder:text-[var(--text-subtle)] sm:text-sm" />
          </label>
          <label className="text-xs font-semibold text-[var(--text-secondary)]">
            Category
            <select name="category" defaultValue={filters.category} className="mt-2 min-h-11 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-input)] px-3 text-base text-[var(--text-primary)] sm:text-sm">
              <option value="">All categories</option>
              {categories.data.map((category) => <option key={category.id} value={category.slug}>{category.name}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-[var(--text-secondary)]">
            Status
            <select name="status" defaultValue={filters.status} className="mt-2 min-h-11 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-input)] px-3 text-base text-[var(--text-primary)] sm:text-sm">
              <option value="">All statuses</option>
              {TOOL_STATUSES.map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-[var(--text-secondary)]">
            Availability
            <select name="enabled" defaultValue={filters.enabled} className="mt-2 min-h-11 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-input)] px-3 text-base text-[var(--text-primary)] sm:text-sm">
              <option value="all">All</option><option value="enabled">Enabled</option><option value="disabled">Disabled</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-[var(--text-secondary)]">
            Maintenance
            <select name="maintenance" defaultValue={filters.maintenance} className="mt-2 min-h-11 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-input)] px-3 text-base text-[var(--text-primary)] sm:text-sm">
              <option value="all">All</option><option value="maintenance">Needs attention</option><option value="clear">Clear</option>
            </select>
          </label>
          <div className="flex items-end gap-2">
            <button type="submit" className="min-h-11 rounded-xl bg-[var(--action-primary)] px-4 text-sm font-bold text-[var(--text-on-accent)] transition hover:bg-[var(--action-primary-hover)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--lumeo-aura-rgb),0.2)]">Apply</button>
            {activeFilters ? <Link href="/admin/tools" className="inline-flex min-h-11 items-center rounded-xl border border-[var(--border-subtle)] px-4 text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">Clear</Link> : null}
          </div>
        </form>
      </AdminSectionCard>

      <AdminSectionCard
        title="Tool management"
        description={canEdit ? "Owner and admin roles can update each row as one audited change. Usage shows verified tool-open events for today when analytics is available." : "Analyst access is read-only. Usage shows verified tool-open events for today when analytics is available."}
      >
        <AdminDataTable
          columns={["Tool", "Category", "Public route", "State", "Maintenance", "Today opens", "Updated", "Action"]}
          rows={filteredTools.map((tool) => {
            const formId = `tool-form-${tool.id}`;
            const maintenance = tool.status === "maintenance" || Boolean(tool.maintenance_message);

            if (!canEdit) {
              return [
                <ToolIdentity key="tool" name={tool.name} slug={tool.slug} description={tool.short_description} />,
                tool.category_name ?? "None",
                <PublicToolLink key="route" route={tool.route} />,
                <ToolState key="state" status={tool.status} enabled={tool.is_enabled} />,
                maintenance ? tool.maintenance_message || "Maintenance status active" : <span className="text-[var(--text-subtle)]">Clear</span>,
                usageAvailable ? opensBySlug.get(tool.slug) ?? 0 : <span className="text-[var(--text-subtle)]">Unavailable</span>,
                formatAdminDate(tool.updated_at),
                null,
              ];
            }

            return [
              <div key="tool" className="min-w-52">
                <form id={formId} action={asAdminFormAction(updateTool)} />
                <input type="hidden" form={formId} name="id" value={tool.id} />
                <ToolIdentity name={tool.name} slug={tool.slug} description={tool.short_description} />
              </div>,
              <select key="category" form={formId} name="category_id" defaultValue={tool.category_id ?? ""} aria-label={`${tool.name} category`} className="min-h-10 w-full min-w-40 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-input)] px-2 text-base sm:text-xs">
                <option value="">None</option>{categories.data.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>,
              <PublicToolLink key="route" route={tool.route} />,
              <div key="state" className="min-w-40 space-y-2">
                <select form={formId} name="status" defaultValue={tool.status} aria-label={`${tool.name} status`} className="min-h-10 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-input)] px-2 text-base sm:text-xs">
                  {TOOL_STATUSES.map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}
                </select>
                <label className="flex min-h-8 items-center gap-2 text-xs font-semibold text-[var(--text-secondary)]">
                  <input type="checkbox" form={formId} name="is_enabled" defaultChecked={tool.is_enabled} className="h-4 w-4" /> Enabled publicly
                </label>
              </div>,
              <div key="maintenance" className="min-w-52">
                <input type="text" form={formId} name="maintenance_message" defaultValue={tool.maintenance_message ?? ""} placeholder="Message shown while unavailable" aria-label={`${tool.name} maintenance message`} maxLength={300} className="min-h-10 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-input)] px-2 text-base sm:text-xs" />
                <p className="mt-2 text-xs text-[var(--text-subtle)]">{maintenance ? "Maintenance configured" : "No maintenance message"}</p>
              </div>,
              usageAvailable ? opensBySlug.get(tool.slug) ?? 0 : <span className="text-[var(--text-subtle)]">Unavailable</span>,
              formatAdminDate(tool.updated_at),
              <AdminSubmitButton key="save" form={formId} variant="secondary" pendingLabel="Saving..." confirmMessage={`Save changes to "${tool.name}"? Live catalog availability can change immediately.`}>Save</AdminSubmitButton>,
            ];
          })}
          empty={<AdminEmptyState title="No tools match these filters" description="Clear or broaden the current filters. The catalog records have not been changed." />}
        />
      </AdminSectionCard>
    </div>
  );
}

function ToolIdentity({ name, slug, description }: { name: string; slug: string; description: string }) {
  return <div className="min-w-44"><p className="font-semibold text-[var(--text-primary)]">{name}</p><p className="mt-1 text-xs text-[var(--text-muted)]">{slug}</p><p className="mt-2 max-w-xs text-xs leading-5 text-[var(--text-subtle)]">{description}</p></div>;
}

function PublicToolLink({ route }: { route: string }) {
  return <Link href={route} target="_blank" rel="noreferrer" className="font-semibold text-[var(--text-accent)] hover:underline">{route} ↗</Link>;
}

function ToolState({ status, enabled }: { status: string; enabled: boolean }) {
  return <div className="space-y-2"><AdminStatusBadge tone={statusTone(status)}>{status.replaceAll("_", " ")}</AdminStatusBadge><p className="text-xs">{enabled ? "Enabled" : "Disabled"}</p></div>;
}
