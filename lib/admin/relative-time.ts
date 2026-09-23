import { formatAdminDateTime } from "./timezone.ts";

export function formatAdminRelativeTime(iso: string, nowMs: number): string {
  const timestampMs = new Date(iso).getTime();
  const safeNowMs = Number.isFinite(nowMs) ? nowMs : timestampMs;
  const diffMs = Math.max(0, safeNowMs - timestampMs);
  const seconds = Math.floor(diffMs / 1000);

  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  return formatAdminDateTime(iso);
}
