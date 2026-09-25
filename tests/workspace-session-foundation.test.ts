import assert from "node:assert/strict";
import test from "node:test";
import { assertUniquePageIds, createSourcePages, createWorkspaceDocument, type WorkspaceOperation } from "../lib/pdf/workspace/model.ts";
import { appliedOperations, applyOperation, canRedo, canUndo, createWorkspaceHistory, redo, returnToOriginal, undo } from "../lib/pdf/workspace/history.ts";

function op(id: string, area: WorkspaceOperation["area"] = "pages"): WorkspaceOperation {
  return {
    id,
    type: "test",
    area,
    description: id,
    scope: { kind: "document" },
    parameters: {},
    undoable: true,
    affectsPreview: true,
    affectsExport: true,
    flow: { eligible: false, reason: "non-portable" },
  };
}

test("source pages receive stable provenance-backed identities", () => {
  const pages = createSourcePages("source-a", 3);
  assert.deepEqual(pages.map((page) => page.id), ["source-a:page:1", "source-a:page:2", "source-a:page:3"]);
  assert.deepEqual(pages.map((page) => page.provenance.sourcePageNumber), [1, 2, 3]);
  assert.doesNotThrow(() => assertUniquePageIds(pages));
});

test("workspace document keeps source metadata separate from working pages", () => {
  const source = { id: "source-a", name: "private.pdf", byteLength: 1234, pageCount: 2 };
  const document = createWorkspaceDocument("doc-a", source);
  assert.equal(document.sources[0], source);
  assert.equal(document.pages.length, 2);
  assert.equal(document.pages[1]?.provenance.sourceDocumentId, "source-a");
});

test("history supports cross-area undo and redo", () => {
  let history = createWorkspaceHistory();
  history = applyOperation(history, op("move-page", "pages"));
  history = applyOperation(history, op("watermark", "enhance"));
  history = applyOperation(history, op("signature", "sign"));
  assert.equal(canUndo(history), true);
  history = undo(history);
  assert.deepEqual(appliedOperations(history).map((item) => item.id), ["move-page", "watermark"]);
  assert.equal(canRedo(history), true);
  history = redo(history);
  assert.deepEqual(appliedOperations(history).map((item) => item.id), ["move-page", "watermark", "signature"]);
});

test("new operation after undo invalidates obsolete redo branch", () => {
  let history = createWorkspaceHistory();
  history = applyOperation(history, op("a"));
  history = applyOperation(history, op("b"));
  history = applyOperation(history, op("c"));
  history = undo(history);
  history = applyOperation(history, op("d", "optimize"));
  assert.deepEqual(history.operations.map((item) => item.id), ["a", "b", "d"]);
  assert.equal(canRedo(history), false);
});

test("return to original rewinds a fully reversible journal", () => {
  let history = createWorkspaceHistory();
  history = applyOperation(history, op("a"));
  history = applyOperation(history, op("b"));
  history = returnToOriginal(history);
  assert.equal(history.cursor, 0);
  assert.equal(history.operations.length, 2);
});
