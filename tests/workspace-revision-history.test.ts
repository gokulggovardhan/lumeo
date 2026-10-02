import assert from "node:assert/strict";
import test from "node:test";
import {
  appendWorkspaceCheckpoint,
  canRedoWorkspaceCheckpoint,
  canUndoWorkspaceCheckpoint,
  createWorkspaceRevisionHistory,
  currentWorkspaceCheckpoint,
  redoWorkspaceCheckpoint,
  undoWorkspaceCheckpoint,
} from "../lib/pdf/workspace/revisionHistory.ts";
import {
  createWorkspaceRuntime,
  publishWorkspaceRevision,
  workspaceRuntimeBytes,
} from "../lib/pdf/workspace/runtime.ts";

function bytes(...values: number[]): ArrayBuffer {
  return Uint8Array.from(values).buffer;
}

test("workspace checkpoint undo restores real PDF bytes and metadata", () => {
  const initial = createWorkspaceRuntime({
    id: "doc-history",
    sourceId: "source-history",
    fileName: "first.pdf",
    bytes: bytes(1, 2, 3),
    pageCount: 1,
    initialArea: "pages",
  });
  const next = publishWorkspaceRevision(initial, {
    expectedRevision: 0,
    bytes: bytes(9, 8, 7, 6),
    fileName: "second.pdf",
    pageCount: 1,
    area: "sign",
  });

  const history = appendWorkspaceCheckpoint(
    createWorkspaceRevisionHistory(initial),
    next,
  );
  assert.equal(canUndoWorkspaceCheckpoint(history), true);

  const undone = undoWorkspaceCheckpoint(history);
  const restored = currentWorkspaceCheckpoint(undone);
  assert.equal(restored.revision.fileName, "first.pdf");
  assert.equal(restored.revision.pageCount, 1);
  assert.equal(restored.session.state.activeArea, "pages");
  assert.deepEqual([...new Uint8Array(workspaceRuntimeBytes(restored))], [1, 2, 3]);
});

test("workspace checkpoint redo restores the exact later revision", () => {
  const initial = createWorkspaceRuntime({
    id: "doc-history",
    sourceId: "source-history",
    fileName: "first.pdf",
    bytes: bytes(1),
    pageCount: 1,
    initialArea: "edit",
  });
  const next = publishWorkspaceRevision(initial, {
    expectedRevision: 0,
    bytes: bytes(2, 3),
    fileName: "edited.pdf",
    pageCount: 1,
    area: "pages",
  });

  const history = appendWorkspaceCheckpoint(
    createWorkspaceRevisionHistory(initial),
    next,
  );
  const undone = undoWorkspaceCheckpoint(history);
  assert.equal(canRedoWorkspaceCheckpoint(undone), true);

  const redone = redoWorkspaceCheckpoint(undone);
  const restored = currentWorkspaceCheckpoint(redone);
  assert.equal(restored.revision.number, 1);
  assert.equal(restored.revision.fileName, "edited.pdf");
  assert.deepEqual([...new Uint8Array(workspaceRuntimeBytes(restored))], [2, 3]);
});

test("new work after undo discards the obsolete redo branch", () => {
  const initial = createWorkspaceRuntime({
    id: "doc-history",
    sourceId: "source-history",
    fileName: "source.pdf",
    bytes: bytes(1),
    pageCount: 1,
    initialArea: "edit",
  });
  const first = publishWorkspaceRevision(initial, {
    expectedRevision: 0,
    bytes: bytes(2),
    pageCount: 1,
    area: "pages",
  });
  const second = publishWorkspaceRevision(first, {
    expectedRevision: 1,
    bytes: bytes(3),
    pageCount: 1,
    area: "sign",
  });

  let history = createWorkspaceRevisionHistory(initial);
  history = appendWorkspaceCheckpoint(history, first);
  history = appendWorkspaceCheckpoint(history, second);
  history = undoWorkspaceCheckpoint(history);

  const replacement = publishWorkspaceRevision(first, {
    expectedRevision: 1,
    bytes: bytes(4, 5),
    fileName: "replacement.pdf",
    pageCount: 1,
    area: "optimize",
  });
  history = appendWorkspaceCheckpoint(history, replacement);

  assert.equal(canRedoWorkspaceCheckpoint(history), false);
  assert.equal(history.checkpoints.length, 3);
  assert.equal(currentWorkspaceCheckpoint(history).revision.fileName, "replacement.pdf");
  assert.deepEqual(
    [...new Uint8Array(workspaceRuntimeBytes(currentWorkspaceCheckpoint(history)))],
    [4, 5],
  );
});

test("checkpoint history rejects a different document identity", () => {
  const first = createWorkspaceRuntime({
    id: "doc-a",
    sourceId: "source-a",
    fileName: "a.pdf",
    bytes: bytes(1),
    pageCount: 1,
    initialArea: "edit",
  });
  const second = createWorkspaceRuntime({
    id: "doc-b",
    sourceId: "source-b",
    fileName: "b.pdf",
    bytes: bytes(2),
    pageCount: 1,
    initialArea: "edit",
  });

  assert.throws(
    () =>
      appendWorkspaceCheckpoint(
        createWorkspaceRevisionHistory(first),
        second,
      ),
    /different documents/i,
  );
});
