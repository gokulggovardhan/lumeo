import type { FeedbackQuery } from "@/lib/supabase/database.types";

export type InboxRealtimeEvent =
  | { type: "INSERT"; row: FeedbackQuery }
  | { type: "UPDATE"; row: FeedbackQuery }
  | { type: "DELETE"; id: string };

export function applyInboxRealtimeEvent(
  items: FeedbackQuery[],
  event: InboxRealtimeEvent,
): FeedbackQuery[] {
  if (event.type === "INSERT") {
    const existingIndex = items.findIndex((item) => item.id === event.row.id);
    if (existingIndex === -1) return [event.row, ...items];

    return items.map((item) =>
      item.id === event.row.id ? { ...item, ...event.row } : item,
    );
  }

  if (event.type === "UPDATE") {
    // Do not append updates for rows outside the currently loaded page set.
    return items.map((item) =>
      item.id === event.row.id ? { ...item, ...event.row } : item,
    );
  }

  return items.filter((item) => item.id !== event.id);
}

export function selectedInboxIdAfterEvent(
  selectedId: string | null,
  event: InboxRealtimeEvent,
): string | null {
  return event.type === "DELETE" && selectedId === event.id
    ? null
    : selectedId;
}
