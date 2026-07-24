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
import {
  updateToolCategory,
  updateToolEnabled,
  updateToolMaintenanceMessage,
  updateToolSortOrder,
  updateToolStatus,
} from "@/app/admin/(protected)/tools/actions";

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
      <AdminSectionCard title="Tool catalog" description={canEdit ? "Owner and admin roles can update catalog controls." : "Analyst access is read-only."}>
        <AdminDataTable
          columns={["Tool", "Category", "Route", "Status", "Maintenance message", "Enabled", "Sort", "Updated"]}
          rows={tools.data.map((tool) => [
            <div key="tool">
              <p className="font-semibold text-[#F0EAD6]">{tool.name}</p>
              <p className="text-xs text-[#F0EAD6]/46">{tool.short_description}</p>
            </div>,
            canEdit ? (
              <form key="category" action={asAdminFormAction(updateToolCategory)} className="flex gap-2">
                <input type="hidden" name="id" value={tool.id} />
                <select name="category_id" defaultValue={tool.category_id ?? ""} className="min-h-10 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-input)] px-2 text-xs">
                  <option value="">None</option>
                  {categories.data.map((category) => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
                </select>
                <AdminSubmitButton variant="secondary" pendingLabel="...">Save</AdminSubmitButton>
              </form>
            ) : tool.category_name ?? "None",
            tool.route,
            canEdit ? (
              <form key="status" action={asAdminFormAction(updateToolStatus)} className="flex gap-2">
                <input type="hidden" name="id" value={tool.id} />
                <select name="status" defaultValue={tool.status} className="min-h-10 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-input)] px-2 text-xs">
                  {["active", "beta", "coming_soon", "hidden", "maintenance"].map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
                <AdminSubmitButton variant="secondary" pendingLabel="...">Save</AdminSubmitButton>
              </form>
            ) : <AdminStatusBadge>{tool.status}</AdminStatusBadge>,
            canEdit ? (
              <form key="maintenance_message" action={asAdminFormAction(updateToolMaintenanceMessage)} className="flex gap-2">
                <input type="hidden" name="id" value={tool.id} />
                <input
                  type="text"
                  name="maintenance_message"
                  defaultValue={tool.maintenance_message ?? ""}
                  placeholder="e.g. Upgrading -- back shortly"
                  maxLength={300}
                  className="min-h-10 w-44 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-input)] px-2 text-xs"
                />
                <AdminSubmitButton variant="secondary" pendingLabel="...">Save</AdminSubmitButton>
              </form>
            ) : (tool.maintenance_message || <span className="text-[#F0EAD6]/40">None</span>),
            canEdit ? (
              <form key="enabled" action={asAdminFormAction(updateToolEnabled)} className="flex items-center gap-2">
                <input type="hidden" name="id" value={tool.id} />
                <input type="checkbox" name="is_enabled" defaultChecked={tool.is_enabled} className="h-4 w-4" />
                <AdminSubmitButton
                  variant="secondary"
                  pendingLabel="..."
                  confirmMessage={`Change "${tool.name}"'s enabled state? Disabling removes it from the live site, homepage, and nav immediately.`}
                >
                  Save
                </AdminSubmitButton>
              </form>
            ) : tool.is_enabled ? "Yes" : "No",
            canEdit ? (
              <form key="sort" action={asAdminFormAction(updateToolSortOrder)} className="flex gap-2">
                <input type="hidden" name="id" value={tool.id} />
                <input name="sort_order" type="number" defaultValue={tool.sort_order} className="min-h-10 w-20 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-input)] px-2 text-xs" />
                <AdminSubmitButton variant="secondary" pendingLabel="...">Save</AdminSubmitButton>
              </form>
            ) : tool.sort_order,
            new Date(tool.updated_at).toLocaleDateString(),
          ])}
          empty={<AdminEmptyState title="No tools found" description="Run the Control Center foundation migration to seed the initial PDF tools." />}
        />
      </AdminSectionCard>
    </div>
  );
}
