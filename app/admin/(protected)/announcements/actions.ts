"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { writeAuditLog } from "@/lib/admin/audit";
import { canManageAnnouncements } from "@/lib/admin/permissions";
import { createClient } from "@/lib/supabase/server";
import {
  errorState,
  formBoolean,
  formString,
  successState,
  validateAnnouncementSchedule,
  validateLinkUrl,
} from "@/lib/admin/validation";

const tones = new Set(["information", "success", "warning", "maintenance"]);

export async function saveAnnouncement(formData: FormData) {
  const admin = await requireAdmin();
  if (!canManageAnnouncements(admin.role)) return errorState("You do not have permission to manage announcements.");

  const id = formString(formData, "id", 80);
  const title = formString(formData, "title", 140);
  const message = formString(formData, "message", 500);
  const tone = formString(formData, "tone", 40);
  const linkLabel = formString(formData, "link_label", 80) || null;
  const linkUrl = formString(formData, "link_url", 240) || null;
  const startsAt = formString(formData, "starts_at", 80) || null;
  const endsAt = formString(formData, "ends_at", 80) || null;
  const isActive = formBoolean(formData, "is_active");

  if (!title || !message || !tones.has(tone)) return errorState("Enter a title, message, and valid tone.");
  if (!validateLinkUrl(linkUrl ?? "")) return errorState("Announcement links must begin with / or https://.");
  if (!validateAnnouncementSchedule(startsAt ?? "", endsAt ?? "")) {
    return errorState("End time must be after the start time.");
  }

  const supabase = await createClient();
  const payload = {
    title,
    message,
    tone,
    link_label: linkLabel,
    link_url: linkUrl,
    starts_at: startsAt,
    ends_at: endsAt,
    is_active: isActive,
    updated_by: admin.userId,
  };
  const { error } = id
    ? await supabase.from("announcements").update(payload).eq("id", id)
    : await supabase.from("announcements").insert({ ...payload, created_by: admin.userId });

  if (error) return errorState("Announcement could not be saved.");

  await writeAuditLog({
    action: id ? "announcement.update" : "announcement.create",
    entityType: "announcement",
    entityId: id || title,
    summary: id ? "Updated an announcement." : "Created an announcement.",
    changes: { tone, is_active: isActive },
  });
  revalidatePath("/admin/announcements");
  return successState("Announcement saved.");
}

export async function toggleAnnouncement(formData: FormData) {
  const admin = await requireAdmin();
  if (!canManageAnnouncements(admin.role)) return errorState("You do not have permission to manage announcements.");

  const id = formString(formData, "id", 80);
  const isActive = formBoolean(formData, "is_active");
  if (!id) return errorState("Choose a valid announcement.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("announcements")
    .update({ is_active: isActive, updated_by: admin.userId })
    .eq("id", id);

  if (error) return errorState("Announcement could not be updated.");

  await writeAuditLog({
    action: "announcement.toggle",
    entityType: "announcement",
    entityId: id,
    summary: isActive ? "Activated an announcement." : "Deactivated an announcement.",
    changes: { is_active: isActive },
  });
  revalidatePath("/admin/announcements");
  return successState("Announcement updated.");
}
