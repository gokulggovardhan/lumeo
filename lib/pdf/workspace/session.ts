import type { WorkspaceArea, WorkspaceDocument, WorkspaceOperation, WorkspacePage, WorkspacePageId, WorkspaceSessionState } from "./model.ts";
import { assertUniquePageIds } from "./model.ts";
import type { WorkspaceHistory } from "./history.ts";
import { applyOperation, createWorkspaceHistory, redo, undo } from "./history.ts";

export type DocumentSession = {
  state: WorkspaceSessionState;
  history: WorkspaceHistory;
};

export function createDocumentSession(args: {
  id: string;
  document: WorkspaceDocument;
  initialArea: WorkspaceArea;
}): DocumentSession {
  assertUniquePageIds(args.document.pages);
  return {
    state: {
      id: args.id,
      document: args.document,
      lifecycle: "ready",
      privacy: "local",
      activeArea: args.initialArea,
      selectedPageIds: [],
      historyCursor: 0,
      operationCount: 0,
      hasUnsavedChanges: false,
    },
    history: createWorkspaceHistory(),
  };
}

function syncHistory(session: DocumentSession, history: WorkspaceHistory): DocumentSession {
  return {
    history,
    state: {
      ...session.state,
      lifecycle: history.cursor > 0 ? "modified" : "ready",
      historyCursor: history.cursor,
      operationCount: history.operations.length,
      hasUnsavedChanges: history.cursor > 0,
    },
  };
}

export function recordWorkspaceOperation(session: DocumentSession, operation: WorkspaceOperation): DocumentSession {
  return syncHistory(session, applyOperation(session.history, operation));
}

export function undoWorkspaceOperation(session: DocumentSession): DocumentSession {
  return syncHistory(session, undo(session.history));
}

export function redoWorkspaceOperation(session: DocumentSession): DocumentSession {
  return syncHistory(session, redo(session.history));
}

export function setWorkspaceArea(session: DocumentSession, activeArea: WorkspaceArea): DocumentSession {
  return { ...session, state: { ...session.state, activeArea } };
}

export function setSelectedPages(session: DocumentSession, pageIds: readonly WorkspacePageId[]): DocumentSession {
  const known = new Set(session.state.document.pages.map((page) => page.id));
  return {
    ...session,
    state: { ...session.state, selectedPageIds: pageIds.filter((id) => known.has(id)) },
  };
}

export function pageIndexForId(pages: readonly WorkspacePage[], pageId: WorkspacePageId): number {
  return pages.findIndex((page) => page.id === pageId && !page.deleted);
}

export function pageIdAtIndex(pages: readonly WorkspacePage[], index: number): WorkspacePageId | null {
  return pages.filter((page) => !page.deleted)[index]?.id ?? null;
}

export function appendSourcePages(
  document: WorkspaceDocument,
  source: WorkspaceDocument["sources"][number],
  pages: readonly WorkspacePage[],
): WorkspaceDocument {
  assertUniquePageIds([...document.pages, ...pages]);
  return { ...document, sources: [...document.sources, source], pages: [...document.pages, ...pages] };
}
