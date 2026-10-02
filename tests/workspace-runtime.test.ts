import assert from "node:assert/strict";
import test from "node:test";
import {
  createWorkspaceRuntime,
  createWorkspaceRuntimeFromSession,
  mergeWorkspaceSessions,
  publishWorkspaceRevision,
  updateWorkspaceRuntimeSession,
  workspaceRuntimeBytes,
  workspaceRuntimeHasChanges,
  WorkspaceRevisionConflictError,
} from "../lib/pdf/workspace/runtime.ts";
import {
  createDocumentSession,
  recordWorkspaceOperation,
  setWorkspaceArea,
} from "../lib/pdf/workspace/session.ts";

function bytes(...values: number[]): ArrayBuffer {
  return Uint8Array.from(values).buffer;
}

function operation(
  id: string,
  area: "edit" | "pages" | "sign",
  description: string,
) {
  return {
    id,
    type: id,
    area,
    description,
    scope: { kind: "document" as const },
    parameters: {},
    undoable: true,
    affectsPreview: true,
    affectsExport: true,
    flow: { eligible: false as const, reason: "content-specific" as const },
  };
}

test("shared runtime starts with one stable document and an immutable byte copy", () => {
  const source = bytes(1, 2, 3, 4);
  const runtime = createWorkspaceRuntime({
    id: "doc-a",
    sourceId: "source-a",
    fileName: "source.pdf",
    bytes: source,
    pageCount: 2,
    initialArea: "edit",
  });

  new Uint8Array(source)[0] = 99;

  assert.equal(runtime.revision.number, 0);
  assert.equal(runtime.revision.fileName, "source.pdf");
  assert.equal(runtime.revision.pageCount, 2);
  assert.equal(runtime.session.state.activeArea, "edit");
  assert.equal(runtime.session.state.document.pages.length, 2);
  assert.deepEqual([...new Uint8Array(runtime.revision.bytes)], [1, 2, 3, 4]);
  assert.equal(workspaceRuntimeHasChanges(runtime), false);
});

test("publishing a revision advances bytes and area without changing page identity", () => {
  const runtime = createWorkspaceRuntime({
    id: "doc-a",
    sourceId: "source-a",
    fileName: "source.pdf",
    bytes: bytes(1, 2),
    pageCount: 2,
    initialArea: "edit",
  });

  const pageIds = runtime.session.state.document.pages.map((page) => page.id);
  const next = publishWorkspaceRevision(runtime, {
    expectedRevision: 0,
    bytes: bytes(7, 8, 9),
    fileName: "edited.pdf",
    pageCount: 2,
    area: "sign",
  });

  assert.equal(next.revision.number, 1);
  assert.equal(next.revision.fileName, "edited.pdf");
  assert.equal(next.revision.byteLength, 3);
  assert.equal(next.session.state.activeArea, "sign");
  assert.deepEqual(
    next.session.state.document.pages.map((page) => page.id),
    pageIds,
  );
  assert.equal(workspaceRuntimeHasChanges(next), true);
});

test("stale async publishers cannot overwrite a newer document revision", () => {
  const runtime = createWorkspaceRuntime({
    id: "doc-a",
    sourceId: "source-a",
    fileName: "source.pdf",
    bytes: bytes(1),
    pageCount: 1,
    initialArea: "edit",
  });
  const newer = publishWorkspaceRevision(runtime, {
    expectedRevision: 0,
    bytes: bytes(2),
    pageCount: 1,
    area: "pages",
  });

  assert.throws(
    () =>
      publishWorkspaceRevision(newer, {
        expectedRevision: 0,
        bytes: bytes(3),
        pageCount: 1,
        area: "sign",
      }),
    (error: unknown) =>
      error instanceof WorkspaceRevisionConflictError &&
      error.expectedRevision === 0 &&
      error.actualRevision === 1,
  );
});

test("page-count changes require matching workspace topology", () => {
  const runtime = createWorkspaceRuntime({
    id: "doc-a",
    sourceId: "source-a",
    fileName: "source.pdf",
    bytes: bytes(1),
    pageCount: 2,
    initialArea: "pages",
  });

  assert.throws(
    () =>
      publishWorkspaceRevision(runtime, {
        expectedRevision: 0,
        bytes: bytes(2),
        pageCount: 1,
        area: "pages",
      }),
    /page count does not match/i,
  );

  const oneVisiblePage = {
    ...runtime.session.state.document,
    pages: runtime.session.state.document.pages.map((page, index) =>
      index === 1 ? { ...page, deleted: true } : page,
    ),
  };
  const next = publishWorkspaceRevision(runtime, {
    expectedRevision: 0,
    bytes: bytes(2),
    pageCount: 1,
    area: "pages",
    document: oneVisiblePage,
  });

  assert.equal(next.revision.pageCount, 1);
  assert.equal(
    next.session.state.document.pages.filter((page) => !page.deleted).length,
    1,
  );
});

