import type {
  PdfEditOperation,
  PdfEditSessionState,
} from "../edit/editSession.ts";
import type {
  WorkspaceOperation,
  WorkspacePage,
  WorkspacePageId,
} from "./model.ts";
import { pageIdAtIndex } from "./session.ts";

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

function pageIndices(operation: PdfEditOperation): readonly number[] {
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
    TOPOLOGY_OPERATIONS.has(operation.operation)
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
        reason: sensitive ? "sensitive" : "content-specific",
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
