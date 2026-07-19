"use server";

import { requireAdmin } from "@/lib/admin/auth";
import { writeAuditLog } from "@/lib/admin/audit";
import { canManageInbox } from "@/lib/admin/permissions";
import { createClient } from "@/lib/supabase/server";

export async function deleteFeedbackQuery(id: string) {
  const admin = await requireAdmin();
  if (!canManageInbox(admin.role)) {
    return { ok: false as const, message: "You do not have permission to delete inbox messages." };
  }
  if (!id) return { ok: false as const, message: "Choose a valid message." };

  const supabase = await createClient();
  const { error } = await supabase.from("feedback_queries").delete().eq("id", id);

  if (error) return { ok: false as const, message: "Message could not be deleted." };

  await writeAuditLog({
    action: "feedback_query.delete",
    entityType: "feedback_query",
    entityId: id,
    summary: "Deleted a feedback/query inbox message.",
    changes: null,
  });

  return { ok: true as const, message: "Message deleted." };
}
