import Link from "next/link";
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
import { deleteSeoSetting, saveSeoSetting } from "@/app/admin/(protected)/seo/actions";

// Known public routes this app actually serves (excludes /admin/** and
// /maintenance, which are intentionally noindex). Kept as a plain list
// rather than a filesystem scan since this is a Server Component -- update
// it when a new public page is added.
const publicRoutes = [
  "/",
  "/about",
  "/accessibility",
  "/contact",
  "/features",
  "/guides",
  "/pdf-tools",
  "/privacy",
  "/security",
  "/terms",
  "/pdf",
  "/pdf/compress",
  "/pdf/jpg-to-pdf",
  "/pdf/merge",
  "/pdf/pdf-to-jpg",
  "/pdf/split",
];

export default async function SeoPage({
  searchParams,
}: {
  searchParams?: Promise<{ route?: string }>;
}) {
  const admin = await requireAdmin();
  const seo = await getSeoSettings();
  const canEdit = canManageSeo(admin.role);
  const params = (await searchParams) ?? {};
  const configuredRoutes = new Set(seo.data.map((record) => record.route));
  const missingRoutes = publicRoutes.filter((route) => !configuredRoutes.has(route));
  const prefillRoute = params.route && publicRoutes.includes(params.route) ? params.route : "/";
  const existing = seo.data.find((record) => record.route === prefillRoute);

  return (
    <div className="space-y-7">
      <AdminPageHeader
        eyebrow="Search foundation"
        title="SEO"
        description="Manage route SEO records in the database. Public page metadata remains static in this phase."
      />

      <AdminSectionCard
        title={`Route coverage — ${publicRoutes.length - missingRoutes.length}/${publicRoutes.length} configured`}
        description={missingRoutes.length === 0 ? "Every known public route has an SEO record." : "Routes below have no SEO record yet."}
      >
        {missingRoutes.length === 0 ? (
          <AdminEmptyState title="Full coverage" description="Every known public route has an SEO record." />
        ) : (
          <div className="flex flex-wrap gap-2">
            {missingRoutes.map((route) => (
              <Link
                key={route}
                href={canEdit ? `/admin/seo?route=${encodeURIComponent(route)}` : "/admin/seo"}
                className="rounded-full border border-[rgba(var(--ruby-rgb),0.4)] bg-[rgba(var(--ruby-rgb),0.12)] px-3 py-1.5 text-xs font-semibold text-[#FFD9D9] transition hover:border-[rgba(var(--ruby-rgb),0.65)]"
              >
                {route}
              </Link>
            ))}
          </div>
        )}
      </AdminSectionCard>

      {canEdit && (
        <AdminSectionCard title={existing ? `Edit "${prefillRoute}"` : "Route SEO record"} description="Title maximum 70 characters. Description maximum 170 characters.">
          <form action={asAdminFormAction(saveSeoSetting)} className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm font-semibold text-[#F0EAD6]">
              Route
              <select name="route" defaultValue={prefillRoute} className="mt-2 min-h-11 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-input)] px-3 text-sm">
                {publicRoutes.map((route) => (
                  <option key={route} value={route}>
                    {route} {configuredRoutes.has(route) ? "" : "— missing"}
                  </option>
                ))}
              </select>
            </label>
            <AdminFormField label="Canonical path" name="canonical_path" defaultValue={existing?.canonical_path ?? prefillRoute} />
            <AdminFormField label="Title" name="title" defaultValue={existing?.title ?? ""} />
            <AdminFormField label="Description" name="description" defaultValue={existing?.description ?? ""} />
            <AdminFormField label="Open Graph title" name="open_graph_title" defaultValue={existing?.open_graph_title ?? ""} />
            <AdminFormField label="Open Graph description" name="open_graph_description" defaultValue={existing?.open_graph_description ?? ""} />
            <label className="flex min-h-11 items-center gap-3 text-sm font-semibold text-[#F0EAD6]"><input type="checkbox" name="robots_index" defaultChecked={existing?.robots_index ?? true} className="h-4 w-4" />Index</label>
            <label className="flex min-h-11 items-center gap-3 text-sm font-semibold text-[#F0EAD6]"><input type="checkbox" name="robots_follow" defaultChecked={existing?.robots_follow ?? true} className="h-4 w-4" />Follow</label>
            <div className="md:col-span-2"><AdminSubmitButton pendingLabel="Saving SEO...">Save SEO record</AdminSubmitButton></div>
          </form>
        </AdminSectionCard>
      )}
      <AdminSectionCard title="Route records" description={canEdit ? "Owner and admin roles can update or delete SEO records." : "Analyst access is read-only."}>
        <AdminDataTable
          columns={["Route", "Title", "Description", "Robots", "Updated", "Action"]}
          rows={seo.data.map((record) => [
            record.route,
            record.title,
            record.description,
            <AdminStatusBadge key="robots" tone={record.robots_index ? "success" : "warning"}>{record.robots_index ? "Index" : "Noindex"} / {record.robots_follow ? "Follow" : "Nofollow"}</AdminStatusBadge>,
            new Date(record.updated_at).toLocaleDateString(),
            canEdit ? (
              <div key="actions" className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/admin/seo?route=${encodeURIComponent(record.route)}`}
                  className="rounded-lg border border-[#E8DFC8]/12 px-3 py-1.5 text-xs font-semibold text-[#F0EAD6]/80 hover:border-[#E8DFC8]/24"
                >
                  Edit
                </Link>
                <form action={asAdminFormAction(deleteSeoSetting)}>
                  <input type="hidden" name="route" value={record.route} />
                  <AdminSubmitButton
                    variant="secondary"
                    pendingLabel="Deleting..."
                    confirmMessage={`Delete the SEO record for "${record.route}"? This removes its title, description, and robots directives from the live site.`}
                  >
                    Delete
                  </AdminSubmitButton>
                </form>
              </div>
            ) : "Read-only",
          ])}
          empty={<AdminEmptyState title="No SEO records yet" description="Database SEO records will appear here after they are created." />}
        />
      </AdminSectionCard>
    </div>
  );
}
