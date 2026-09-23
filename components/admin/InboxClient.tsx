"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Inbox as InboxIcon, Loader2, Mail, MailOpen, Phone, Search, Trash2 } from "lucide-react";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { deleteFeedbackQuery, setFeedbackReadState } from "@/app/admin/(protected)/inbox/actions";
import {
  filterAndSortInboxItems,
  type InboxReadFilter,
  type InboxSortOrder,
  type InboxTypeFilter,
} from "@/lib/admin/inbox-view";
import { createClient } from "@/lib/supabase/client";
import { applyInboxRealtimeEvent, selectedInboxIdAfterEvent } from "@/lib/admin/inbox-realtime";
import { formatAdminDateTime } from "@/lib/admin/timezone";
import type { FeedbackQuery } from "@/lib/supabase/database.types";

function relativeTime(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const seconds = Math.max(0, Math.floor(diffMs / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatAdminDateTime(iso);
}

function absoluteTime(iso: string) {
  return formatAdminDateTime(iso);
}

export function InboxClient({
  initialItems,
  initialError,
  initialHasMore,
  initialReadFilter,
  pageSize,
  canManage,
}: {
  initialItems: FeedbackQuery[];
  initialError: string | null;
  initialHasMore: boolean;
  initialReadFilter: InboxReadFilter;
  pageSize: number;
  canManage: boolean;
}) {
  const [items, setItems] = useState<FeedbackQuery[]>(initialItems);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<InboxTypeFilter>("all");
  const [readFilter, setReadFilter] = useState<InboxReadFilter>(initialReadFilter);
  const [sortOrder, setSortOrder] = useState<InboxSortOrder>("newest");
  const [search, setSearch] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [serverOffset, setServerOffset] = useState(initialItems.length);
  const [deleting, setDeleting] = useState(false);
  const [banner, setBanner] = useState<{ tone: "error" | "success"; message: string } | null>(
    initialError ? { tone: "error", message: "We couldn't load your messages. Try refreshing the page." } : null,
  );
  const supabaseRef = useRef(createClient());
  const serverLoadedIdsRef = useRef(new Set(initialItems.map((item) => item.id)));

  const removeItem = useCallback((id: string) => {
    if (serverLoadedIdsRef.current.delete(id)) {
      setServerOffset((current) => Math.max(0, current - 1));
    }
    const event = { type: "DELETE" as const, id };
    setItems((current) => applyInboxRealtimeEvent(current, event));
    setSelectedId((current) => selectedInboxIdAfterEvent(current, event));
  }, []);

  // Realtime: keep the loaded list synchronized across Admin sessions.
  useEffect(() => {
    const supabase = supabaseRef.current;
    const channel = supabase
      .channel(`feedback_queries_inbox:${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "feedback_queries" },
        (payload) => {
          const event = { type: "INSERT" as const, row: payload.new as FeedbackQuery };
          setItems((current) => applyInboxRealtimeEvent(current, event));
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "feedback_queries" },
        (payload) => {
          const event = { type: "UPDATE" as const, row: payload.new as FeedbackQuery };
          setItems((current) => applyInboxRealtimeEvent(current, event));
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "feedback_queries" },
        (payload) => {
          const id = (payload.old as Partial<FeedbackQuery>).id;
          if (id) removeItem(id);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [removeItem]);

  const filteredItems = useMemo(
    () => filterAndSortInboxItems(items, { query: search, read: readFilter, type: typeFilter, sort: sortOrder }),
    [items, readFilter, search, sortOrder, typeFilter],
  );

  const selected = items.find((item) => item.id === selectedId) ?? null;

  const updateReadState = useCallback(async (item: FeedbackQuery, isRead: boolean) => {
    if (item.is_read === isRead) return;
    setItems((current) => current.map((row) => (row.id === item.id ? { ...row, is_read: isRead } : row)));
    const result = await setFeedbackReadState(item.id, isRead);
    if (!result.ok) {
      setItems((current) => current.map((row) => (row.id === item.id ? { ...row, is_read: item.is_read } : row)));
      setBanner({ tone: "error", message: result.message });
    }
  }, []);

  function selectItem(item: FeedbackQuery) {
    setSelectedId(item.id);
    void updateReadState(item, true);
  }

  async function loadMore() {
    setLoadingMore(true);
    try {
      const supabase = supabaseRef.current;
      const { data, error } = await supabase
        .from("feedback_queries")
        .select("id, type, name, email, phone, subject, message, location, is_read, created_at")
        .order("created_at", { ascending: false })
        .range(serverOffset, serverOffset + pageSize);

      if (error) {
        setBanner({ tone: "error", message: "Couldn't load more messages. Try again." });
        return;
      }

      const rows = (data ?? []) as FeedbackQuery[];
      const pageRows = rows.slice(0, pageSize);
      for (const row of pageRows) serverLoadedIdsRef.current.add(row.id);
      setServerOffset((current) => current + pageRows.length);
      setItems((current) => {
        const seen = new Set(current.map((row) => row.id));
        return [...current, ...pageRows.filter((row) => !seen.has(row.id))];
      });
      setHasMore(rows.length > pageSize);
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleDelete(item: FeedbackQuery) {
    if (!canManage) return;
    const confirmed = window.confirm(`Delete this message from ${item.name}? This cannot be undone.`);
    if (!confirmed) return;

    setDeleting(true);
    try {
      const result = await deleteFeedbackQuery(item.id);
      if (!result.ok) {
        setBanner({ tone: "error", message: result.message });
        return;
      }
      removeItem(item.id);
      setBanner({ tone: "success", message: "Message deleted." });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="grid h-full min-h-0 gap-4 lg:grid-cols-[380px_1fr]">
      {/* List column -- hidden on mobile once a message is open, full width otherwise. */}
      <div className={`flex min-h-0 flex-col rounded-[var(--radius-2xl)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] ${selected ? "hidden lg:flex" : "flex"}`}>
        <div className="space-y-3 border-b border-[var(--border-subtle)] p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--lumeo-paper-500)]" aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search loaded messages..."
              className="min-h-10 w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-input)] py-2 pl-9 pr-3 text-base text-[var(--lumeo-paper-50)] sm:text-sm outline-none placeholder:text-[var(--lumeo-paper-600)] focus:border-[var(--border-focus)]"
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
            <label className="text-xs font-semibold text-[var(--text-muted)]">
              Type
              <select
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value as InboxTypeFilter)}
                className="mt-1 min-h-10 w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-input)] px-2 text-base font-semibold text-[var(--lumeo-paper-50)] sm:text-xs"
              >
                <option value="all">All</option>
                <option value="Query">Queries</option>
                <option value="Feedback">Feedback</option>
              </select>
            </label>
            <label className="text-xs font-semibold text-[var(--text-muted)]">
              State
              <select
                value={readFilter}
                onChange={(event) => setReadFilter(event.target.value as InboxReadFilter)}
                className="mt-1 min-h-10 w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-input)] px-2 text-base font-semibold text-[var(--lumeo-paper-50)] sm:text-xs"
              >
                <option value="all">All</option>
                <option value="unread">Unread</option>
                <option value="read">Read</option>
              </select>
            </label>
            <label className="text-xs font-semibold text-[var(--text-muted)]">
              Order
              <select
                value={sortOrder}
                onChange={(event) => setSortOrder(event.target.value as InboxSortOrder)}
                className="mt-1 min-h-10 w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-input)] px-2 text-base font-semibold text-[var(--lumeo-paper-50)] sm:text-xs"
              >
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
              </select>
            </label>
          </div>
        </div>

        {banner ? (
          <div aria-live="polite" className={`mx-3 mt-3 rounded-[var(--radius-md)] px-3 py-2 text-xs font-semibold ${banner.tone === "error" ? "bg-[var(--surface-danger)] text-[var(--text-danger)]" : "bg-[var(--surface-success)] text-[var(--text-success)]"}`}>
            {banner.message}
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {filteredItems.length === 0 ? (
            <div className="p-4">
              <AdminEmptyState
                title="No messages"
                description={items.length === 0 ? "Messages from your website will show up here." : "No messages match your filters."}
              />
            </div>
          ) : (
            <ul>
              {filteredItems.map((item) => {
                const active = item.id === selectedId;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => selectItem(item)}
                      className={`flex w-full flex-col gap-1 border-b border-[var(--border-subtle)] px-4 py-3 text-left transition ${
                        active ? "bg-[var(--surface-selected)]" : "hover:bg-[rgba(var(--lumeo-paper-rgb),0.04)]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`flex items-center gap-2 truncate text-sm ${item.is_read ? "font-medium text-[var(--lumeo-paper-300)]" : "font-bold text-[var(--lumeo-paper-50)]"}`}>
                          {!item.is_read ? <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-[var(--emerald-500)]" /> : null}
                          <span className="truncate">{item.name}</span>
                        </span>
                        <span className="shrink-0 text-xs text-[var(--lumeo-paper-500)]">{relativeTime(item.created_at)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                            item.type === "Query" ? "bg-[rgba(var(--lumeo-aura-rgb),0.18)] text-[var(--lumeo-aura-300)]" : "bg-[rgba(var(--champagne-rgb),0.18)] text-[var(--champagne-400)]"
                          }`}
                        >
                          {item.type}
                        </span>
                        <span className={`truncate text-sm ${item.is_read ? "text-[var(--lumeo-paper-400)]" : "font-semibold text-[var(--lumeo-paper-100)]"}`}>{item.subject}</span>
                      </div>
                      <p className="truncate text-xs text-[var(--lumeo-paper-500)]">{item.message}</p>
                      {item.location ? <p className="truncate text-xs text-[var(--lumeo-paper-600)]">{item.location}</p> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {hasMore ? (
          <div className="border-t border-[var(--border-subtle)] p-3">
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore}
              className="flex min-h-10 w-full items-center justify-center gap-2 rounded-[var(--radius-md)] border border-[var(--border-subtle)] text-sm font-semibold text-[var(--lumeo-paper-200)] transition hover:border-[var(--border-premium)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              {loadingMore ? "Loading..." : "Load more"}
            </button>
          </div>
        ) : null}
      </div>

      {/* Detail column -- full-screen takeover on mobile when a message is selected. */}
      <div className={`min-h-0 flex-col rounded-[var(--radius-2xl)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] ${selected ? "flex" : "hidden lg:flex"}`}>
        {!selected ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
            <InboxIcon className="h-10 w-10 text-[var(--lumeo-paper-600)]" aria-hidden="true" />
            <p className="text-sm text-[var(--lumeo-paper-500)]">Select a message to read it.</p>
          </div>
        ) : (
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] p-4">
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--lumeo-paper-300)] hover:text-[var(--lumeo-paper-50)] lg:hidden"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Back
              </button>
              <div className="hidden items-center gap-2 text-xs font-semibold text-[var(--lumeo-paper-500)] lg:flex">
                {selected.is_read ? <MailOpen className="h-4 w-4" aria-hidden="true" /> : <Mail className="h-4 w-4" aria-hidden="true" />}
                {selected.is_read ? "Read" : "Unread"}
              </div>
              <button
                type="button"
                onClick={() => void updateReadState(selected, !selected.is_read)}
                className="inline-flex min-h-9 items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-3 text-xs font-semibold text-[var(--text-secondary)] transition hover:border-[var(--border-premium)] hover:text-[var(--text-primary)]"
              >
                {selected.is_read ? <Mail className="h-3.5 w-3.5" aria-hidden="true" /> : <MailOpen className="h-3.5 w-3.5" aria-hidden="true" />}
                Mark {selected.is_read ? "unread" : "read"}
              </button>
              {canManage ? (
                <button
                  type="button"
                  onClick={() => handleDelete(selected)}
                  disabled={deleting}
                  aria-label="Delete message"
                  className="inline-flex min-h-9 items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border-danger)] px-3 text-xs font-semibold text-[var(--text-danger)] transition hover:bg-[var(--surface-danger)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Delete
                </button>
              ) : null}
            </div>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
              <div>
                <span
                  className={`inline-block rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
                    selected.type === "Query" ? "bg-[rgba(var(--lumeo-aura-rgb),0.18)] text-[var(--lumeo-aura-300)]" : "bg-[rgba(var(--champagne-rgb),0.18)] text-[var(--champagne-400)]"
                  }`}
                >
                  {selected.type}
                </span>
                <h2 className="mt-3 font-serif text-xl font-semibold text-[var(--lumeo-paper-50)]">{selected.subject}</h2>
                <p className="mt-1 text-xs text-[var(--lumeo-paper-500)]">
                  {absoluteTime(selected.created_at)}
                  {selected.location ? ` · ${selected.location}` : ""}
                </p>
              </div>

              <div className="grid gap-3 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[rgba(var(--lumeo-paper-rgb),0.03)] p-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-[var(--lumeo-paper-500)]">Name</p>
                  <p className="mt-1 text-sm font-semibold text-[var(--lumeo-paper-50)]">{selected.name}</p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-[var(--lumeo-paper-500)]">Email</p>
                  {selected.email ? (
                    <a href={`mailto:${selected.email}`} className="mt-1 flex items-center gap-1.5 text-sm text-[var(--text-accent)] hover:underline">
                      <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                      {selected.email}
                    </a>
                  ) : (
                    <p className="mt-1 text-sm text-[var(--lumeo-paper-500)]">Not provided</p>
                  )}
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-[var(--lumeo-paper-500)]">Phone</p>
                  {selected.phone ? (
                    <a href={`tel:${selected.phone}`} className="mt-1 flex items-center gap-1.5 text-sm text-[var(--text-accent)] hover:underline">
                      <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                      {selected.phone}
                    </a>
                  ) : (
                    <p className="mt-1 text-sm text-[var(--lumeo-paper-500)]">Not provided</p>
                  )}
                </div>
              </div>

              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-[var(--lumeo-paper-500)]">Message</p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--lumeo-paper-100)]">{selected.message}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
