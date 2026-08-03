"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { writeAuditLog } from "@/lib/admin/audit";
import { canManageErrors } from "@/lib/admin/permissions";
import { createClient } from "@/lib/supabase/server";
import { errorState, formString, successState } from "@/lib/admin/validation";
import type { ErrorStatus } from "@/lib/supabase/database.types";

async function setErrorStatus(formData: FormData, status: ErrorStatus) {
  const admin = await requireAdmin();
  if (!canManageErrors(admin.role)) return errorState("You do not have permission to manage error logs.");

  const id = formString(formData, "id", 40);
  if (!id) return errorState("Choose a valid error log.");

  const supabase = await createClient();
  const payload: Record<string, unknown> = { status };
  if (status === "resolved") {
    payload.resolved_at = new Date().toISOString();
    payload.resolved_by = admin.userId;
  } else if (status === "open") {
    payload.resolved_at = null;
    payload.resolved_by = null;
  }

  const { error } = await supabase.from("error_logs").update(payload).eq("id", id);
  if (error) return errorState("Error log could not be updated.");

  await writeAuditLog({
    action: `error_log.${status}`,
    entityType: "error_log",
    entityId: id,
    summary: `Marked error log #${id} as ${status}.`,
  });
  revalidatePath("/admin/errors");
  return successState(`Marked as ${status}.`);
}

export async function resolveErrorLog(formData: FormData) {
  return setErrorStatus(formData, "resolved");
}

export async function ignoreErrorLog(formData: FormData) {
  return setErrorStatus(formData, "ignored");
}

export async function reopenErrorLog(formData: FormData) {
  return setErrorStatus(formData, "open");
}
