"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";

const InboxCountContext = createContext<number | null>(null);

export function InboxCountProvider({
  initialCount,
  children,
}: {
  initialCount: number;
  children: ReactNode;
}) {
  const [count, setCount] = useState(initialCount);
  const supabaseRef = useRef(createClient());

  // Keep a server-refreshed count authoritative when a router refresh or
  // full navigation provides a newer snapshot.
  const [lastInitialCount, setLastInitialCount] = useState(initialCount);
  if (initialCount !== lastInitialCount) {
    setLastInitialCount(initialCount);
    setCount(initialCount);
  }

  useEffect(() => {
    const supabase = supabaseRef.current;
    let active = true;
    let refreshVersion = 0;

    async function refreshUnreadCount() {
      const version = ++refreshVersion;
      const { count: unreadCount, error } = await supabase
        .from("feedback_queries")
        .select("id", { count: "exact", head: true })
        .eq("is_read", false);

      if (
        !active ||
        version !== refreshVersion ||
        error ||
        unreadCount === null
      ) {
        return;
      }

      setCount(unreadCount);
    }

    // createBrowserClient is a browser singleton. Use one logical unread
    // subscription for both navigation surfaces, with a unique topic for
    // each effect lifecycle so Strict Mode / fast remount cleanup cannot
    // hand a still-subscribed channel back to a new setup.
    const channel = supabase
      .channel(`feedback_queries_unread_badge:${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "feedback_queries" },
        () => {
          void refreshUnreadCount();
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "feedback_queries" },
        () => {
          void refreshUnreadCount();
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "feedback_queries" },
        () => {
          void refreshUnreadCount();
        },
      )
      .subscribe();

    return () => {
      active = false;
      refreshVersion += 1;
      void supabase.removeChannel(channel);
    };
  }, []);

  return (
    <InboxCountContext.Provider value={count}>
      {children}
    </InboxCountContext.Provider>
  );
}

export function InboxCountBadge() {
  const count = useContext(InboxCountContext);

  if (count === null || count <= 0) return null;

  return (
    <span
      aria-label={`${count} unread ${count === 1 ? "message" : "messages"}`}
      className="ml-auto inline-flex min-w-[1.375rem] items-center justify-center rounded-full bg-[var(--lumeo-seal-500)] px-1.5 py-0.5 text-[10px] font-black leading-none text-[var(--lumeo-paper-50)] shadow-[0_0_0_2px_var(--surface-base)]"
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
