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
  ["maintenance_mode", "Maintenance mode", "When enabled, every public route shows the maintenance page. /admin stays reachable so you can turn it back off."],
  ["public_analytics_enabled", "Public analytics enabled", "Enables optional anonymous product-use events. Do Not Track is still respected."],
] as const satisfies ReadonlyArray<readonly [string, string, string]>;

function settingMessageValue(value: unknown, field: "title" | "message") {
  if (value && typeof value === "object" && field in value) {
    const text = (value as { title?: unknown; message?: unknown })[field];
    return typeof text === "string" ? text : "";
  }
  return "";
}

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
        <AdminSectionCard title="Approved settings" description="Owner-only controls. Maintenance mode takes effect on the public site immediately after saving.">
          <div className="grid gap-4 lg:grid-cols-2">
            {approvedSettings.map(([key, label, description]) => {
              const current = settingMap.get(key);
              const isBoolean = key === "maintenance_mode" || key === "public_analytics_enabled";
              const isMaintenanceMode = key === "maintenance_mode";
              const isCurrentlyEnabled = isMaintenanceMode && settingDisplay(current?.value) === "Enabled";
              return (
                <form
                  key={key}
                  action={asAdminFormAction(updateSiteSetting)}
                  className={`rounded-2xl border p-4 ${
                    isMaintenanceMode
                      ? `lg:col-span-2 ${isCurrentlyEnabled ? "border-[var(--border-danger)] bg-[var(--surface-danger)]/10" : "border-[var(--border-subtle)] bg-[var(--surface-elevated)]"}`
                      : "border-[var(--border-subtle)] bg-[var(--surface-elevated)]"
                  }`}
                >
                  <input type="hidden" name="key" value={key} />
                  <input type="hidden" name="description" value={description} />
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-[#F0EAD6]">{label}</p>
                    {isCurrentlyEnabled ? (
                      <span className="rounded-full bg-[var(--surface-danger)] px-2.5 py-1 text-xs font-bold text-[var(--text-danger)]">
                        Live: site is down for visitors
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs leading-5 text-[#F0EAD6]/48">{description}</p>
                  {isBoolean ? (
                    <label className="mt-3 flex min-h-11 items-center gap-3 text-sm font-semibold text-[#F0EAD6]">
                      <input type="checkbox" name="value" defaultChecked={settingDisplay(current?.value) === "Enabled"} className="h-4 w-4" />
                      Enabled
                    </label>
                  ) : (
                    <AdminFormField label="Value" name="value" defaultValue={settingDisplay(current?.value)} />
                  )}
                  {isMaintenanceMode ? (
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <AdminFormField
                        label="Title (optional)"
                        name="maintenance_title"
                        defaultValue={settingMessageValue(current?.value, "title")}
                        help="Defaults to “Under maintenance” if left blank."
                      />
                      <AdminFormField
                        label="Message (optional)"
                        name="maintenance_message"
                        defaultValue={settingMessageValue(current?.value, "message")}
                        help="Defaults to a short standard message if left blank."
                      />
                    </div>
                  ) : null}
                  {isMaintenanceMode ? (
                    <p className="mt-3 text-xs leading-5 text-[#F0EAD6]/48">
                      Always public by design — this is the only way visitors see the maintenance page.
                    </p>
                  ) : (
                    <label className="mt-3 flex min-h-11 items-center gap-3 text-sm font-semibold text-[#F0EAD6]">
                      <input type="checkbox" name="is_public" defaultChecked={current?.is_public ?? false} className="h-4 w-4" />
                      Public setting flag
                    </label>
                  )}
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