test("runtime can accept an adapter-projected semantic session without duplicating history", () => {
  const runtime = createWorkspaceRuntime({
    id: "doc-a",
    sourceId: "source-a",
    fileName: "source.pdf",
    bytes: bytes(1),
    pageCount: 1,
    initialArea: "edit",
  });

  const session = recordWorkspaceOperation(
    setWorkspaceArea(runtime.session, "sign"),
    {
      id: "sign-1",
      type: "sign.add",
      area: "sign",
      description: "Signature added",
      scope: { kind: "pages", pageIds: [runtime.session.state.document.pages[0]!.id] },
      parameters: {},
      undoable: true,
      affectsPreview: true,
      affectsExport: true,
      flow: { eligible: false, reason: "sensitive" },
    },
  );

  const next = updateWorkspaceRuntimeSession(runtime, session);
  assert.equal(next.session.state.activeArea, "sign");
  assert.equal(next.session.state.operationCount, 1);
  assert.equal(next.session.history.operations[0]?.description, "Signature added");
});

test("runtime byte reads return defensive copies", () => {
  const runtime = createWorkspaceRuntime({
    id: "doc-a",
    sourceId: "source-a",
    fileName: "source.pdf",
    bytes: bytes(1, 2, 3),
    pageCount: 1,
    initialArea: "edit",
  });

  const first = workspaceRuntimeBytes(runtime);
  new Uint8Array(first)[0] = 55;
  const second = workspaceRuntimeBytes(runtime);

  assert.deepEqual([...new Uint8Array(second)], [1, 2, 3]);
});

test("continuation can start from an existing semantic session without losing provenance", () => {
  const local = createWorkspaceRuntime({
    id: "local-doc",
    sourceId: "source-a",
    fileName: "source.pdf",
    bytes: bytes(1, 2),
    pageCount: 2,
    initialArea: "edit",
  });
  const edited = recordWorkspaceOperation(
    local.session,
    operation("edit-1", "edit", "Text edited"),
  );

  const shared = createWorkspaceRuntimeFromSession({
    id: "shared-doc",
    fileName: "edited.pdf",
    bytes: bytes(7, 8, 9),
    pageCount: 2,
    area: "pages",
    session: edited,
  });

  assert.equal(shared.session.state.document.id, "local-doc");
  assert.equal(shared.session.state.activeArea, "pages");
  assert.equal(shared.session.state.operationCount, 1);
  assert.equal(shared.session.history.operations[0]?.description, "Text edited");
  assert.equal(shared.origin.fileName, "source.pdf");
  assert.equal(shared.revision.fileName, "edited.pdf");
});

test("continuation merges new tool history onto the shared document history", () => {
  const runtime = createWorkspaceRuntime({
    id: "doc-a",
    sourceId: "source-a",
    fileName: "source.pdf",
    bytes: bytes(1),
    pageCount: 1,
    initialArea: "edit",
  });
  const afterEdit = recordWorkspaceOperation(
    runtime.session,
    operation("edit-1", "edit", "Text edited"),
  );

  let signOnly = createDocumentSession({
    id: "sign-local",
    document: afterEdit.state.document,
    initialArea: "sign",
  });
  signOnly = recordWorkspaceOperation(
    signOnly,
    operation("sign-1", "sign", "Signature added"),
  );

  const merged = mergeWorkspaceSessions(afterEdit, signOnly, "pages");

  assert.deepEqual(
    merged.history.operations.map((item) => item.description),
    ["Text edited", "Signature added"],
  );
  assert.equal(merged.state.historyCursor, 2);
  assert.equal(merged.state.operationCount, 2);
  assert.equal(merged.state.activeArea, "pages");
  assert.equal(
    merged.state.document.pages[0]?.id,
    afterEdit.state.document.pages[0]?.id,
  );
});

test("continuation does not duplicate an operation already present in shared history", () => {
  const runtime = createWorkspaceRuntime({
    id: "doc-a",
    sourceId: "source-a",
    fileName: "source.pdf",
    bytes: bytes(1),
    pageCount: 1,
    initialArea: "edit",
  });
  const editOperation = operation("edit-1", "edit", "Text edited");
  const base = recordWorkspaceOperation(runtime.session, editOperation);

  let incoming = createDocumentSession({
    id: "edit-local",
    document: base.state.document,
    initialArea: "edit",
  });
  incoming = recordWorkspaceOperation(incoming, editOperation);

  const merged = mergeWorkspaceSessions(base, incoming, "sign");
  assert.equal(merged.history.operations.length, 1);
  assert.equal(merged.state.activeArea, "sign");
});
