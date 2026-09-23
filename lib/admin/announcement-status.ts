export type AnnouncementDisplayStatus =
  | "inactive"
  | "scheduled"
  | "live"
  | "expired";

export type AnnouncementSchedule = {
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
};

export function resolveAnnouncementStatus(
  announcement: AnnouncementSchedule,
  now = new Date(),
): AnnouncementDisplayStatus {
  if (!announcement.isActive) return "inactive";

  const nowMs = now.getTime();
  const startsAtMs = announcement.startsAt
    ? new Date(announcement.startsAt).getTime()
    : null;
  const endsAtMs = announcement.endsAt
    ? new Date(announcement.endsAt).getTime()
    : null;

  if (startsAtMs !== null && startsAtMs > nowMs) return "scheduled";
  if (endsAtMs !== null && endsAtMs <= nowMs) return "expired";
  return "live";
}
