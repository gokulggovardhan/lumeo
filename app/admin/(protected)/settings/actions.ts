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

function settingValue(key: string, formData: FormData): Json {
  if (key === "contact_page_enabled" || key === "maintenance_mode" || key === "public_analytics_enabled") {
    return { enabled: formBoolean(formData, "value") };
  }

  return { text: formString(formData, "value", 240) };
}

export async function updateSiteSetting(formData: FormData) {
  const admin = await requireAdmin();
  if (!canManageSettings(admin.role)) return errorState("Only owners can manage workspace settings.");

  const key = formString(formData, "key", 100);
  if (!isAllowedSetting(key)) return errorState("That setting is not approved for editing.");

  const value = settingValue(key, formData);
  const supabase = await createClient();
  const { error } = await supabase.from("site_settings").upsert({
    key,
    value,
    description: formString(formData, "description", 240) || null,
    is_public: formBoolean(formData, "is_public"),
    updated_by: admin.userId,
    updated_at: new Date().toISOString(),
  });

  if (error) return errorState("Setting could not be saved.");

  await writeAuditLog({
    action: "setting.update",
    entityType: "site_setting",
    entityId: key,
    summary: `Updated approved setting ${key}.`,
    changes: { key },
  });
  revalidatePath("/admin/settings");
  if (key === "public_analytics_enabled") {
    revalidatePath("/");
    revalidatePath("/pdf-tools");
  }
  return successState("Setting saved.");
}
