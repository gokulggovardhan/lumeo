"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { writeAuditLog } from "@/lib/admin/audit";
import { canManageTools } from "@/lib/admin/permissions";
import { createClient } from "@/lib/supabase/server";
import {
  errorState,
  formBoolean,
  formNumber,
  formString,
  successState,
  validateToolStatus,
} from "@/lib/admin/validation";

export async function updateToolStatus(formData: FormData) {
  const admin = await requireAdmin();
  if (!canManageTools(admin.role)) return errorState("You do not have permission to update tools.");

  const id = formString(formData, "id", 80);
  const status = formString(formData, "status", 40);
  if (!id || !validateToolStatus(status)) return errorState("Choose a valid tool status.");

  const supabase = await createClient();
  const { error } = await supabase.from("pdf_tools").update({ status }).eq("id", id);
  if (error) return errorState("Tool status could not be updated.");

  await writeAuditLog({
    action: "tool.status.update",
    entityType: "pdf_tool",
    entityId: id,
    summary: `Updated PDF tool status to ${status}.`,
    changes: { status },
  });
  revalidatePath("/admin/tools");
  return successState("Tool status updated.");
}

export async function updateToolMaintenanceMessage(formData: FormData) {
  const admin = await requireAdmin();
  if (!canManageTools(admin.role)) return errorState("You do not have permission to update tools.");

  const id = formString(formData, "id", 80);
  const message = formString(formData, "maintenance_message", 300);
  if (!id) return errorState("Choose a valid tool.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("pdf_tools")
    .update({ maintenance_message: message || null })
    .eq("id", id);
  if (error) return errorState("Maintenance message could not be updated.");

  await writeAuditLog({
    action: "tool.maintenance_message.update",
    entityType: "pdf_tool",
    entityId: id,
    summary: message ? "Set a PDF tool's maintenance message." : "Cleared a PDF tool's maintenance message.",
    changes: { maintenance_message: message || null },
  });
  revalidatePath("/admin/tools");
  revalidatePath("/admin/homepage");
  return successState("Maintenance message updated.");
}

export async function updateToolEnabled(formData: FormData) {
  const admin = await requireAdmin();
  if (!canManageTools(admin.role)) return errorState("You do not have permission to update tools.");

  const id = formString(formData, "id", 80);
  const isEnabled = formBoolean(formData, "is_enabled");
  if (!id) return errorState("Choose a valid tool.");

  const supabase = await createClient();
  const { error } = await supabase.from("pdf_tools").update({ is_enabled: isEnabled }).eq("id", id);
  if (error) return errorState("Tool availability could not be updated.");

  await writeAuditLog({
    action: "tool.enabled.update",
    entityType: "pdf_tool",
    entityId: id,
    summary: isEnabled ? "Enabled a PDF tool." : "Disabled a PDF tool.",
    changes: { is_enabled: isEnabled },
  });
  revalidatePath("/admin/tools");
  revalidatePath("/admin/homepage");
  return successState("Tool availability updated.");
}

export async function updateToolCategory(formData: FormData) {
  const admin = await requireAdmin();
  if (!canManageTools(admin.role)) return errorState("You do not have permission to update tools.");

  const id = formString(formData, "id", 80);
  const categoryId = formString(formData, "category_id", 80) || null;
  if (!id) return errorState("Choose a valid tool.");

  const supabase = await createClient();
  const { error } = await supabase.from("pdf_tools").update({ category_id: categoryId }).eq("id", id);
  if (error) return errorState("Tool category could not be updated.");

  await writeAuditLog({
    action: "tool.category.update",
    entityType: "pdf_tool",
    entityId: id,
    summary: "Updated PDF tool category.",
    changes: { category_id: categoryId },
  });
  revalidatePath("/admin/tools");
  return successState("Tool category updated.");
}

export async function updateToolSortOrder(formData: FormData) {
  const admin = await requireAdmin();
  if (!canManageTools(admin.role)) return errorState("You do not have permission to update tools.");

  const id = formString(formData, "id", 80);
  const sortOrder = formNumber(formData, "sort_order", 0);
  if (!id) return errorState("Choose a valid tool.");

  const supabase = await createClient();
  const { error } = await supabase.from("pdf_tools").update({ sort_order: sortOrder }).eq("id", id);
  if (error) return errorState("Tool order could not be updated.");

  await writeAuditLog({
    action: "tool.sort.update",
    entityType: "pdf_tool",
    entityId: id,
    summary: "Updated PDF tool sort order.",
    changes: { sort_order: sortOrder },
  });
  revalidatePath("/admin/tools");
  return successState("Tool order updated.");
}
