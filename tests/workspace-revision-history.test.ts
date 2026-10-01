import assert from "node:assert/strict";
import test from "node:test";
import type { WorkspaceArea } from "../lib/pdf/workspace/model.ts";
import {
  appendWorkspaceRevision,
  createWorkspaceRevisionHistory,
  currentWorkspaceRevision,
  redoWorkspaceRevision,
  undoWorkspaceRevision,
  type WorkspaceRevision,
} from "../lib/pdf/workspace/revisionHistory.ts";

function revision(
  id: string,
  size: number,
  area: WorkspaceArea = "edit",
): WorkspaceRevision {
  return {
    id,
    blob: new Blob([new Uint8Array(size)]),
    filename: `${id}.pdf`,
    byteLength: size,
    pageCount: 2,
    area,
    description: id,
    createdAt: 1,
  };
}

test("workspace revisions undo and redo across applied tool boundaries", () => {
  let history = createWorkspaceRevisionHistory(revision("original", 10));
  history = appendWorkspaceRevision(history, revision("edit", 12, "edit"));
  history = appendWorkspaceRevision(history, revision("sign", 14, "sign"));

  assert.equal(currentWorkspaceRevision(history).id, "sign");
  history = undoWorkspaceRevision(history);
  assert.equal(currentWorkspaceRevision(history).id, "edit");
  history = undoWorkspaceRevision(history);
  assert.equal(currentWorkspaceRevision(history).id, "original");
  history = redoWorkspaceRevision(history);
  assert.equal(currentWorkspaceRevision(history).id, "edit");
});

test("applying after undo discards the obsolete redo branch", () => {
  let history = createWorkspaceRevisionHistory(revision("original", 10));
  history = appendWorkspaceRevision(history, revision("edit", 10));
  history = appendWorkspaceRevision(history, revision("sign", 10));
  history = undoWorkspaceRevision(history);
  history = appendWorkspaceRevision(history, revision("pages", 10, "pages"));

  assert.deepEqual(history.revisions.map((item) => item.id), [
    "original",
    "edit",
    "pages",
  ]);
  assert.equal(currentWorkspaceRevision(history).id, "pages");
  assert.equal(redoWorkspaceRevision(history), history);
});

test("history evicts oldest snapshots when memory or entry limits are reached", () => {
  let history = createWorkspaceRevisionHistory(revision("original", 60), {
    maxEntries: 3,
    maxBytes: 130,
  });
  history = appendWorkspaceRevision(history, revision("one", 60));
  history = appendWorkspaceRevision(history, revision("two", 60));

  assert.deepEqual(history.revisions.map((item) => item.id), ["one", "two"]);
  assert.equal(history.cursor, 1);
  assert.equal(history.historyLimited, true);
  assert.equal(currentWorkspaceRevision(history).id, "two");
});

test("an oversized active revision is retained instead of losing the document", () => {
  let history = createWorkspaceRevisionHistory(revision("original", 10), {
    maxEntries: 2,
    maxBytes: 20,
  });
  history = appendWorkspaceRevision(history, revision("large", 50));

  assert.deepEqual(history.revisions.map((item) => item.id), ["large"]);
  assert.equal(history.cursor, 0);
  assert.equal(history.historyLimited, true);
});
