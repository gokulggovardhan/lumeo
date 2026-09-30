import {
  appendPdfSemanticHistory,
  createPdfSemanticHistory,
  type PdfSemanticHistoryEntry,
  type PdfSemanticHistoryJournal,
} from "../history/semanticHistory.ts";
import type { WorkspaceDocument, WorkspacePage } from "./model.ts";
import {
  beginWorkspaceExport,
  completeWorkspaceExport,
  createDocumentSession,
  failWorkspaceExport,
  recordWorkspaceOperation,
  visibleWorkspacePages,
  type DocumentSession,
} from "./session.ts";

export type OrganizerWorkspaceSnapshot = {
  document: WorkspaceDocument;
  semanticHistory: PdfSemanticHistoryJournal;
};

type RotationDirection = "left" | "right";

function visiblePages(snapshot: OrganizerWorkspaceSnapshot): WorkspacePage[] {
  return [...visibleWorkspacePages(snapshot.document.pages)];
}

function deletedPages(snapshot: OrganizerWorkspaceSnapshot): WorkspacePage[] {
  return snapshot.document.pages.filter((page) => page.deleted);
}

function pageRotations(pages: readonly WorkspacePage[]) {
  return Object.fromEntries(
    pages.map((page) => [page.id, page.rotation] as const),
  );
}

function appendPagesEntry(
  snapshot: OrganizerWorkspaceSnapshot,
  entry: Parameters<typeof appendPdfSemanticHistory>[1][number],
  pages: readonly WorkspacePage[],
): OrganizerWorkspaceSnapshot {
  return {
    document: {
      ...snapshot.document,
      pages,
    },
    semanticHistory: appendPdfSemanticHistory(snapshot.semanticHistory, [entry]),
  };
}

export function createOrganizerWorkspaceSnapshot(
  document: WorkspaceDocument,
): OrganizerWorkspaceSnapshot {
  return {
    document,
    semanticHistory: createPdfSemanticHistory(),
  };
}

export function moveOrganizerWorkspacePage(
  snapshot: OrganizerWorkspaceSnapshot,
  fromIndex: number,
  toIndex: number,
): OrganizerWorkspaceSnapshot {
  const pages = visiblePages(snapshot);
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= pages.length ||
    toIndex >= pages.length
  ) {
    return snapshot;
  }

  const beforeIds = pages.map((page) => page.id);
  const [moved] = pages.splice(fromIndex, 1);
  pages.splice(toIndex, 0, moved!);
  const afterIds = pages.map((page) => page.id);

  return appendPagesEntry(
    snapshot,
    {
      tool: "pages",
      type: "reorder-pages",
      target: {
        kind: "pages",
        pageIndices: afterIds.map((_, index) => index),
        pageIds: afterIds,
      },
      before: { pageCount: pages.length, pageIds: beforeIds },
      after: { pageCount: pages.length, pageIds: afterIds },
    },
    [...pages, ...deletedPages(snapshot)],
  );
}

export function rotateOrganizerWorkspacePages(
  snapshot: OrganizerWorkspaceSnapshot,
  indices: ReadonlySet<number>,
  direction: RotationDirection,
): OrganizerWorkspaceSnapshot {
  const pages = visiblePages(snapshot);
  const selected = pages.filter((_, index) => indices.has(index));
  if (selected.length === 0) return snapshot;

  const delta = direction === "right" ? 90 : -90;
  const before = pageRotations(selected);
  const next = pages.map((page, index) =>
    indices.has(index)
      ? {
          ...page,
          rotation: (((page.rotation + delta + 360) % 360) as WorkspacePage["rotation"]),
        }
      : page,
  );
  const selectedIds = selected.map((page) => page.id);
  const after = pageRotations(next.filter((page) => selectedIds.includes(page.id)));

  return appendPagesEntry(
    snapshot,
    {
      tool: "pages",
      type: "rotate-pages",
      target: {
        kind: "pages",
        pageIndices: [...indices],
        pageIds: selectedIds,
      },
      before: { pageRotations: before },
      after: { pageRotations: after },
    },
    [...next, ...deletedPages(snapshot)],
  );
}

export function duplicateOrganizerWorkspacePage(
  snapshot: OrganizerWorkspaceSnapshot,
  index: number,
  duplicateId: string,
): OrganizerWorkspaceSnapshot {
  const pages = visiblePages(snapshot);
  const source = pages[index];
  if (!source) return snapshot;
  if (snapshot.document.pages.some((page) => page.id === duplicateId)) {
    throw new Error(`Duplicate workspace page id: ${duplicateId}`);
  }

  const duplicate = { ...source, id: duplicateId };
  const next = [...pages];
  next.splice(index + 1, 0, duplicate);
  return appendPagesEntry(
    snapshot,
    {
      tool: "pages",
      type: "duplicate-pages",
      target: {
        kind: "pages",
        pageIndices: [index],
        pageIds: [source.id, duplicateId],
      },
      before: { pageCount: pages.length, pageIds: pages.map((page) => page.id) },
      after: { pageCount: next.length, pageIds: next.map((page) => page.id) },
    },
    [...next, ...deletedPages(snapshot)],
  );
}

export function deleteOrganizerWorkspacePages(
  snapshot: OrganizerWorkspaceSnapshot,
  indices: ReadonlySet<number>,
): OrganizerWorkspaceSnapshot {
  const pages = visiblePages(snapshot);
  const removed = pages.filter((_, index) => indices.has(index));
  if (removed.length === 0) return snapshot;

  const removedIds = removed.map((page) => page.id);
  const remaining = pages.filter((_, index) => !indices.has(index));
  const newlyDeleted = removed.map((page) => ({ ...page, deleted: true }));
  return appendPagesEntry(
    snapshot,
    {
      tool: "pages",
      type: "delete-pages",
      target: {
        kind: "pages",
        pageIndices: [...indices],
        pageIds: removedIds,
      },
      before: { pageCount: pages.length, pageIds: pages.map((page) => page.id) },
      after: {
        pageCount: remaining.length,
        pageIds: remaining.map((page) => page.id),
      },
    },
    [...remaining, ...deletedPages(snapshot), ...newlyDeleted],
  );
}

function workspaceOperationFromEntry(entry: PdfSemanticHistoryEntry) {
  const pageIds =
    entry.target.kind === "pages" ? (entry.target.pageIds ?? []) : [];
  return {
    id: `workspace-${entry.id}`,
    type: entry.type,
    area: "pages" as const,
    description: entry.description ?? entry.type,
    scope: { kind: "pages" as const, pageIds },
    parameters: {
      before: entry.before,
      after: entry.after,
    },
    undoable: true,
    affectsPreview: true,
    affectsExport: true,
    flow: { eligible: false as const, reason: "page-specific" as const },
  };
}

export function createOrganizerWorkspaceSession(
  snapshot: OrganizerWorkspaceSnapshot,
): DocumentSession {
  let session = createDocumentSession({
    id: `organize-${snapshot.document.id}`,
    document: snapshot.document,
    initialArea: "pages",
  });
  for (const entry of snapshot.semanticHistory.entries) {
    session = recordWorkspaceOperation(
      session,
      workspaceOperationFromEntry(entry),
    );
  }
  return session;
}

export function projectOrganizerExportState(
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
