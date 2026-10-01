import type { WorkspaceArea } from "./model.ts";

export type WorkspaceRevision = {
  id: string;
  blob: Blob;
  filename: string;
  byteLength: number;
  pageCount?: number;
  area: WorkspaceArea;
  description: string;
  createdAt: number;
};

export type WorkspaceRevisionHistory = {
  revisions: readonly WorkspaceRevision[];
  cursor: number;
  maxEntries: number;
  maxBytes: number;
  historyLimited: boolean;
};

export const DEFAULT_WORKSPACE_REVISION_MAX_ENTRIES = 6;
export const DEFAULT_WORKSPACE_REVISION_MAX_BYTES = 320 * 1024 * 1024;

export function createWorkspaceRevisionHistory(
  initial: WorkspaceRevision,
  options: { maxEntries?: number; maxBytes?: number } = {},
): WorkspaceRevisionHistory {
  return {
    revisions: [initial],
    cursor: 0,
    maxEntries: Math.max(1, Math.floor(options.maxEntries ?? DEFAULT_WORKSPACE_REVISION_MAX_ENTRIES)),
    maxBytes: Math.max(1, Math.floor(options.maxBytes ?? DEFAULT_WORKSPACE_REVISION_MAX_BYTES)),
    historyLimited: false,
  };
}

export function currentWorkspaceRevision(
  history: WorkspaceRevisionHistory,
): WorkspaceRevision {
  const revision = history.revisions[history.cursor];
  if (!revision) throw new Error("Workspace revision history has no active revision.");
  return revision;
}

function totalRevisionBytes(revisions: readonly WorkspaceRevision[]): number {
  return revisions.reduce((total, revision) => total + revision.byteLength, 0);
}

export function appendWorkspaceRevision(
  history: WorkspaceRevisionHistory,
  revision: WorkspaceRevision,
): WorkspaceRevisionHistory {
  let revisions = [...history.revisions.slice(0, history.cursor + 1), revision];
  let cursor = revisions.length - 1;
  let historyLimited = history.historyLimited;

  // Whole-PDF snapshots are intentionally capped. Blob objects are immutable,
  // so we keep references without copying their bytes, then evict only older
  // applied boundaries. The active revision is never discarded.
  while (
    revisions.length > 1 &&
    (revisions.length > history.maxEntries ||
      totalRevisionBytes(revisions) > history.maxBytes)
  ) {
    revisions = revisions.slice(1);
    cursor -= 1;
    historyLimited = true;
  }

  return {
    ...history,
    revisions,
    cursor: Math.max(0, cursor),
    historyLimited,
  };
}

export function undoWorkspaceRevision(
  history: WorkspaceRevisionHistory,
): WorkspaceRevisionHistory {
  if (history.cursor <= 0) return history;
  return { ...history, cursor: history.cursor - 1 };
}

export function redoWorkspaceRevision(
  history: WorkspaceRevisionHistory,
): WorkspaceRevisionHistory {
  if (history.cursor >= history.revisions.length - 1) return history;
  return { ...history, cursor: history.cursor + 1 };
}
