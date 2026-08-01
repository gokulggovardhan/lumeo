"use server";

import { revalidatePath, updateTag } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { writeAuditLog } from "@/lib/admin/audit";
import { canManageTools } from "@/lib/admin/permissions";
import { createClient } from "@/lib/supabase/server";
import {
  errorState,
  formBoolean,
  formString,
  successState,
  validateToolStatus,
} from "@/lib/admin/validation";

// One form per table row (see app/admin/(protected)/tools/page.tsx) instead
// of four independent forms -- category, status, maintenance message, and
// enabled all save together with a single click, and one audit log entry,
// rather than requiring four separate saves per tool. Tool order is
// automatic (alphabetical) everywhere now, not admin-editable.
export async function updateTool(formData: FormData) {
  const admin = await requireAdmin();
  if (!canManageTools(admin.role)) return errorState("You do not have permission to update tools.");

  const id = formString(formData, "id", 80);
  const categoryId = formString(formData, "category_id", 80) || null;
  const status = formString(formData, "status", 40);
  const maintenanceMessage = formString(formData, "maintenance_message", 300);
  const isEnabled = formBoolean(formData, "is_enabled");

  if (!id) return errorState("Choose a valid tool.");
  if (!validateToolStatus(status)) return errorState("Choose a valid tool status.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("pdf_tools")
    .update({
      category_id: categoryId,
      status,
      maintenance_message: maintenanceMessage || null,
      is_enabled: isEnabled,
    })
    .eq("id", id);

  if (error) return errorState("Tool could not be updated.");

  await writeAuditLog({
    action: "tool.update",
    entityType: "pdf_tool",
    entityId: id,
    summary: "Updated a PDF tool's catalog controls.",
    changes: { category_id: categoryId, status, is_enabled: isEnabled },
  });
  revalidatePath("/admin/tools");
  revalidatePath("/admin/homepage");
  // getToolBlockedState/resolveLumeoTools read this row through
  // getPublicPdfCatalog, an unstable_cache with a 5-minute revalidate --
  // revalidatePath alone doesn't reach that cache entry (it only re-renders
  // the two admin routes above), so without this tag every live tool page,
  // the nav, and the homepage tiles kept serving the pre-update
  // status/enabled/maintenance state for up to 5 minutes after a save.
  // updateTag (not revalidateTag) gives read-your-own-writes semantics from
  // within this Server Action -- the admin sees the effect on the very next
  // page load, not just eventually.
  updateTag("public-pdf-catalog");
  return successState("Tool updated.");
}
