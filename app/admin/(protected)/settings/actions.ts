"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { writeAuditLog } from "@/lib/admin/audit";
import { canManageSettings } from "@/lib/admin/permissions";
import { createClient } from "@/lib/supabase/server";
import {
  errorState,
  formBoolean,
  formString,
  isAllowedSetting,
  successState,
} from "@/lib/admin/validation";
import type { Json } from "@/lib/supabase/database.types";

function isEnabledValue(value: Json | null | undefined) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      "enabled" in value &&
      value.enabled === true,
  );
}

function settingValue(key: string, formData: FormData): Json {
  if (key === "maintenance_mode") {
    return {
      enabled: formBoolean(formData, "value"),
      title: formString(formData, "maintenance_title", 100) || null,
      message: formString(formData, "maintenance_message", 500) || null,
    };
  }

  return { enabled: formBoolean(formData, "value") };
}

export async function updateSiteSetting(formData: FormData) {
  const admin = await requireAdmin();
  if (!canManageSettings(admin.role)) {
    return errorState("Only owners can manage workspace settings.");
  }

  const key = formString(formData, "key", 100);
  if (!isAllowedSetting(key)) {
    return errorState("That setting is not an active Lumeo control.");
  }

  const value = settingValue(key, formData);
  const enabled = isEnabledValue(value);
  const supabase = await createClient();

  if (key === "maintenance_mode" && enabled) {
    const { data: current, error: currentError } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", key)
      .maybeSingle();

    if (currentError) {
      return errorState("Maintenance mode state could not be verified.");
    }

    const wasEnabled = isEnabledValue(
      (current as { value?: Json } | null)?.value,
    );
    if (
      !wasEnabled &&
      formString(formData, "maintenance_confirmation", 30) !== "confirm-enable"
    ) {
      return errorState("Confirm Maintenance mode before enabling it.");
    }
  }

  const { error } = await supabase.from("site_settings").upsert({
    key,
    value,
    description: formString(formData, "description", 240) || null,
    // Both exposed controls are intentionally consumed by public RPC/proxy
    // paths, so their rows must remain public-readable through those
    // constrained interfaces.
    is_public: true,
    updated_by: admin.userId,
    updated_at: new Date().toISOString(),
  });

  if (error) return errorState("Setting could not be saved.");

  await writeAuditLog({
    action: "setting.update",
    entityType: "site_setting",
    entityId: key,
    summary:
      key === "maintenance_mode"
        ? `${enabled ? "Enabled" : "Disabled"} maintenance mode.`
        : `Updated live setting ${key}.`,
    changes: { key, enabled },
  });

  revalidatePath("/admin/settings");
  if (key === "public_analytics_enabled") {
    revalidatePath("/");
    revalidatePath("/pdf-tools");
  }

  // maintenance_mode is evaluated by proxy.ts against live database state,
  // so the next public request reflects the new value without a page cache
  // invalidation step.
  return successState("Setting saved.");
}
