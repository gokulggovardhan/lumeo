import { AdminDataTable } from "@/components/admin/AdminDataTable";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminFormField } from "@/components/admin/AdminFormField";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminSectionCard } from "@/components/admin/AdminSectionCard";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { AdminSubmitButton } from "@/components/admin/AdminSubmitButton";
import { requireAdmin } from "@/lib/admin/auth";
import { getSiteSettings } from "@/lib/admin/data";
import { asAdminFormAction } from "@/lib/admin/form-action";
import { canManageSettings } from "@/lib/admin/permissions";
import { updateSiteSetting } from "@/app/admin/(protected)/settings/actions";

const approvedSettings = [
  ["workspace_display_name", "Workspace display name", "Public-facing workspace label."],
  ["support_email", "Support email", "Contact email shown where approved."],
  ["contact_page_enabled", "Contact page enabled", "Database setting only in this phase."],
  ["maintenance_mode", "Maintenance mode", "Stored only; no public behavior yet."],
  ["public_analytics_enabled", "Public analytics enabled", "Stored only; no tracking in this phase."],
  ["homepage_privacy_message", "Homepage privacy message", "Future homepage copy foundation."],
  ["default_seo_suffix", "Default SEO suffix", "Future SEO helper text."],
] as const;

function settingDisplay(value: unknown) {
  if (value && typeof value === "object" && "text" in value) {
    const text = (value as { text?: unknown }).text;
    return typeof text === "string" ? text : "";
  }
  if (value && typeof value === "object" && "enabled" in value) {
    return (value as { enabled?: unknown }).enabled ? "Enabled" : "Disabled";
  }
  return "Not configured";
}

export default async function SettingsPage() {
  const admin = await requireAdmin();
  const settings = await getSiteSettings();
  const canEdit = canManageSettings(admin.role);
  const settingMap = new Map(settings.data.map((setting) => [setting.key, setting]));

  return (
    <div className="space-y-7">
      <AdminPageHeader
        eyebrow="Owner controls"
        title="Settings"
        description="Approved workspace settings only. Secrets and arbitrary values are intentionally blocked."
      />
      {canEdit && (
        <AdminSectionCard title="Approved settings" description="Owner-only controls. Maintenance mode is stored but not applied publicly in this phase.">
          <div className="grid gap-4 lg:grid-cols-2">
            {approvedSettings.map(([key, label, description]) => {
              const current = settingMap.get(key);
              const isBoolean = key === "contact_page_enabled" || key === "maintenance_mode" || key === "public_analytics_enabled";
              return (
                <form key={key} action={asAdminFormAction(updateSiteSetting)} className="rounded-2xl border border-[#E8DFC8]/8 bg-[#0C1220]/44 p-4">
                  <input type="hidden" name="key" value={key} />
                  <input type="hidden" name="description" value={description} />
                  <p className="text-sm font-semibold text-[#F0EAD6]">{label}</p>
                  <p className="mt-1 text-xs leading-5 text-[#F0EAD6]/48">{description}</p>
                  {isBoolean ? (
                    <label className="mt-3 flex min-h-11 items-center gap-3 text-sm font-semibold text-[#F0EAD6]">
                      <input type="checkbox" name="value" defaultChecked={settingDisplay(current?.value) === "Enabled"} className="h-4 w-4" />
                      Enabled
                    </label>
                  ) : (
                    <AdminFormField label="Value" name="value" defaultValue={settingDisplay(current?.value)} />
                  )}
                  <label className="mt-3 flex min-h-11 items-center gap-3 text-sm font-semibold text-[#F0EAD6]">
                    <input type="checkbox" name="is_public" defaultChecked={current?.is_public ?? false} className="h-4 w-4" />
                    Public setting flag
                  </label>
                  <AdminSubmitButton pendingLabel="Saving...">Save setting</AdminSubmitButton>
                </form>
              );
            })}
          </div>
        </AdminSectionCard>
      )}
      <AdminSectionCard title="Current settings" description={canEdit ? "Stored database values." : "Analyst access is read-only."}>
        <AdminDataTable
          columns={["Key", "Value", "Public", "Updated"]}
          rows={settings.data.map((setting) => [
            setting.key,
            settingDisplay(setting.value),
            <AdminStatusBadge key="public" tone={setting.is_public ? "success" : "neutral"}>{setting.is_public ? "Public flag" : "Private"}</AdminStatusBadge>,
            new Date(setting.updated_at).toLocaleDateString(),
          ])}
          empty={<AdminEmptyState title="No settings stored" description="Approved settings will appear here after an owner saves them." />}
        />
      </AdminSectionCard>
    </div>
  );
}
