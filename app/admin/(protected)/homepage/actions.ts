"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { writeAuditLog } from "@/lib/admin/audit";
import { canManageHomepage } from "@/lib/admin/permissions";
import { createClient } from "@/lib/supabase/server";
import { errorState, formNumber, formString, successState } from "@/lib/admin/validation";

export async function assignHomepageSlot(formData: FormData) {
  const admin = await requireAdmin();
  if (!canManageHomepage(admin.role)) return errorState("You do not have permission to update homepage slots.");

  const slotNumber = formNumber(formData, "slot_number", 0);
  const toolId = formString(formData, "tool_id", 80);
  if (slotNumber < 1 || slotNumber > 5 || !toolId) return errorState("Choose a valid slot and tool.");

  const supabase = await createClient();
  const { data: tool, error: toolError } = await supabase
    .from("pdf_tools")
    .select("id, is_enabled, is_homepage_eligible")
    .eq("id", toolId)
    .maybeSingle();

  if (toolError || !tool || !tool.is_enabled || !tool.is_homepage_eligible) {
    return errorState("Only enabled homepage-eligible tools can be assigned.");
  }

  const { data: duplicate } = await supabase
    .from("homepage_tool_slots")
    .select("slot_number")
    .eq("tool_id", toolId)
    .neq("slot_number", slotNumber)
    .maybeSingle();

  if (duplicate) return errorState("That tool is already assigned to another homepage slot.");

  const { error } = await supabase
    .from("homepage_tool_slots")
    .upsert({ slot_number: slotNumber, tool_id: toolId, updated_by: admin.userId, updated_at: new Date().toISOString() });

  if (error) return errorState("Homepage slot could not be updated.");

  await writeAuditLog({
    action: "homepage.slot.assign",
    entityType: "homepage_tool_slot",
    entityId: String(slotNumber),
    summary: `Assigned homepage slot ${slotNumber}.`,
    changes: { slot_number: slotNumber, tool_id: toolId },
  });
  revalidatePath("/admin/homepage");
  return successState("Homepage slot updated.");
}
