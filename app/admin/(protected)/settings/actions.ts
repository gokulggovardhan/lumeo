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
  if (key === "maintenance_mode") {
    return {
      enabled: formBoolean(formData, "value"),
      title: formString(formData, "maintenance_title", 100) || null,
      message: formString(formData, "maintenance_message", 500) || null,
    };
  }

  if (key === "contact_page_enabled" || key === "public_analytics_enabled") {
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
  // maintenance_mode's public effect runs entirely through
  // get_public_maintenance_status(), which only reads this row when
  // is_public is true. Forcing it here (rather than trusting the generic
  // checkbox) means an owner can't silently break the toggle by unchecking
  // an unrelated-looking "Public setting flag" box.
  const isPublic = key === "maintenance_mode" ? true : formBoolean(formData, "is_public");
  const supabase = await createClient();
  const { error } = await supabase.from("site_settings").upsert({
    key,
    value,
    description: formString(formData, "description", 240) || null,
    is_public: isPublic,
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
  // maintenance_mode needs no revalidatePath: the gate lives in proxy.ts
  // (middleware), which reads live DB state per request, not the Next.js
  // data cache -- the very next request reflects the new value.
  return successState("Setting saved.");
}
