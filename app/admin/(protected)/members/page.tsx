import { AdminDataTable } from "@/components/admin/AdminDataTable";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminFormField } from "@/components/admin/AdminFormField";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminSectionCard } from "@/components/admin/AdminSectionCard";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { AdminSubmitButton } from "@/components/admin/AdminSubmitButton";
import { requireAdmin } from "@/lib/admin/auth";
import { getAdminMembers } from "@/lib/admin/data";
import { asAdminFormAction } from "@/lib/admin/form-action";
import { canManageMembers } from "@/lib/admin/permissions";
import { formatAdminDateTime } from "@/lib/admin/timezone";
import { addAdminMember, updateAdminMember } from "@/app/admin/(protected)/members/actions";

function formatDate(value: string | null) {
  return value ? formatAdminDateTime(value) : "Never";
}

export default async function MembersPage() {
  const admin = await requireAdmin();
  const canEdit = canManageMembers(admin.role);
  const members = canEdit ? await getAdminMembers() : { data: [], error: null };

  return (
    <div className="space-y-7">
      <AdminPageHeader
        eyebrow="Owner controls"
        title="Administrators"
        description="Manage who can access the Control Center and what they can do. Owner-only. Every change here is written to the audit log."
      />

      {!canEdit ? (
        <AdminEmptyState
          title="Owner access required"
          description="Only owners can view or manage administrator membership."
        />
      ) : (
        <>
          <AdminSectionCard
            title="Add administrator"
            description="The person needs a Supabase Authentication account first (create one in the Supabase dashboard if they don't have one), then link them here by email."
          >
            <form action={asAdminFormAction(addAdminMember)} className="grid gap-4 md:grid-cols-3">
              <AdminFormField label="Email" name="email" type="email" />
              <label className="block text-sm font-semibold text-[#F0EAD6]">
                Role
                <select name="role" defaultValue="analyst" className="mt-2 min-h-11 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-input)] px-3 text-sm">
                  <option value="analyst">Analyst — read-only</option>
                  <option value="admin">Admin — can manage content</option>
                  <option value="owner">Owner — full control</option>
                </select>
              </label>
              <div className="flex items-end">
                <AdminSubmitButton pendingLabel="Adding...">Add administrator</AdminSubmitButton>
              </div>
            </form>
          </AdminSectionCard>

          <AdminSectionCard
            title={`${members.data.length} administrator${members.data.length === 1 ? "" : "s"}`}
            description="Owners can promote, demote, or deactivate any administrator except themselves. At least one active owner must always remain."
          >
            <AdminDataTable
              columns={["Email", "Role", "Status", "Last sign-in", "Added", "Action"]}
              rows={members.data.map((member) => {
                const isSelf = member.userId === admin.userId;
                return [
                  member.email ?? member.userId,
                  <AdminStatusBadge key="role" tone={member.role === "owner" ? "gold" : member.role === "admin" ? "success" : "neutral"}>
                    {member.role}
                  </AdminStatusBadge>,
                  <AdminStatusBadge key="status" tone={member.isActive ? "success" : "danger"}>
                    {member.isActive ? "Active" : "Deactivated"}
                  </AdminStatusBadge>,
                  formatDate(member.lastSignInAt),
                  formatDate(member.createdAt),
                  isSelf ? (
                    <span key="self" className="text-xs font-semibold text-[#F0EAD6]/46">This is you</span>
                  ) : (
                    <form key="update" action={asAdminFormAction(updateAdminMember)} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="user_id" value={member.userId} />
                      <select name="role" defaultValue={member.role} className="min-h-9 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-input)] px-2 text-xs">
                        <option value="analyst">Analyst</option>
                        <option value="admin">Admin</option>
                        <option value="owner">Owner</option>
                      </select>
                      <label className="flex items-center gap-1.5 text-xs font-semibold text-[#F0EAD6]">
                        <input type="checkbox" name="is_active" defaultChecked={member.isActive} className="h-3.5 w-3.5" />
                        Active
                      </label>
                      <AdminSubmitButton
                        variant="secondary"
                        pendingLabel="Saving..."
                        confirmMessage={`Update role and active status for ${member.email ?? member.userId}? This changes their access immediately.`}
                      >
                        Save
                      </AdminSubmitButton>
                    </form>
                  ),
                ];
              })}
              empty={<AdminEmptyState title="No administrators found" description="This shouldn't happen while you're signed in as one." />}
            />
          </AdminSectionCard>
        </>
      )}
    </div>
  );
}
