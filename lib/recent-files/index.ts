// Aura OS v2 -- Recent Files service.
//
// Pure, browser-only, privacy-preserving history of files the visitor has
// finished processing. Deliberately stores nothing but small display
// metadata -- never the file itself, never its bytes, never an object URL
// (those are already revoked by each tool right after download, so keeping
// one here would just be a dangling reference). Everything lives in
// localStorage on the visitor's own device; nothing here ever reaches a
// server, matching the rest of Lumeo's browser-only processing model.
//
// `tool` is intentionally just the tile slug (e.g. "merge"), not a route or
// label -- callers resolve the current title/route/icon by looking the slug
// up in the same Tile[] the rest of the app already builds from the tool
// catalog (lib/tools/tiles.ts), so this module never has to duplicate tool
// definitions or go stale if a route or label changes.

export type RecentFileItem = {
  id: string;
  tool: string;
  filename: string;
  fileSize?: number;
  pageCount?: number;
  timestamp: number;
};

const STORAGE_KEY = "lumeo:recent-files:v1";
const MAX_ITEMS = 20;

// Same-tab listeners (the recent-files hook, the command palette, the
// homepage widget) can't rely on the native "storage" event -- that only
// fires in *other* tabs/windows, never the tab that made the write. This
// custom event covers same-tab updates; the hook also listens for "storage"
// so a change made in one tab is picked up by others too.
export const RECENT_FILES_CHANGED_EVENT = "lumeo:recent-files-changed";

function isBrowser() {
  return typeof window !== "undefined";
}

function isValidItem(value: unknown): value is RecentFileItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    typeof item.tool === "string" &&
    typeof item.filename === "string" &&
    typeof item.timestamp === "number" &&
    (item.fileSize === undefined || typeof item.fileSize === "number") &&
    (item.pageCount === undefined || typeof item.pageCount === "number")
  );
}

// Cached so repeated calls return the same array reference when the
// underlying storage hasn't changed -- required for useRecentFiles' use of
// useSyncExternalStore, which warns (and can loop) if getSnapshot() returns
// a new reference every call.
let cachedRaw: string | null = null;
let cachedSnapshot: RecentFileItem[] = [];

export function getRecentFiles(): RecentFileItem[] {
  if (!isBrowser()) return cachedSnapshot;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === cachedRaw) return cachedSnapshot;
    cachedRaw = raw;
    if (!raw) {
      cachedSnapshot = [];
      return cachedSnapshot;
    }
    const parsed: unknown = JSON.parse(raw);
    cachedSnapshot = Array.isArray(parsed) ? parsed.filter(isValidItem) : [];
    return cachedSnapshot;
  } catch {
    // Private browsing, disabled storage, or corrupted JSON -- Recent Files
    // is a convenience layer, so a visitor with storage unavailable just
    // sees an empty list instead of a broken page.
    cachedSnapshot = [];
    return cachedSnapshot;
  }
}

export type RecordRecentFileInput = Omit<RecentFileItem, "id" | "timestamp">;

export function recordRecentFile(entry: RecordRecentFileInput): void {
  if (!isBrowser()) return;
  try {
    const current = getRecentFiles();
    const dedupeKey = `${entry.tool}:${entry.filename}`;
    // Opening the same file again moves it to the top instead of creating a
    // second entry -- this is the one and only place duplicates are
    // resolved, so every call site can stay dumb ("just record this run").
    const withoutDuplicate = current.filter(
      (item) => `${item.tool}:${item.filename}` !== dedupeKey,
    );
    const next: RecentFileItem[] = [
      { ...entry, id: `${dedupeKey}:${Date.now()}`, timestamp: Date.now() },
      ...withoutDuplicate,
    ].slice(0, MAX_ITEMS);

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(RECENT_FILES_CHANGED_EVENT));
  } catch {
    // Quota exceeded or storage disabled -- never let a housekeeping write
    // interrupt the actual PDF result the visitor just produced.
  }
}

export function clearRecentFiles(): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent(RECENT_FILES_CHANGED_EVENT));
  } catch {
    // See recordRecentFile -- storage access can fail; clearing is still a
    // convenience action, not one that should throw into caller code.
  }
}
