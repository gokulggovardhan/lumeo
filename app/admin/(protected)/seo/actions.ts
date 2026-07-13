"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { writeAuditLog } from "@/lib/admin/audit";
import { canManageSeo } from "@/lib/admin/permissions";
import { createClient } from "@/lib/supabase/server";
import {
  errorState,
  formBoolean,
  formString,
  successState,
  validateRoute,
  validateSeoDescription,
  validateSeoTitle,
} from "@/lib/admin/validation";

export async function saveSeoSetting(formData: FormData) {
  const admin = await requireAdmin();
  if (!canManageSeo(admin.role)) return errorState("You do not have permission to manage SEO records.");

  const route = formString(formData, "route", 160);
  const title = formString(formData, "title", 90);
  const description = formString(formData, "description", 200);
  const canonicalPath = formString(formData, "canonical_path", 160) || null;
  const robotsIndex = formBoolean(formData, "robots_index");
  const robotsFollow = formBoolean(formData, "robots_follow");
  const openGraphTitle = formString(formData, "open_graph_title", 90) || null;
  const openGraphDescription = formString(formData, "open_graph_description", 200) || null;

  if (!validateRoute(route) || !validateSeoTitle(title) || !validateSeoDescription(description)) {
    return errorState("Use a route, title under 70 characters, and description under 170 characters.");
  }
  if (canonicalPath && !validateRoute(canonicalPath)) return errorState("Canonical path must begin with /.");

  const supabase = await createClient();
  const { error } = await supabase.from("seo_settings").upsert({
    route,
    title,
    description,
    canonical_path: canonicalPath,
    robots_index: robotsIndex,
    robots_follow: robotsFollow,
    open_graph_title: openGraphTitle,
    open_graph_description: openGraphDescription,
    updated_by: admin.userId,
    updated_at: new Date().toISOString(),
  });

  if (error) return errorState("SEO record could not be saved.");

  await writeAuditLog({
    action: "seo.update",
    entityType: "seo_setting",
    entityId: route,
    summary: `Updated SEO settings for ${route}.`,
    changes: { route, robots_index: robotsIndex, robots_follow: robotsFollow },
  });
  revalidatePath("/admin/seo");
  return successState("SEO record saved.");
}
