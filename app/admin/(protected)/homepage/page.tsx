import { AdminDataTable } from "@/components/admin/AdminDataTable";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminSectionCard } from "@/components/admin/AdminSectionCard";
import { AdminSubmitButton } from "@/components/admin/AdminSubmitButton";
import { requireAdmin } from "@/lib/admin/auth";
import { getHomepageSlots, getPdfTools } from "@/lib/admin/data";
import { asAdminFormAction } from "@/lib/admin/form-action";
import { canManageHomepage } from "@/lib/admin/permissions";
import { assignHomepageSlot } from "@/app/admin/(protected)/homepage/actions";

export default async function HomepagePage() {
  const admin = await requireAdmin();
  const [slots, tools] = await Promise.all([getHomepageSlots(), getPdfTools()]);
  const canEdit = canManageHomepage(admin.role);
  const eligibleTools = tools.data.filter((tool) => tool.is_enabled && tool.is_homepage_eligible);

  return (
    <div className="space-y-7">
      <AdminPageHeader
        eyebrow="Public launcher foundation"
        title="Homepage"
        description="Configure five database-backed tool slots. The sixth card is permanently All PDF Tools and is not stored."
      />
      <AdminSectionCard title="Homepage preview" description="This is a database preview only. The public homepage is not dynamic in this phase.">
        <div className="grid gap-3 md:grid-cols-3">
          {slots.data.map((slot) => (
            <div key={slot.slot_number} className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-4">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#CBA052]/72">Slot {slot.slot_number}</p>
              <p className="mt-3 text-base font-semibold text-[#F0EAD6]">{slot.tool?.name ?? "Unassigned"}</p>
              <p className="mt-1 text-sm text-[#F0EAD6]/48">{slot.tool?.short_description ?? "Choose an eligible tool."}</p>
            </div>
          ))}
          <div className="rounded-2xl border border-[#1E6B4A]/40 bg-[#1E6B4A]/12 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#CBA052]/72">Permanent</p>
            <p className="mt-3 text-base font-semibold text-[#F0EAD6]">All PDF Tools</p>
            <p className="mt-1 text-sm text-[#F0EAD6]/48">Always shown as the sixth card.</p>
          </div>
        </div>
      </AdminSectionCard>
      <AdminSectionCard title="Slot assignments" description={canEdit ? "Assign enabled homepage-eligible tools to slots 1-5." : "Analyst access is read-only."}>
        <AdminDataTable
          columns={["Slot", "Current tool", "Assign"]}
          rows={slots.data.map((slot) => [
            `Slot ${slot.slot_number}`,
            slot.tool?.name ?? "Unassigned",
            canEdit ? (
              <form key={slot.slot_number} action={asAdminFormAction(assignHomepageSlot)} className="flex flex-wrap gap-2">
                <input type="hidden" name="slot_number" value={slot.slot_number} />
                <select name="tool_id" defaultValue={slot.tool_id ?? ""} className="min-h-11 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-input)] px-3 text-sm">
                  <option value="">Choose tool</option>
                  {eligibleTools.map((tool) => (
                    <option key={tool.id} value={tool.id}>{tool.name}</option>
                  ))}
                </select>
                <AdminSubmitButton pendingLabel="Assigning...">Assign</AdminSubmitButton>
              </form>
            ) : "Read-only",
          ])}
          empty={<AdminEmptyState title="No homepage slots found" description="Run the Control Center migration to seed five homepage slots." />}
        />
      </AdminSectionCard>
    </div>
  );
}
