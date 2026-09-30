import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  appendPdfEditOperations,
  createPdfEditSession,
  nativeTextOperation,
  pageOperation,
} from "../lib/pdf/edit/editSession.ts";
import {
  createSourcePages,
  createWorkspaceDocument,
} from "../lib/pdf/workspace/model.ts";
import {
  bindPdfEditOperationsToWorkspacePages,
  createPdfEditWorkspaceSession,
  projectPdfEditSessionToWorkspace,
  remapEditWorkspaceDocument,
} from "../lib/pdf/workspace/editAdapter.ts";

test("Edit text operations project to stable page ids without text payloads", () => {
  const pages = createSourcePages("source-a", 3);
  const session = appendPdfEditOperations(createPdfEditSession(4096), [
    nativeTextOperation({
      pageIndex: 1,
      spanIds: ["span-a"],
      contentStreamIndex: 0,
      formPath: null,
      operatorIndices: [4],
      fontResourceName: "F1",
      originalText: "Private original",
      replacementText: "Private replacement",
    }),
  ]);

  const projection = projectPdfEditSessionToWorkspace(session, pages);
  assert.equal(projection.compatible, true);
  if (!projection.compatible) return;
  assert.equal(projection.operations.length, 1);
  assert.deepEqual(projection.operations[0]?.scope, {
    kind: "pages",
    pageIds: ["source-a:page:2"],
  });
  assert.equal(projection.operations[0]?.type, "replace-text");
  assert.equal(projection.operations[0]?.area, "edit");
  assert.equal(
    JSON.stringify(projection.operations).includes("Private original"),
    false,
  );
  assert.equal(
    JSON.stringify(projection.operations).includes("Private replacement"),
    false,
  );
});

test("redaction remains local, sensitive, and stable-page scoped", () => {
  const pages = createSourcePages("source-a", 3);
  const session = appendPdfEditOperations(createPdfEditSession(4096), [
    pageOperation({
      operation: "redact",
      beforePageCount: 3,
      afterPageCount: 3,
      affectedPageIndices: [2],
      description: "Apply redaction",
    }),
  ]);

  const projection = projectPdfEditSessionToWorkspace(session, pages);
  assert.equal(projection.compatible, true);
  if (!projection.compatible) return;
  assert.equal(projection.operations[0]?.type, "redact");
  assert.deepEqual(projection.operations[0]?.flow, {
    eligible: false,
    reason: "sensitive",
  });
  assert.deepEqual(projection.operations[0]?.scope, {
    kind: "pages",
    pageIds: ["source-a:page:3"],
  });
});

test("searchable OCR publication projects to the enhance area", () => {
  const pages = createSourcePages("source-a", 2);
  const session = appendPdfEditOperations(createPdfEditSession(4096), [
    pageOperation({
      operation: "replace-searchable-text-layer",
      beforePageCount: 2,
      afterPageCount: 2,
      affectedPageIndices: [0],
      description: "Replace searchable text layer",
    }),
  ]);

  const projection = projectPdfEditSessionToWorkspace(session, pages);
  assert.equal(projection.compatible, true);
  if (!projection.compatible) return;
  assert.equal(projection.operations[0]?.area, "enhance");
  assert.deepEqual(projection.operations[0]?.flow, {
    eligible: false,
    reason: "content-specific",
  });
});

for (const operation of ["reorder", "delete", "merge"] as const) {
  test(`${operation} history fails closed instead of guessing stable page ownership`, () => {
    const pages = createSourcePages("source-a", 3);
    const session = appendPdfEditOperations(createPdfEditSession(4096), [
      pageOperation({
        operation,
        beforePageCount: 3,
        afterPageCount: operation === "merge" ? 4 : 3,
        affectedPageIndices: [0, 1],
        description: operation,
      }),
    ]);

    assert.deepEqual(projectPdfEditSessionToWorkspace(session, pages), {
      compatible: false,
      operations: [],
      reason: "page-topology-changed",
      operationId: "edit-op-1",
    });
  });
}

