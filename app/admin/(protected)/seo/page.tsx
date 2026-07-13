import { AdminDataTable } from "@/components/admin/AdminDataTable";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminFormField } from "@/components/admin/AdminFormField";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminSectionCard } from "@/components/admin/AdminSectionCard";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { AdminSubmitButton } from "@/components/admin/AdminSubmitButton";
import { requireAdmin } from "@/lib/admin/auth";
import { getSeoSettings } from "@/lib/admin/data";
import { asAdminFormAction } from "@/lib/admin/form-action";
import { canManageSeo } from "@/lib/admin/permissions";
import { saveSeoSetting } from "@/app/admin/(protected)/seo/actions";

export default async function SeoPage() {
  const admin = await requireAdmin();
  const seo = await getSeoSettings();
  const canEdit = canManageSeo(admin.role);

  return (
    <div className="space-y-7">
      <AdminPageHeader
        eyebrow="Search foundation"
        title="SEO"
        description="Manage route SEO records in the database. Public page metadata remains static in this phase."
      />
      {canEdit && (
        <AdminSectionCard title="Route SEO record" description="Title maximum 70 characters. Description maximum 170 characters.">
          <form action={asAdminFormAction(saveSeoSetting)} className="grid gap-4 md:grid-cols-2">
            <AdminFormField label="Route" name="route" defaultValue="/" />
            <AdminFormField label="Canonical path" name="canonical_path" defaultValue="/" />
            <AdminFormField label="Title" name="title" />
            <AdminFormField label="Description" name="description" />
            <AdminFormField label="Open Graph title" name="open_graph_title" />
            <AdminFormField label="Open Graph description" name="open_graph_description" />
            <label className="flex min-h-11 items-center gap-3 text-sm font-semibold text-[#F0EAD6]"><input type="checkbox" name="robots_index" defaultChecked className="h-4 w-4" />Index</label>
            <label className="flex min-h-11 items-center gap-3 text-sm font-semibold text-[#F0EAD6]"><input type="checkbox" name="robots_follow" defaultChecked className="h-4 w-4" />Follow</label>
            <div className="md:col-span-2"><AdminSubmitButton pendingLabel="Saving SEO...">Save SEO record</AdminSubmitButton></div>
          </form>
        </AdminSectionCard>
      )}
      <AdminSectionCard title="Route records" description={canEdit ? "Owner and admin roles can update SEO records." : "Analyst access is read-only."}>
        <AdminDataTable
          columns={["Route", "Title", "Description", "Robots", "Updated"]}
          rows={seo.data.map((record) => [
            record.route,
            record.title,
            record.description,
            <AdminStatusBadge key="robots" tone={record.robots_index ? "success" : "warning"}>{record.robots_index ? "Index" : "Noindex"} / {record.robots_follow ? "Follow" : "Nofollow"}</AdminStatusBadge>,
            new Date(record.updated_at).toLocaleDateString(),
          ])}
          empty={<AdminEmptyState title="No SEO records yet" description="Database SEO records will appear here after they are created." />}
        />
      </AdminSectionCard>
    </div>
  );
}
