"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { writeAuditLog } from "@/lib/admin/audit";
import { canManageFeatureFlags } from "@/lib/admin/permissions";
import { createClient } from "@/lib/supabase/server";
import {
  errorState,
  formBoolean,
  formString,
  parseJsonConfig,
  successState,
  validateEnvironment,
  validateSlug,
} from "@/lib/admin/validation";

export async function saveFeatureFlag(formData: FormData) {
  const admin = await requireAdmin();
  if (!canManageFeatureFlags(admin.role)) return errorState("You do not have permission to manage feature flags.");

  const id = formString(formData, "id", 80);
  const key = formString(formData, "key", 80);
  const name = formString(formData, "name", 120);
  const description = formString(formData, "description", 300) || null;
  const environment = formString(formData, "environment", 40);
  const isEnabled = formBoolean(formData, "is_enabled");
  const config = parseJsonConfig(formString(formData, "config", 2000));

  if (!validateSlug(key) || !name || !validateEnvironment(environment)) {
    return errorState("Enter a valid key, name, and environment.");
  }
  if (!config.ok) return errorState(config.message);

  const supabase = await createClient();
  const payload = {
    key,
    name,
    description,
    environment,
    is_enabled: isEnabled,
    config: config.value,
    updated_by: admin.userId,
  };
  const { error } = id
    ? await supabase.from("feature_flags").update(payload).eq("id", id)
    : await supabase.from("feature_flags").insert(payload);

  if (error) return errorState("Feature flag could not be saved.");

  await writeAuditLog({
    action: id ? "feature_flag.update" : "feature_flag.create",
    entityType: "feature_flag",
    entityId: id || key,
    summary: id ? "Updated a feature flag." : "Created a feature flag.",
    changes: { key, environment, is_enabled: isEnabled },
  });
  revalidatePath("/admin/feature-flags");
  return successState("Feature flag saved.");
}

export async function toggleFeatureFlag(formData: FormData) {
  const admin = await requireAdmin();
  if (!canManageFeatureFlags(admin.role)) return errorState("You do not have permission to manage feature flags.");

  const id = formString(formData, "id", 80);
  const isEnabled = formBoolean(formData, "is_enabled");
  if (!id) return errorState("Choose a valid feature flag.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("feature_flags")
    .update({ is_enabled: isEnabled, updated_by: admin.userId })
    .eq("id", id);

  if (error) return errorState("Feature flag could not be updated.");

  await writeAuditLog({
    action: "feature_flag.toggle",
    entityType: "feature_flag",
    entityId: id,
    summary: isEnabled ? "Enabled a feature flag." : "Disabled a feature flag.",
    changes: { is_enabled: isEnabled },
  });
  revalidatePath("/admin/feature-flags");
  return successState("Feature flag updated.");
}
