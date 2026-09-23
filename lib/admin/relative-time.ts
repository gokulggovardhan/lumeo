import { formatAdminDateTime } from "./timezone.ts";

export const INITIAL_RELATIVE_TIME_REFERENCE_MS = 0;

export function formatAdminRelativeTime(iso: string, nowMs: number): string {
  // SSR and the first client render intentionally use an absolute timestamp.
  // The client advances to a real clock only after hydration, so time passing
  // between server render and hydration can never change the initial markup.
  if (nowMs === INITIAL_RELATIVE_TIME_REFERENCE_MS) {
    return formatAdminDateTime(iso);
  }

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
