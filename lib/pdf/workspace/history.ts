import type { WorkspaceOperation } from "./model.ts";

export type WorkspaceHistory = {
  operations: readonly WorkspaceOperation[];
  cursor: number;
};

export function createWorkspaceHistory(): WorkspaceHistory {
  return { operations: [], cursor: 0 };
}

export function appliedOperations(history: WorkspaceHistory): readonly WorkspaceOperation[] {
  return history.operations.slice(0, history.cursor);
}

export function canUndo(history: WorkspaceHistory): boolean {
  if (history.cursor <= 0) return false;
  return history.operations[history.cursor - 1]?.undoable === true;
}

export function canRedo(history: WorkspaceHistory): boolean {
  if (history.cursor >= history.operations.length) return false;
  return history.operations[history.cursor]?.undoable === true;
}

export function applyOperation(history: WorkspaceHistory, operation: WorkspaceOperation): WorkspaceHistory {
  const retained = history.operations.slice(0, history.cursor);
  return { operations: [...retained, operation], cursor: retained.length + 1 };
}

export function undo(history: WorkspaceHistory): WorkspaceHistory {
  if (!canUndo(history)) return history;
  return { ...history, cursor: history.cursor - 1 };
}

export function redo(history: WorkspaceHistory): WorkspaceHistory {
  if (!canRedo(history)) return history;
  return { ...history, cursor: history.cursor + 1 };
}

export function returnToOriginal(history: WorkspaceHistory): WorkspaceHistory {
  let cursor = history.cursor;
  while (cursor > 0 && history.operations[cursor - 1]?.undoable) cursor -= 1;
  return cursor === history.cursor ? history : { ...history, cursor };
}
