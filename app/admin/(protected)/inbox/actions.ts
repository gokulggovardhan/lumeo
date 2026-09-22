"use server";

import { requireAdmin } from "@/lib/admin/auth";
import { writeAuditLog } from "@/lib/admin/audit";
import { canManageInbox } from "@/lib/admin/permissions";
import { canViewInbox } from "@/lib/admin/permissions";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function setFeedbackReadState(id: string, isRead: boolean) {
  const admin = await requireAdmin();
  if (!canViewInbox(admin.role)) {
    return { ok: false as const, message: "You do not have permission to update Inbox messages." };
  }
  if (!id) return { ok: false as const, message: "Choose a valid message." };

  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from("feedback_queries")
    .update({ is_read: isRead })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error || !updated) {
    return { ok: false as const, message: "Message read state could not be updated." };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/inbox");
  return { ok: true as const, message: isRead ? "Marked as read." : "Marked as unread." };
}

export async function deleteFeedbackQuery(id: string) {
  const admin = await requireAdmin();
  if (!canManageInbox(admin.role)) {
    return { ok: false as const, message: "You do not have permission to delete inbox messages." };
  }
  if (!id) return { ok: false as const, message: "Choose a valid message." };

  const supabase = await createClient();
  const { data: deleted, error } = await supabase
    .from("feedback_queries")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error || !deleted) return { ok: false as const, message: "Message could not be deleted." };

  await writeAuditLog({
    action: "feedback_query.delete",
    entityType: "feedback_query",
    entityId: id,
    summary: "Deleted a feedback/query inbox message.",
    changes: null,
  });

  revalidatePath("/admin");
  revalidatePath("/admin/inbox");

  return { ok: true as const, message: "Message deleted." };
}
