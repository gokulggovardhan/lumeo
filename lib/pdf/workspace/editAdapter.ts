import type {
  PdfEditOperation,
  PdfEditOperationDraft,
  PdfEditSessionState,
} from "../edit/editSession.ts";
import type {
  WorkspaceDocument,
  WorkspaceOperation,
  WorkspacePage,
  WorkspacePageId,
  WorkspaceSource,
} from "./model.ts";
import { assertUniquePageIds, createSourcePages } from "./model.ts";
import {
  createDocumentSession,
  pageIdAtIndex,
  recordWorkspaceOperation,
  type DocumentSession,
  visibleWorkspacePages,
} from "./session.ts";

export type PdfEditWorkspaceProjectionFailure =
  | "page-topology-changed"
  | "missing-page"
  | "empty-page-scope";

export type PdfEditWorkspaceProjection =
  | {
      compatible: true;
      operations: readonly WorkspaceOperation[];
    }
  | {
      compatible: false;
      operations: readonly [];
      reason: PdfEditWorkspaceProjectionFailure;
      operationId: string;
    };

export type PdfEditDocumentSessionProjection =
  | {
      compatible: true;
      session: DocumentSession;
    }
  | Extract<PdfEditWorkspaceProjection, { compatible: false }>;

type OperationProjection =
  | { ok: true; operation: WorkspaceOperation }
  | {
      ok: false;
      reason: PdfEditWorkspaceProjectionFailure;
      operationId: string;
    };

const TOPOLOGY_OPERATIONS = new Set(["reorder", "delete", "merge"]);

function operationType(operation: PdfEditOperation): string {
  switch (operation.kind) {
    case "replaceText":
      return "replace-text";
    case "insertText":
      return "insert-text";
    case "deleteText":
      return "delete-text";
    case "changeStyle":
      return "change-style";
    case "changeGeometry":
      return "change-geometry";
    case "insertElement":
      return "insert-element";
    case "deleteElement":
      return "delete-element";
    case "pageOperation":
      return operation.operation;
  }
}

function operationDescription(operation: PdfEditOperation): string {
  if (operation.kind === "pageOperation") return operation.description;
  switch (operation.kind) {
    case "replaceText":
      return "Replace text";
    case "insertText":
      return "Insert text";
    case "deleteText":
      return "Delete text";
    case "changeStyle":
      return "Change text style";
    case "changeGeometry":
      return "Move or resize element";
    case "insertElement":
      return "Insert element";
    case "deleteElement":
      return "Delete element";
  }
}

function pageIndices(
  operation: PdfEditOperation | PdfEditOperationDraft,
): readonly number[] {
  switch (operation.kind) {
    case "replaceText":
    case "insertText":
    case "deleteText":
    case "changeStyle":
      return [operation.target.pageIndex];
    case "changeGeometry":
      return [operation.target.pageIndex];
    case "insertElement":
    case "deleteElement":
      return [operation.element.pageIndex];
    case "pageOperation":
      return operation.affectedPageIndices;
  }
}

function stablePageIds(
  operation: PdfEditOperation,
  pages: readonly WorkspacePage[],
):
  | { ok: true; pageIds: readonly WorkspacePageId[] }
  | { ok: false; reason: "missing-page" | "empty-page-scope" } {
  if (operation.workspacePageIds) {
    const pageIds = [...new Set(operation.workspacePageIds)];
    if (pageIds.length === 0) return { ok: false, reason: "empty-page-scope" };
    const knownIds = new Set(pages.map((page) => page.id));
    if (pageIds.some((pageId) => !knownIds.has(pageId))) {
      return { ok: false, reason: "missing-page" };
    }
    return { ok: true, pageIds };
  }

  const indices = [...new Set(pageIndices(operation))];
  if (indices.length === 0) return { ok: false, reason: "empty-page-scope" };

  const pageIds: WorkspacePageId[] = [];
  for (const index of indices) {
    const pageId = pageIdAtIndex(pages, index);
    if (!pageId) return { ok: false, reason: "missing-page" };
    pageIds.push(pageId);
  }
  return { ok: true, pageIds };
}

function projectOperation(
  operation: PdfEditOperation,
  pages: readonly WorkspacePage[],
): OperationProjection {
  if (
    operation.kind === "pageOperation" &&
    TOPOLOGY_OPERATIONS.has(operation.operation) &&
    !operation.workspacePageIds
  ) {
    return {
      ok: false,
      reason: "page-topology-changed",
      operationId: operation.id,
    };
  }

  const targetPages = stablePageIds(operation, pages);
  if (!targetPages.ok) {
    return {
      ok: false,
      reason: targetPages.reason,
      operationId: operation.id,
    };
  }

  const sensitive =
    operation.kind === "pageOperation" && operation.operation === "redact";
  return {
    ok: true,
    operation: {
      id: `workspace:${operation.id}`,
      type: operationType(operation),
      area:
        operation.kind === "pageOperation" &&
        (operation.operation === "add-searchable-text-layer" ||
          operation.operation === "replace-searchable-text-layer")
          ? "enhance"
          : operation.kind === "pageOperation" &&
              TOPOLOGY_OPERATIONS.has(operation.operation)
            ? "pages"
          : "edit",
      description: operationDescription(operation),
      scope: { kind: "pages", pageIds: targetPages.pageIds },
      parameters: {
        source: "edit-session",
        sourceOperationId: operation.id,
        sourceSequence: operation.sequence,
        sourceKind: operation.kind,
      },
      undoable: true,
      affectsPreview: true,
      affectsExport: true,
      flow: {
        eligible: false,
        reason: sensitive
          ? "sensitive"
          : operation.kind === "pageOperation" &&
              TOPOLOGY_OPERATIONS.has(operation.operation)
            ? "page-specific"
            : "content-specific",
      },
    },
  };
}

