import {
  applyOperation,
  createWorkspaceHistory,
  redo,
  undo,
  type WorkspaceHistory,
} from "./history.ts";
import {
  assertUniquePageIds,
  type WorkspaceArea,
  type WorkspaceDocument,
  type WorkspaceOperation,
  type WorkspacePage,
  type WorkspacePageId,
  type WorkspaceSessionState,
} from "./model.ts";

export type DocumentSession = {
  state: WorkspaceSessionState;
  history: WorkspaceHistory;
};

export function createDocumentSession({
  id,
  document,
  initialArea,
}: {
  id: string;
  document: WorkspaceDocument;
  initialArea: WorkspaceArea;
}): DocumentSession {
  assertUniquePageIds(document.pages);
  return {
    state: {
      id,
      document,
      lifecycle: "ready",
      privacy: "local",
      activeArea: initialArea,
      selectedPageIds: [],
      historyCursor: 0,
      operationCount: 0,
      hasUnsavedChanges: false,
    },
    history: createWorkspaceHistory(),
  };
}

function withHistory(
  session: DocumentSession,
  history: WorkspaceHistory,
): DocumentSession {
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

export function recordWorkspaceOperation(
  session: DocumentSession,
  operation: WorkspaceOperation,
): DocumentSession {
  return withHistory(session, applyOperation(session.history, operation));
}

export function undoWorkspaceOperation(session: DocumentSession): DocumentSession {
  return withHistory(session, undo(session.history));
}

export function redoWorkspaceOperation(session: DocumentSession): DocumentSession {
  return withHistory(session, redo(session.history));
}

export function beginWorkspaceExport(session: DocumentSession): DocumentSession {
  if (session.state.lifecycle === "empty" || session.state.lifecycle === "loading") {
    throw new Error("Workspace export requires a ready document.");
  }
  return {
    ...session,
    state: {
      ...session.state,
      lifecycle: "exporting",
      activeArea: "export",
    },
  };
}

function finishWorkspaceExport(
  session: DocumentSession,
  lifecycle: "exported" | "error",
): DocumentSession {
  if (session.state.lifecycle !== "exporting") {
    throw new Error("Workspace export must begin before it can finish.");
  }
  return {
    ...session,
    state: {
      ...session.state,
      lifecycle,
      activeArea: "export",
      hasUnsavedChanges:
        lifecycle === "exported" ? false : session.state.hasUnsavedChanges,
    },
  };
}

export function completeWorkspaceExport(session: DocumentSession): DocumentSession {
  return finishWorkspaceExport(session, "exported");
}

export function failWorkspaceExport(session: DocumentSession): DocumentSession {
  return finishWorkspaceExport(session, "error");
}

export function setWorkspaceArea(
  session: DocumentSession,
  activeArea: WorkspaceArea,
): DocumentSession {
  return { ...session, state: { ...session.state, activeArea } };
}

export function setSelectedPages(
  session: DocumentSession,
  pageIds: readonly WorkspacePageId[],
): DocumentSession {
  const visibleIds = new Set(
    session.state.document.pages
      .filter((page) => !page.deleted)
      .map((page) => page.id),
  );
  return {
    ...session,
    state: {
      ...session.state,
      selectedPageIds: [...new Set(pageIds)].filter((id) => visibleIds.has(id)),
    },
  };
}

export function visibleWorkspacePages(
  pages: readonly WorkspacePage[],
): readonly WorkspacePage[] {
  return pages.filter((page) => !page.deleted);
}

export function pageIndexForId(
  pages: readonly WorkspacePage[],
  pageId: WorkspacePageId,
): number {
  return visibleWorkspacePages(pages).findIndex((page) => page.id === pageId);
}

export function pageIdAtIndex(
  pages: readonly WorkspacePage[],
  index: number,
): WorkspacePageId | null {
  return visibleWorkspacePages(pages)[index]?.id ?? null;
}

export function appendSourcePages(
  document: WorkspaceDocument,
  source: WorkspaceDocument["sources"][number],
  pages: readonly WorkspacePage[],
): WorkspaceDocument {
  const nextPages = [...document.pages, ...pages];
  assertUniquePageIds(nextPages);
  return {
    ...document,
    sources: [...document.sources, source],
    pages: nextPages,
  };
}
