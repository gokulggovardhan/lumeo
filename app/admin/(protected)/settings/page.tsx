import { AdminDataTable } from "@/components/admin/AdminDataTable";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminFormField } from "@/components/admin/AdminFormField";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminSectionCard } from "@/components/admin/AdminSectionCard";
import { AdminSubmitButton } from "@/components/admin/AdminSubmitButton";
import { requireAdmin } from "@/lib/admin/auth";
import { getSiteSettings } from "@/lib/admin/data";
import { asAdminFormAction } from "@/lib/admin/form-action";
import { canManageSettings } from "@/lib/admin/permissions";
import { formatAdminDate } from "@/lib/admin/timezone";
import { updateSiteSetting } from "@/app/admin/(protected)/settings/actions";

const liveSettings = [
  [
    "maintenance_mode",
    "Maintenance mode",
    "When enabled, every public route shows the maintenance page. /admin stays reachable so you can turn it back off.",
  ],
  [
    "public_analytics_enabled",
    "Public analytics",
    "Enables privacy-preserving product-use events. Do Not Track is still respected.",
  ],
] as const satisfies ReadonlyArray<readonly [string, string, string]>;

const liveSettingKeys = new Set<string>(liveSettings.map(([key]) => key));

function settingMessageValue(value: unknown, field: "title" | "message") {
  if (value && typeof value === "object" && field in value) {
    const text = (value as { title?: unknown; message?: unknown })[field];
    return typeof text === "string" ? text : "";
  }
  return "";
}

function isEnabled(value: unknown) {
  return Boolean(
    value &&
      typeof value === "object" &&
      "enabled" in value &&
      (value as { enabled?: unknown }).enabled === true,
  );
}

export default async function SettingsPage() {
  const admin = await requireAdmin();
  const settings = await getSiteSettings();
  const canEdit = canManageSettings(admin.role);
  const visibleSettings = settings.data.filter((setting) =>
    liveSettingKeys.has(setting.key),
  );
  const settingMap = new Map(
    visibleSettings.map((setting) => [setting.key, setting]),
  );

  return (
    <div className="space-y-7">
      <AdminPageHeader
        eyebrow="Owner controls"
        title="Settings"
        description="Only controls that change live Lumeo behavior are exposed here."
      />

      {canEdit ? (
        <AdminSectionCard
          title="Live controls"
          description="Owner-only controls. Changes take effect on the public site after saving."
        >
          <div className="grid gap-4 lg:grid-cols-2">
            {liveSettings.map(([key, label, description]) => {
              const current = settingMap.get(key);
              const enabled = isEnabled(current?.value);
              const isMaintenanceMode = key === "maintenance_mode";

              return (
                <form
                  key={key}
                  action={asAdminFormAction(updateSiteSetting)}
                  className={`rounded-2xl border p-4 ${
                    isMaintenanceMode && enabled
                      ? "border-[var(--border-danger)] bg-[var(--surface-danger)]/10"
                      : "border-[var(--border-subtle)] bg-[var(--surface-elevated)]"
                  }`}
                >
                  <input type="hidden" name="key" value={key} />
                  <input type="hidden" name="description" value={description} />

                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-[#F0EAD6]">
                      {label}
                    </p>
                    {isMaintenanceMode && enabled ? (
                      <span className="rounded-full bg-[var(--surface-danger)] px-2.5 py-1 text-xs font-bold text-[var(--text-danger)]">
                        Live: site is down for visitors
                      </span>
                    ) : null}
                  </div>

                  <p className="mt-1 text-xs leading-5 text-[#F0EAD6]/48">
                    {description}
                  </p>

                  <label className="mt-3 flex min-h-11 items-center gap-3 text-sm font-semibold text-[#F0EAD6]">
                    <input
                      type="checkbox"
                      name="value"
                      defaultChecked={enabled}
                      className="h-4 w-4"
                    />
                    Enabled
                  </label>

                  {isMaintenanceMode ? (
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <AdminFormField
                        label="Title (optional)"
                        name="maintenance_title"
                        defaultValue={settingMessageValue(
                          current?.value,
                          "title",
                        )}
                        help="Defaults to “Under maintenance” if left blank."
                      />
                      <AdminFormField
                        label="Message (optional)"
                        name="maintenance_message"
                        defaultValue={settingMessageValue(
                          current?.value,
                          "message",
                        )}
                        help="Defaults to a short standard message if left blank."
                      />
                    </div>
                  ) : null}

                  <AdminSubmitButton pendingLabel="Saving...">
                    Save
                  </AdminSubmitButton>
                </form>
              );
            })}
          </div>
        </AdminSectionCard>
      ) : null}

      <AdminSectionCard
        title="Current state"
        description={
          canEdit
            ? "Only live, operator-facing settings are shown."
            : "Your access is read-only."
        }
      >
        <AdminDataTable
          columns={["Control", "State", "Updated"]}
          rows={visibleSettings.map((setting) => [
            liveSettings.find(([key]) => key === setting.key)?.[1] ??
              setting.key,
            isEnabled(setting.value) ? "Enabled" : "Disabled",
            formatAdminDate(setting.updated_at),
          ])}
          empty={
            <AdminEmptyState
              title="No live settings stored"
              description="Save a live control above to create its database value."
            />
          }
        />
      </AdminSectionCard>
    </div>
  );
}