test("an unresolved page index fails the whole projection atomically", () => {
  const pages = createSourcePages("source-a", 1);
  const session = appendPdfEditOperations(createPdfEditSession(4096), [
    nativeTextOperation({
      pageIndex: 0,
      spanIds: ["span-a"],
      contentStreamIndex: 0,
      formPath: null,
      operatorIndices: [1],
      fontResourceName: "F1",
      originalText: "A",
      replacementText: "B",
    }),
    nativeTextOperation({
      pageIndex: 4,
      spanIds: ["span-b"],
      contentStreamIndex: 0,
      formPath: null,
      operatorIndices: [2],
      fontResourceName: "F1",
      originalText: "C",
      replacementText: "D",
    }),
  ]);

  assert.deepEqual(projectPdfEditSessionToWorkspace(session, pages), {
    compatible: false,
    operations: [],
    reason: "missing-page",
    operationId: "edit-op-2",
  });
});

test("an empty page scope fails closed", () => {
  const pages = createSourcePages("source-a", 2);
  const session = appendPdfEditOperations(createPdfEditSession(4096), [
    pageOperation({
      operation: "redact",
      beforePageCount: 2,
      afterPageCount: 2,
      affectedPageIndices: [],
      description: "No targets",
    }),
  ]);

  assert.deepEqual(projectPdfEditSessionToWorkspace(session, pages), {
    compatible: false,
    operations: [],
    reason: "empty-page-scope",
    operationId: "edit-op-1",
  });
});

test("Edit operations derive a local modified Workspace session", () => {
  const editSession = appendPdfEditOperations(createPdfEditSession(4096), [
    nativeTextOperation({
      pageIndex: 1,
      spanIds: ["span-a"],
      contentStreamIndex: 0,
      formPath: null,
      operatorIndices: [4],
      fontResourceName: "F1",
      originalText: "Private original",
      replacementText: "Private replacement",
    }),
  ]);

  const projection = createPdfEditWorkspaceSession({
    editSession,
    sessionId: "session-a",
    document: createWorkspaceDocument("document-a", {
      id: "source-a",
      name: "private.pdf",
      byteLength: 4096,
      pageCount: 3,
    }),
  });

  assert.equal(projection.compatible, true);
  if (!projection.compatible) return;
  assert.equal(projection.session.state.id, "session-a");
  assert.equal(projection.session.state.lifecycle, "modified");
  assert.equal(projection.session.state.privacy, "local");
  assert.equal(projection.session.state.operationCount, 1);
  assert.equal(projection.session.state.historyCursor, 1);
  assert.equal(projection.session.state.document.id, "document-a");
  assert.deepEqual(projection.session.history.operations[0]?.scope, {
    kind: "pages",
    pageIds: ["source-a:page:2"],
  });
  assert.equal(
    JSON.stringify(projection.session.history).includes("Private replacement"),
    false,
  );
});

test("an incompatible Edit history does not create a partial Workspace session", () => {
  const editSession = appendPdfEditOperations(createPdfEditSession(4096), [
    pageOperation({
      operation: "reorder",
      beforePageCount: 3,
      afterPageCount: 3,
      affectedPageIndices: [0, 1],
      description: "Reorder pages",
    }),
  ]);

  assert.deepEqual(
    createPdfEditWorkspaceSession({
      editSession,
      sessionId: "session-a",
      document: createWorkspaceDocument("document-a", {
        id: "source-a",
        name: "private.pdf",
        byteLength: 4096,
        pageCount: 3,
      }),
    }),
    {
      compatible: false,
      operations: [],
      reason: "page-topology-changed",
      operationId: "edit-op-1",
    },
  );
});

