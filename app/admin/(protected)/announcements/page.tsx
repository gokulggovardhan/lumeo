import { AdminDataTable } from "@/components/admin/AdminDataTable";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminFormField } from "@/components/admin/AdminFormField";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminSectionCard } from "@/components/admin/AdminSectionCard";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { AdminSubmitButton } from "@/components/admin/AdminSubmitButton";
import { requireAdmin } from "@/lib/admin/auth";
import { getAnnouncements } from "@/lib/admin/data";
import { asAdminFormAction } from "@/lib/admin/form-action";
import { canManageAnnouncements } from "@/lib/admin/permissions";
import { saveAnnouncement, toggleAnnouncement } from "@/app/admin/(protected)/announcements/actions";

export default async function AnnouncementsPage() {
  const admin = await requireAdmin();
  const announcements = await getAnnouncements();
  const canEdit = canManageAnnouncements(admin.role);

  return (
    <div className="space-y-7">
      <AdminPageHeader
        eyebrow="Messaging"
        title="Announcements"
        description="Prepare calm public messages with scheduling and link validation. Public rendering is not changed in this phase."
      />
      {canEdit && (
        <AdminSectionCard title="Create announcement" description="Keep messages concise and avoid urgent marketing language.">
          <form action={asAdminFormAction(saveAnnouncement)} className="grid gap-4 md:grid-cols-2">
            <AdminFormField label="Title" name="title" />
            <label className="block text-sm font-semibold text-[#F0EAD6]">
              Tone
              <select name="tone" defaultValue="information" className="mt-2 min-h-11 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-input)] px-3 text-sm">
                {["information", "success", "warning", "maintenance"].map((tone) => (
                  <option key={tone} value={tone}>{tone}</option>
                ))}
              </select>
            </label>
            <AdminFormField label="Message" name="message" />
            <AdminFormField label="Link label" name="link_label" />
            <AdminFormField label="Link URL" name="link_url" help="Must begin with / or https://." />
            <AdminFormField label="Starts at" name="starts_at" type="datetime-local" />
            <AdminFormField label="Ends at" name="ends_at" type="datetime-local" />
            <label className="flex min-h-11 items-center gap-3 text-sm font-semibold text-[#F0EAD6]">
              <input type="checkbox" name="is_active" className="h-4 w-4" />
              Active
            </label>
            <div className="md:col-span-2">
              <AdminSubmitButton pendingLabel="Saving announcement...">Create announcement</AdminSubmitButton>
            </div>
          </form>
        </AdminSectionCard>
      )}
      <AdminSectionCard title="Announcement records" description={canEdit ? "Owner and admin roles can activate messages." : "Analyst access is read-only."}>
        <AdminDataTable
          columns={["Title", "Tone", "State", "Schedule", "Link", "Action"]}
          rows={announcements.data.map((announcement) => [
            <div key="title"><p className="font-semibold text-[#F0EAD6]">{announcement.title}</p><p className="text-xs text-[#F0EAD6]/46">{announcement.message}</p></div>,
            announcement.tone,
            <AdminStatusBadge key="state" tone={announcement.is_active ? "success" : "neutral"}>{announcement.is_active ? "Active" : "Inactive"}</AdminStatusBadge>,
            `${announcement.starts_at ?? "Anytime"} - ${announcement.ends_at ?? "No end"}`,
            announcement.link_url ? `${announcement.link_label ?? "Link"}: ${announcement.link_url}` : "None",
            canEdit ? (
              <form key="toggle" action={asAdminFormAction(toggleAnnouncement)}>
                <input type="hidden" name="id" value={announcement.id} />
                <input type="hidden" name="is_active" value={announcement.is_active ? "false" : "true"} />
                <AdminSubmitButton variant="secondary" pendingLabel="Updating...">{announcement.is_active ? "Deactivate" : "Activate"}</AdminSubmitButton>
              </form>
            ) : "Read-only",
          ])}
          empty={<AdminEmptyState title="No announcements" description="Announcements will appear here when they are created." />}
        />
      </AdminSectionCard>
    </div>
  );
}
