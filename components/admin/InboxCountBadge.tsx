"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { FeedbackQuery } from "@/lib/supabase/database.types";

// Server-rendered initial count, kept live afterwards via the same
// postgres_changes pattern InboxClient already uses for new-message inserts
// -- so the sidebar badge and the inbox list never disagree without a
// full-page reload.
export function InboxCountBadge({ initialCount }: { initialCount: number }) {
  const [count, setCount] = useState(initialCount);
  const supabaseRef = useRef(createClient());

  // Render-phase reset when the server-fetched initial count changes (a
  // fresh layout render on navigation) -- same pattern CommandPaletteDialog
  // uses to reset state from a changed prop, not a setState-in-effect.
  const [lastInitialCount, setLastInitialCount] = useState(initialCount);
  if (initialCount !== lastInitialCount) {
    setLastInitialCount(initialCount);
    setCount(initialCount);
  }

  useEffect(() => {
    const supabase = supabaseRef.current;
    const channel = supabase
      .channel("feedback_queries_unread_badge")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "feedback_queries" },
        (payload) => {
          const row = payload.new as FeedbackQuery;
          if (!row.is_read) setCount((current) => current + 1);
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "feedback_queries" },
        (payload) => {
          const before = payload.old as Partial<FeedbackQuery>;
          const after = payload.new as FeedbackQuery;
          if (before.is_read === false && after.is_read === true) {
            setCount((current) => Math.max(0, current - 1));
          } else if (before.is_read === true && after.is_read === false) {
            setCount((current) => current + 1);
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "feedback_queries" },
        (payload) => {
          const before = payload.old as Partial<FeedbackQuery>;
          if (before.is_read === false) setCount((current) => Math.max(0, current - 1));
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  if (count <= 0) return null;

  return (
    <span
      aria-label={`${count} unread ${count === 1 ? "message" : "messages"}`}
      className="ml-auto inline-flex min-w-[1.375rem] items-center justify-center rounded-full bg-[var(--lumeo-seal-500)] px-1.5 py-0.5 text-[10px] font-black leading-none text-[var(--lumeo-paper-50)] shadow-[0_0_0_2px_var(--surface-base)]"
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
