import { AdminDataTable } from "@/components/admin/AdminDataTable";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminSectionCard } from "@/components/admin/AdminSectionCard";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { AdminSubmitButton } from "@/components/admin/AdminSubmitButton";
import { requireAdmin } from "@/lib/admin/auth";
import { getPdfTools, getToolCategories } from "@/lib/admin/data";
import { asAdminFormAction } from "@/lib/admin/form-action";
import { canManageTools } from "@/lib/admin/permissions";
import { formatAdminDate } from "@/lib/admin/timezone";
import { updateTool } from "@/app/admin/(protected)/tools/actions";

export default async function ToolsPage() {
  const admin = await requireAdmin();
  const [tools, categories] = await Promise.all([getPdfTools(), getToolCategories()]);
  const canEdit = canManageTools(admin.role);

  return (
    <div className="space-y-7">
      <AdminPageHeader
        eyebrow="Catalog"
        title="PDF Tools"
        description="Manage the database catalog for Lumeo PDF tools. An action's status and enabled state here control whether it shows as live in the nav, homepage, tools catalog, and its own page — set status to Maintenance (or disable it) and it's blocked on its own page too, showing the message below."
      />
      <AdminSectionCard title="Tool catalog" description={canEdit ? "Owner and admin roles can update catalog controls. Each row saves together as one change." : "Analyst access is read-only."}>
        <AdminDataTable
          columns={["Tool", "Category", "Route", "Status", "Maintenance message", "Enabled", "Updated", ""]}
          rows={tools.data.map((tool) => {
            const formId = `tool-form-${tool.id}`;

            if (!canEdit) {
              return [
                <div key="tool">
                  <p className="font-semibold text-[#F0EAD6]">{tool.name}</p>
                  <p className="text-xs text-[#F0EAD6]/46">{tool.short_description}</p>
                </div>,
                tool.category_name ?? "None",
                tool.route,
                <AdminStatusBadge key="status">{tool.status}</AdminStatusBadge>,
                tool.maintenance_message || <span className="text-[#F0EAD6]/40">None</span>,
                tool.is_enabled ? "Yes" : "No",
                formatAdminDate(tool.updated_at),
                null,
              ];
            }

            return [
              <div key="tool">
                <form id={formId} action={asAdminFormAction(updateTool)} />
                <input type="hidden" form={formId} name="id" value={tool.id} />
                <p className="font-semibold text-[#F0EAD6]">{tool.name}</p>
                <p className="text-xs text-[#F0EAD6]/46">{tool.short_description}</p>
              </div>,
              <select
                key="category"
                form={formId}
                name="category_id"
                defaultValue={tool.category_id ?? ""}
                aria-label={`${tool.name} category`}
                className="min-h-10 w-full min-w-[10.5rem] rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-input)] px-2 text-xs"
              >
                <option value="">None</option>
                {categories.data.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>,
              tool.route,
              <select
                key="status"
                form={formId}
                name="status"
                defaultValue={tool.status}
                aria-label={`${tool.name} status`}
                className="min-h-10 w-full min-w-[8.5rem] rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-input)] px-2 text-xs"
              >
                {["active", "beta", "coming_soon", "hidden", "maintenance"].map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>,
              <input
                key="maintenance_message"
                type="text"
                form={formId}
                name="maintenance_message"
                defaultValue={tool.maintenance_message ?? ""}
                placeholder="e.g. Upgrading -- back shortly"
                aria-label={`${tool.name} maintenance message`}
                maxLength={300}
                className="min-h-10 w-44 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-input)] px-2 text-xs"
              />,
              <label key="enabled" className="flex min-h-10 items-center justify-center gap-2">
                <input
                  type="checkbox"
                  form={formId}
                  name="is_enabled"
                  defaultChecked={tool.is_enabled}
                  className="h-4 w-4"
                  aria-label={`${tool.name} enabled`}
                />
              </label>,
              formatAdminDate(tool.updated_at),
              <AdminSubmitButton
                key="save"
                form={formId}
                variant="secondary"
                pendingLabel="..."
                confirmMessage={`Save changes to "${tool.name}"? Status and enabled state take effect on the live site immediately.`}
              >
                Save
              </AdminSubmitButton>,
            ];
          })}
          empty={<AdminEmptyState title="No tools found" description="Run the Control Center foundation migration to seed the initial PDF tools." />}
        />
      </AdminSectionCard>
    </div>
  );
}
