import assert from "node:assert/strict";
import test from "node:test";
import {
  appendPdfEditOperations,
  createPdfEditSession,
  nativeTextOperation,
  pageOperation,
} from "../lib/pdf/edit/editSession.ts";
import { createSourcePages } from "../lib/pdf/workspace/model.ts";
import { projectPdfEditSessionToWorkspace } from "../lib/pdf/workspace/editAdapter.ts";

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
