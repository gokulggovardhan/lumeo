"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { writeAuditLog } from "@/lib/admin/audit";
import { canManageMembers } from "@/lib/admin/permissions";
import { createClient } from "@/lib/supabase/server";
import { errorState, formBoolean, formString, successState } from "@/lib/admin/validation";

const allowedRoles = new Set(["owner", "admin", "analyst"]);

export async function addAdminMember(formData: FormData) {
  const admin = await requireAdmin();
  if (!canManageMembers(admin.role)) return errorState("Only owners can manage administrators.");

  const email = formString(formData, "email", 254);
  const role = formString(formData, "role", 20);
  if (!email || !email.includes("@")) return errorState("Enter a valid email address.");
  if (!allowedRoles.has(role)) return errorState("Choose a valid role.");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("add_admin_member", { p_email: email, p_role: role });

  if (error) return errorState(error.message || "Could not add that administrator.");

  await writeAuditLog({
    action: "admin_member.add",
    entityType: "admin_member",
    entityId: typeof data === "object" && data && "user_id" in data ? String((data as { user_id: unknown }).user_id) : email,
    summary: `Added ${email} as ${role}.`,
    changes: { email, role },
  });
  revalidatePath("/admin/members");
  return successState(`${email} added as ${role}.`);
}

export async function updateAdminMember(formData: FormData) {
  const admin = await requireAdmin();
  if (!canManageMembers(admin.role)) return errorState("Only owners can manage administrators.");

  const userId = formString(formData, "user_id", 80);
  const role = formString(formData, "role", 20);
  const isActive = formBoolean(formData, "is_active");
  if (!userId) return errorState("Choose a valid administrator.");
  if (!allowedRoles.has(role)) return errorState("Choose a valid role.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_admin_member", {
    p_user_id: userId,
    p_role: role,
    p_is_active: isActive,
  });

  if (error) return errorState(error.message || "Could not update that administrator.");

  await writeAuditLog({
    action: "admin_member.update",
    entityType: "admin_member",
    entityId: userId,
    summary: `Updated administrator to ${role}${isActive ? "" : " (deactivated)"}.`,
    changes: { role, is_active: isActive },
  });
  revalidatePath("/admin/members");
  return successState("Administrator updated.");
}