/**
 * Projects the current Edit PDF semantic journal into Workspace vocabulary.
 *
 * The Edit snapshot remains the only undo/write authority. Projection is
 * atomic and deliberately refuses index-based history after a structural page
 * mutation, because reconstructing the page topology at each historical
 * operation would otherwise risk attaching an edit to the wrong stable page.
 */
export function projectPdfEditSessionToWorkspace(
  session: PdfEditSessionState,
  pages: readonly WorkspacePage[],
): PdfEditWorkspaceProjection {
  const operations: WorkspaceOperation[] = [];
  for (const operation of session.operations) {
    const projected = projectOperation(operation, pages);
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

/**
 * Builds the Workspace view of an Edit session without creating a second
 * mutation or undo authority. Callers derive this from the current Edit
 * snapshot; any unsafe page mapping leaves the whole bridge unavailable.
 */
export function createPdfEditWorkspaceSession({
  editSession,
  sessionId,
  document,
}: {
  editSession: PdfEditSessionState;
  sessionId: string;
  document: WorkspaceDocument;
}): PdfEditDocumentSessionProjection {
  const projection = projectPdfEditSessionToWorkspace(
    editSession,
    document.pages,
  );
  if (!projection.compatible) return projection;

  let session = createDocumentSession({
    id: sessionId,
    document,
    initialArea: "edit",
  });
  for (const operation of projection.operations) {
    session = recordWorkspaceOperation(session, operation);
  }
  return { compatible: true, session };
}

export function bindPdfEditOperationsToWorkspacePages(
  drafts: readonly PdfEditOperationDraft[],
  pages: readonly WorkspacePage[],
): PdfEditOperationDraft[] {
  return drafts.map((draft) => {
    if (draft.workspacePageIds) return draft;
    const indices = [...new Set(pageIndices(draft))];
    if (indices.length === 0) {
      throw new RangeError("Edit operation has no Workspace page scope.");
    }
    const pageIds = indices.map((index) => {
      const pageId = pageIdAtIndex(pages, index);
      if (!pageId) {
        throw new RangeError(`Edit operation references missing page index ${index}.`);
      }
      return pageId;
    });
    return { ...draft, workspacePageIds: pageIds };
  });
}

export function workspacePageIdsAtIndices(
  pages: readonly WorkspacePage[],
  indices: readonly number[],
): WorkspacePageId[] {
  return [...new Set(indices)].map((index) => {
    const pageId = pageIdAtIndex(pages, index);
    if (!pageId) throw new RangeError(`Workspace page ${index} does not exist.`);
    return pageId;
  });
}

export function remapEditWorkspaceDocument({
  document,
  pageMap,
  pageCount,
  addedSource,
}: {
  document: WorkspaceDocument;
  pageMap: readonly (number | null)[];
  pageCount: number;
  addedSource?: WorkspaceSource;
}): WorkspaceDocument {
  const visible = visibleWorkspacePages(document.pages);
  if (pageMap.length !== visible.length) {
    throw new RangeError("Workspace page map does not match the current document.");
  }

  const nextVisible: Array<WorkspacePage | undefined> = new Array(pageCount);
  const newlyDeleted: WorkspacePage[] = [];
  pageMap.forEach((nextIndex, oldIndex) => {
    const page = visible[oldIndex];
    if (!page) throw new RangeError(`Workspace page ${oldIndex} does not exist.`);
    if (nextIndex === null) {
      newlyDeleted.push({ ...page, deleted: true });
      return;
    }
    if (nextIndex < 0 || nextIndex >= pageCount || nextVisible[nextIndex]) {
      throw new RangeError("Workspace page map contains an invalid destination.");
    }
    nextVisible[nextIndex] = page;
  });

  const sources = addedSource
    ? [...document.sources, addedSource]
    : [...document.sources];
  if (addedSource) {
    const addedPages = createSourcePages(addedSource.id, addedSource.pageCount);
    let addedIndex = 0;
    for (let index = 0; index < nextVisible.length; index += 1) {
      if (!nextVisible[index]) nextVisible[index] = addedPages[addedIndex++];
    }
    if (addedIndex !== addedPages.length) {
      throw new RangeError("Workspace added-page count does not match the page map.");
    }
  }

  if (nextVisible.some((page) => !page)) {
    throw new RangeError("Workspace page map leaves an unresolved page.");
  }
  const priorDeleted = document.pages.filter((page) => page.deleted);
  const pages = [
    ...(nextVisible as WorkspacePage[]),
    ...priorDeleted,
    ...newlyDeleted,
  ];
  assertUniquePageIds(pages);
  return { ...document, sources, pages };
}
