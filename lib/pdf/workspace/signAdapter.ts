import type {
  PdfSemanticHistoryEntry,
  PdfSemanticHistoryJournal,
} from "../history/semanticHistory.ts";
import type {
  WorkspaceDocument,
  WorkspaceOperation,
  WorkspacePage,
  WorkspacePageId,
} from "./model.ts";
import {
  beginWorkspaceExport,
  completeWorkspaceExport,
  createDocumentSession,
  failWorkspaceExport,
  pageIdAtIndex,
  recordWorkspaceOperation,
  type DocumentSession,
} from "./session.ts";

export type SignWorkspaceProjectionFailure =
  | "missing-page"
  | "unsupported-target";

export type SignWorkspaceProjection =
  | {
      compatible: true;
      operations: readonly WorkspaceOperation[];
    }
  | {
      compatible: false;
      operations: readonly [];
      reason: SignWorkspaceProjectionFailure;
      operationId: string;
    };

export type SignDocumentSessionProjection =
  | {
      compatible: true;
      session: DocumentSession;
    }
  | Extract<SignWorkspaceProjection, { compatible: false }>;

function pageIdForEntry(
  entry: PdfSemanticHistoryEntry,
  pages: readonly WorkspacePage[],
): WorkspacePageId | null {
  if (entry.target.kind !== "element") return null;
  return pageIdAtIndex(pages, entry.target.pageIndex);
}

function projectEntry(
  entry: PdfSemanticHistoryEntry,
  pages: readonly WorkspacePage[],
):
  | { ok: true; operation: WorkspaceOperation }
  | {
      ok: false;
      reason: SignWorkspaceProjectionFailure;
      operationId: string;
    } {
  if (entry.target.kind !== "element") {
    return {
      ok: false,
      reason: "unsupported-target",
      operationId: entry.id,
    };
  }

  const pageId = pageIdForEntry(entry, pages);
  if (!pageId) {
    return { ok: false, reason: "missing-page", operationId: entry.id };
  }

  return {
    ok: true,
    operation: {
      id: `workspace-${entry.id}`,
      type: entry.type,
      area: "sign",
      description: entry.description ?? entry.type,
      scope: { kind: "pages", pageIds: [pageId] },
      parameters: {
        source: "sign-semantic-history",
        sourceOperationId: entry.id,
        sourceSequence: entry.sequence,
        elementId: entry.target.elementId,
        elementType: entry.target.elementType,
      },
      undoable: true,
      affectsPreview: true,
      affectsExport: true,
      flow: { eligible: false, reason: "page-specific" },
    },
  };
}

/**
 * Projects Sign's existing semantic journal without creating another undo or
 * mutation authority. Projection is atomic: one unresolved page or unexpected
 * target makes the whole bridge unavailable instead of misbinding a signature.
 * Signature pixels and text values are deliberately excluded from parameters.
 */
export function projectSignHistoryToWorkspace(
  history: PdfSemanticHistoryJournal,
  pages: readonly WorkspacePage[],
): SignWorkspaceProjection {
  const operations: WorkspaceOperation[] = [];
  for (const entry of history.entries) {
    const projected = projectEntry(entry, pages);
    if (!projected.ok) {
      return {
        compatible: false,
        operations: [],
        reason: projected.reason,
        operationId: projected.operationId,
      };
    }
    operations.push(projected.operation);
  }
  return { compatible: true, operations };
}

export function createSignWorkspaceSession({
  history,
  sessionId,
  document,
}: {
  history: PdfSemanticHistoryJournal;
  sessionId: string;
  document: WorkspaceDocument;
}): SignDocumentSessionProjection {
  const projection = projectSignHistoryToWorkspace(history, document.pages);
  if (!projection.compatible) return projection;

  let session = createDocumentSession({
    id: sessionId,
    document,
    initialArea: "sign",
  });
  for (const operation of projection.operations) {
    session = recordWorkspaceOperation(session, operation);
  }
  return { compatible: true, session };
}

export function projectSignExportState(
  session: DocumentSession,
  state: "idle" | "exporting" | "exported" | "error",
): DocumentSession {
  if (state === "idle") return session;
  const exporting = beginWorkspaceExport(session);
  if (state === "exporting") return exporting;
  return state === "exported"
    ? completeWorkspaceExport(exporting)
    : failWorkspaceExport(exporting);
}
