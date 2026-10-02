import type { WorkspaceDocumentRuntime } from "./runtime.ts";

export type WorkspaceRevisionHistory = {
  checkpoints: readonly WorkspaceDocumentRuntime[];
  cursor: number;
};

function assertSameDocument(
  current: WorkspaceDocumentRuntime,
  incoming: WorkspaceDocumentRuntime,
): void {
  if (current.session.state.document.id !== incoming.session.state.document.id) {
    throw new Error("Workspace history cannot mix different documents.");
  }
}

export function createWorkspaceRevisionHistory(
  runtime: WorkspaceDocumentRuntime,
): WorkspaceRevisionHistory {
  return { checkpoints: [runtime], cursor: 0 };
}

export function currentWorkspaceCheckpoint(
  history: WorkspaceRevisionHistory,
): WorkspaceDocumentRuntime {
  const current = history.checkpoints[history.cursor];
  if (!current) {
    throw new Error("Workspace history has no current checkpoint.");
  }
  return current;
}

export function appendWorkspaceCheckpoint(
  history: WorkspaceRevisionHistory,
  runtime: WorkspaceDocumentRuntime,
): WorkspaceRevisionHistory {
  assertSameDocument(currentWorkspaceCheckpoint(history), runtime);
  const retained = history.checkpoints.slice(0, history.cursor + 1);
  return {
    checkpoints: [...retained, runtime],
    cursor: retained.length,
  };
}

export function replaceCurrentWorkspaceCheckpoint(
  history: WorkspaceRevisionHistory,
  runtime: WorkspaceDocumentRuntime,
): WorkspaceRevisionHistory {
  assertSameDocument(currentWorkspaceCheckpoint(history), runtime);
  const checkpoints = [...history.checkpoints];
  checkpoints[history.cursor] = runtime;
  return { checkpoints, cursor: history.cursor };
}

export function canUndoWorkspaceCheckpoint(
  history: WorkspaceRevisionHistory,
): boolean {
  return history.cursor > 0;
}

export function canRedoWorkspaceCheckpoint(
  history: WorkspaceRevisionHistory,
): boolean {
  return history.cursor < history.checkpoints.length - 1;
}

export function undoWorkspaceCheckpoint(
  history: WorkspaceRevisionHistory,
): WorkspaceRevisionHistory {
  if (!canUndoWorkspaceCheckpoint(history)) return history;
  return { ...history, cursor: history.cursor - 1 };
}

export function redoWorkspaceCheckpoint(
  history: WorkspaceRevisionHistory,
): WorkspaceRevisionHistory {
  if (!canRedoWorkspaceCheckpoint(history)) return history;
  return { ...history, cursor: history.cursor + 1 };
}
