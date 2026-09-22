import type { FeedbackQuery, FeedbackQueryType } from "@/lib/supabase/database.types";

export type InboxReadFilter = "all" | "unread" | "read";
export type InboxTypeFilter = "all" | FeedbackQueryType;
export type InboxSortOrder = "newest" | "oldest";

export type InboxViewFilters = {
  query: string;
  read: InboxReadFilter;
  type: InboxTypeFilter;
  sort: InboxSortOrder;
};

export function filterAndSortInboxItems(
  items: FeedbackQuery[],
  filters: InboxViewFilters,
): FeedbackQuery[] {
  const query = filters.query.trim().toLowerCase();
  const filtered = items.filter((item) => {
    if (filters.type !== "all" && item.type !== filters.type) return false;
    if (filters.read === "read" && !item.is_read) return false;
    if (filters.read === "unread" && item.is_read) return false;
    if (!query) return true;

    return `${item.name} ${item.email ?? ""} ${item.subject} ${item.message}`
      .toLowerCase()
      .includes(query);
  });

  return filtered.sort((left, right) => {
    const difference = Date.parse(right.created_at) - Date.parse(left.created_at);
    return filters.sort === "oldest" ? -difference : difference;
  });
}
