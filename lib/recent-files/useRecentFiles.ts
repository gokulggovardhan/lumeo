"use client";

import { useSyncExternalStore } from "react";
import { getRecentFiles, RECENT_FILES_CHANGED_EVENT, type RecentFileItem } from "@/lib/recent-files";

const EMPTY_SNAPSHOT: RecentFileItem[] = [];

function subscribe(onStoreChange: () => void) {
  // Same-tab writes (recordRecentFile's custom event) and cross-tab writes
  // (the native "storage" event, which only fires in *other* tabs) both
  // need to be covered for every mounted consumer -- the homepage widget,
  // the command palette's recent section -- to stay in sync.
  window.addEventListener(RECENT_FILES_CHANGED_EVENT, onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    window.removeEventListener(RECENT_FILES_CHANGED_EVENT, onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

function getServerSnapshot() {
  return EMPTY_SNAPSHOT;
}

// useSyncExternalStore, not useState+useEffect -- Recent Files lives in
// localStorage, an external mutable store React doesn't own, which is
// exactly what this hook exists for: it reads the current snapshot
// synchronously on render (no extra effect-triggered render pass) and
// re-renders subscribers when the store notifies a change.
export function useRecentFiles(): RecentFileItem[] {
  return useSyncExternalStore(subscribe, getRecentFiles, getServerSnapshot);
}
