import Link from "next/link";
import { AdminDataTable } from "@/components/admin/AdminDataTable";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminFormField } from "@/components/admin/AdminFormField";
import { AdminMetricCard } from "@/components/admin/AdminMetricCard";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminSectionCard } from "@/components/admin/AdminSectionCard";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { AdminSubmitButton } from "@/components/admin/AdminSubmitButton";
import { requireAdmin } from "@/lib/admin/auth";
import { getAdminMembers } from "@/lib/admin/data";
import { asAdminFormAction } from "@/lib/admin/form-action";
import { canManageMembers } from "@/lib/admin/permissions";
import {
  filterAdminMembers,
  hasActiveMemberFilters,
  resolveMemberFilters,
} from "@/lib/admin/governance-filters";
import { formatAdminDateTime } from "@/lib/admin/timezone";
import { addAdminMember, updateAdminMember } from "@/app/admin/(protected)/members/actions";

function formatDate(value: string | null) {
  return value ? formatAdminDateTime(value) : "Never";
}

export default async function MembersPage({
  searchParams,
}: {
  searchParams?: Promise<{
    q?: string | string[];
    role?: string | string[];
    status?: string | string[];
  }>;
}) {
  const admin = await requireAdmin();
  const canEdit = canManageMembers(admin.role);
  const members = canEdit ? await getAdminMembers() : { data: [], error: null };
  const filters = resolveMemberFilters((await searchParams) ?? {});

  if (canEdit && members.error) {
    return (
      <div className="space-y-7">
        <AdminPageHeader
          eyebrow="Owner controls"
          title="Administrators"
          description="Manage who can access the Control Center and what they can do."
        />
        <AdminEmptyState
          title="Administrator data is unavailable"
          description="Membership could not be verified, so administrator changes are disabled until the data service recovers."
        />
      </div>
    );
  }

  const filteredMembers = filterAdminMembers(members.data, filters);
  const activeMembers = members.data.filter((member) => member.isActive).length;
  const activeOwners = members.data.filter(
    (member) => member.isActive && member.role === "owner",
  ).length;

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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <AdminMetricCard label="Administrators" value={members.data.length} detail="All linked administrator accounts." />
            <AdminMetricCard label="Active access" value={activeMembers} detail="Accounts currently allowed to sign in." tone="success" />
            <AdminMetricCard label="Active owners" value={activeOwners} detail="Accounts able to manage membership and settings." tone="gold" />
            <AdminMetricCard label="Results" value={filteredMembers.length} detail="Accounts matching the current filters." />
          </div>

          <AdminSectionCard
            title="Add administrator"
            description="The person needs a Supabase Authentication account first (create one in the Supabase dashboard if they don't have one), then link them here by email."
          >
            <form action={asAdminFormAction(addAdminMember)} className="grid gap-4 md:grid-cols-3">
              <AdminFormField label="Email" name="email" type="email" />
              <label className="block text-sm font-semibold text-[#F0EAD6]">
                Role
                <select name="role" defaultValue="analyst" className="mt-2 min-h-11 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-input)] px-3 text-base sm:text-sm">
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

          <AdminSectionCard title="Filters" description="Find an administrator by email or account ID, role, and access state.">
            <form method="get" className="grid gap-4 md:grid-cols-4">
              <label className="block text-sm font-semibold text-[var(--text-primary)] md:col-span-2">
                Search
                <input
                  type="search"
                  name="q"
                  defaultValue={filters.query}
                  placeholder="Email or account ID"
                  className="mt-2 min-h-11 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-input)] px-3 text-base text-[var(--text-primary)] placeholder:text-[var(--text-subtle)] sm:text-sm"
                />
              </label>
              <label className="block text-sm font-semibold text-[var(--text-primary)]">
                Role
                <select name="role" defaultValue={filters.role} className="mt-2 min-h-11 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-input)] px-3 text-base sm:text-sm">
                  <option value="all">All roles</option>
                  <option value="owner">Owner</option>
                  <option value="admin">Admin</option>
                  <option value="analyst">Analyst</option>
                </select>
              </label>
              <label className="block text-sm font-semibold text-[var(--text-primary)]">
                Access
                <select name="status" defaultValue={filters.status} className="mt-2 min-h-11 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-input)] px-3 text-base sm:text-sm">
                  <option value="all">All states</option>
                  <option value="active">Active</option>
                  <option value="deactivated">Deactivated</option>
                </select>
              </label>
              <div className="flex flex-wrap items-center gap-3 md:col-span-4">
                <button type="submit" className="min-h-11 rounded-xl bg-[var(--lumeo-seal-600)] px-5 text-sm font-semibold text-[var(--text-on-accent)] transition hover:bg-[var(--lumeo-seal-500)]">
                  Apply filters
                </button>
                {hasActiveMemberFilters(filters) ? (
                  <Link href="/admin/members" className="inline-flex min-h-11 items-center rounded-xl border border-[var(--border-subtle)] px-5 text-sm font-semibold text-[var(--text-secondary)]">
                    Clear
                  </Link>
                ) : null}
              </div>
            </form>
          </AdminSectionCard>

          <AdminSectionCard
            title={`${filteredMembers.length} administrator${filteredMembers.length === 1 ? "" : "s"}`}
            description="Owners can promote, demote, or deactivate any administrator except themselves. At least one active owner must always remain."
          >
            <AdminDataTable
              columns={["Email", "Role", "Status", "Last sign-in (IST)", "Added (IST)", "Action"]}
              rows={filteredMembers.map((member) => {
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
                      <select name="role" defaultValue={member.role} className="min-h-9 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-input)] px-2 text-base sm:text-xs">
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
              empty={
                <AdminEmptyState
                  title={members.data.length === 0 ? "No administrators found" : "No administrators match"}
                  description={members.data.length === 0 ? "No membership records were returned." : "Clear or adjust the filters to see more accounts."}
                />
              }
            />
          </AdminSectionCard>
        </>
      )}
    </div>
  );
}