test("Edit PDF derives and exposes its Workspace compatibility state", async () => {
  const source = await readFile("components/pdf/EditPdfTool.tsx", "utf8");
  assert.match(source, /createPdfEditWorkspaceSession\(\{/);
  assert.match(source, /data-workspace-projection-compatible=/);
  assert.match(source, /data-workspace-operation-count=/);
  assert.match(source, /data-workspace-lifecycle=/);
  assert.match(source, /data-workspace-active-area=/);
  assert.match(source, /data-workspace-has-unsaved-changes=/);
  assert.match(source, /data-workspace-projection-reason=/);
  assert.match(source, /exportRequestRevisionRef\.current !== exportRequestRevision/);
  assert.match(source, /workspaceDocument: nextWorkspaceDocument/);
});

test("bound text scope follows its stable page through a reorder", () => {
  const source = {
    id: "source-a",
    name: "private.pdf",
    byteLength: 4096,
    pageCount: 3,
  };
  const document = createWorkspaceDocument("document-a", source);
  const [draft] = bindPdfEditOperationsToWorkspacePages(
    [
      nativeTextOperation({
        pageIndex: 1,
        spanIds: ["span-a"],
        contentStreamIndex: 0,
        formPath: null,
        operatorIndices: [4],
        fontResourceName: "F1",
        originalText: "A",
        replacementText: "B",
      }),
    ],
    document.pages,
  );
  const session = appendPdfEditOperations(createPdfEditSession(4096), [
    draft,
    pageOperation({
      operation: "reorder",
      beforePageCount: 3,
      afterPageCount: 3,
      affectedPageIndices: [0, 1],
      description: "Reorder pages",
      workspacePageIds: ["source-a:page:1", "source-a:page:2"],
    }),
  ]);
  const reordered = remapEditWorkspaceDocument({
    document,
    pageMap: [1, 0, 2],
    pageCount: 3,
  });

  const projection = projectPdfEditSessionToWorkspace(
    session,
    reordered.pages,
  );
  assert.equal(projection.compatible, true);
  if (!projection.compatible) return;
  assert.deepEqual(
    reordered.pages.filter((page) => !page.deleted).map((page) => page.id),
    ["source-a:page:2", "source-a:page:1", "source-a:page:3"],
  );
  assert.deepEqual(projection.operations[0]?.scope, {
    kind: "pages",
    pageIds: ["source-a:page:2"],
  });
  assert.equal(projection.operations[1]?.area, "pages");
  assert.deepEqual(projection.operations[1]?.flow, {
    eligible: false,
    reason: "page-specific",
  });
});

test("deleted pages remain stable tombstones for bound history", () => {
  const document = createWorkspaceDocument("document-a", {
    id: "source-a",
    name: "private.pdf",
    byteLength: 4096,
    pageCount: 3,
  });
  const next = remapEditWorkspaceDocument({
    document,
    pageMap: [null, 0, 1],
    pageCount: 2,
  });

  assert.deepEqual(
    next.pages.filter((page) => !page.deleted).map((page) => page.id),
    ["source-a:page:2", "source-a:page:3"],
  );
  assert.deepEqual(
    next.pages.filter((page) => page.deleted).map((page) => page.id),
    ["source-a:page:1"],
  );
  const session = appendPdfEditOperations(createPdfEditSession(4096), [
    pageOperation({
      operation: "delete",
      beforePageCount: 3,
      afterPageCount: 2,
      affectedPageIndices: [0],
      description: "Delete page",
      workspacePageIds: ["source-a:page:1"],
    }),
  ]);
  assert.equal(projectPdfEditSessionToWorkspace(session, next.pages).compatible, true);
});

test("merged pages receive distinct source provenance and fill the page-map gap", () => {
  const document = createWorkspaceDocument("document-a", {
    id: "source-a",
    name: "private.pdf",
    byteLength: 4096,
    pageCount: 2,
  });
  const next = remapEditWorkspaceDocument({
    document,
    pageMap: [0, 3],
    pageCount: 4,
    addedSource: {
      id: "source-b",
      name: "added.pdf",
      byteLength: 2048,
      pageCount: 2,
    },
  });

  assert.deepEqual(
    next.pages.filter((page) => !page.deleted).map((page) => page.id),
    [
      "source-a:page:1",
      "source-b:page:1",
      "source-b:page:2",
      "source-a:page:2",
    ],
  );
  assert.deepEqual(next.sources.map((source) => source.id), [
    "source-a",
    "source-b",
  ]);
});
