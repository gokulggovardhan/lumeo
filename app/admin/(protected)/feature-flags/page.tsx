import { AdminDataTable } from "@/components/admin/AdminDataTable";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminFormField } from "@/components/admin/AdminFormField";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminSectionCard } from "@/components/admin/AdminSectionCard";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { AdminSubmitButton } from "@/components/admin/AdminSubmitButton";
import { requireAdmin } from "@/lib/admin/auth";
import { getFeatureFlags } from "@/lib/admin/data";
import { asAdminFormAction } from "@/lib/admin/form-action";
import { canManageFeatureFlags } from "@/lib/admin/permissions";
import { saveFeatureFlag, toggleFeatureFlag } from "@/app/admin/(protected)/feature-flags/actions";
import type { FeatureFlag } from "@/lib/supabase/database.types";

function effectiveStatus(flag: FeatureFlag): { label: string; tone: "success" | "neutral" | "warning" | "danger" } {
  if (!flag.is_enabled) return { label: "Disabled", tone: "neutral" };
  const now = Date.now();
  if (flag.activate_at && new Date(flag.activate_at).getTime() > now) {
    return { label: "Scheduled", tone: "warning" };
  }
  if (flag.deactivate_at && new Date(flag.deactivate_at).getTime() <= now) {
    return { label: "Expired", tone: "danger" };
  }
  return { label: flag.rollout_percentage < 100 ? `Enabled (${flag.rollout_percentage}%)` : "Enabled", tone: "success" };
}

export default async function FeatureFlagsPage() {
  const admin = await requireAdmin();
  const flags = await getFeatureFlags();
  const canEdit = canManageFeatureFlags(admin.role);

  return (
    <div className="space-y-7">
      <AdminPageHeader
        eyebrow="Operational controls"
        title="Feature Flags"
        description="Manage feature state by environment. No public behavior is changed until application code reads these records."
      />
      {canEdit && (
        <AdminSectionCard title="Create feature flag" description="Use safe JSON configuration only. Do not store secrets.">
          <form action={asAdminFormAction(saveFeatureFlag)} className="grid gap-4 md:grid-cols-2">
            <AdminFormField label="Key" name="key" help="Lowercase letters, numbers, and hyphens." />
            <AdminFormField label="Name" name="name" />
            <AdminFormField label="Description" name="description" />
            <label className="block text-sm font-semibold text-[#F0EAD6]">
              Environment
              <select name="environment" defaultValue="production" className="mt-2 min-h-11 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-input)] px-3 text-sm">
                {["production", "preview", "development", "all"].map((environment) => (
                  <option key={environment} value={environment}>{environment}</option>
                ))}
              </select>
            </label>
            <AdminFormField label="Config JSON" name="config" defaultValue="{}" help="JSON object only." />
            <label className="block text-sm font-semibold text-[#F0EAD6]">
              Rollout percentage
              <input
                type="number"
                name="rollout_percentage"
                min={0}
                max={100}
                defaultValue={100}
                className="mt-2 min-h-11 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-input)] px-3 text-sm text-[var(--lumeo-paper-50)]"
              />
              <span className="mt-1 block text-xs font-normal text-[var(--lumeo-paper-400)]">Informational until application code reads flags.</span>
            </label>
            <AdminFormField label="Activate at (optional)" name="activate_at" type="datetime-local" help="Shows as “Scheduled” before this time." />
            <AdminFormField label="Deactivate at (optional)" name="deactivate_at" type="datetime-local" help="Shows as “Expired” after this time." />
            <label className="flex min-h-11 items-center gap-3 text-sm font-semibold text-[#F0EAD6]">
              <input type="checkbox" name="is_enabled" className="h-4 w-4" />
              Enabled
            </label>
            <div className="md:col-span-2">
              <AdminSubmitButton pendingLabel="Saving flag...">Create flag</AdminSubmitButton>
            </div>
          </form>
        </AdminSectionCard>
      )}
      <AdminSectionCard title="Flags by environment" description={canEdit ? "Owner and admin roles can toggle flags." : "Analyst access is read-only."}>
        <AdminDataTable
          columns={["Key", "Name", "Environment", "State", "Updated", "Action"]}
          rows={flags.data.map((flag) => {
            const status = effectiveStatus(flag);
            return [
            flag.key,
            <div key="name"><p className="font-semibold text-[#F0EAD6]">{flag.name}</p><p className="text-xs text-[#F0EAD6]/46">{flag.description ?? "No description"}</p></div>,
            flag.environment,
            <AdminStatusBadge key="state" tone={status.tone}>{status.label}</AdminStatusBadge>,
            new Date(flag.updated_at).toLocaleDateString(),
            canEdit ? (
              <form key="toggle" action={asAdminFormAction(toggleFeatureFlag)}>
                <input type="hidden" name="id" value={flag.id} />
                <input type="hidden" name="is_enabled" value={flag.is_enabled ? "false" : "true"} />
                <AdminSubmitButton variant="secondary" pendingLabel="Updating...">{flag.is_enabled ? "Disable" : "Enable"}</AdminSubmitButton>
              </form>
            ) : "Read-only",
          ];
          })}
          empty={<AdminEmptyState title="No feature flags yet" description="Create flags when a real operational switch is needed." />}
        />
      </AdminSectionCard>
    </div>
  );
}
