import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { organizerItemsFromWorkspacePages } from "../lib/pdf/workspace/adapters.ts";
import { createWorkspaceDocument } from "../lib/pdf/workspace/model.ts";
import {
  createOrganizerWorkspaceSession,
  createOrganizerWorkspaceSnapshot,
  deleteOrganizerWorkspacePages,
  duplicateOrganizerWorkspacePage,
  moveOrganizerWorkspacePage,
  projectOrganizerExportState,
  rotateOrganizerWorkspacePages,
} from "../lib/pdf/workspace/pagesAdapter.ts";

const source = {
  id: "source-a",
  name: "private.pdf",
  byteLength: 2048,
  pageCount: 3,
};

function snapshot() {
  return createOrganizerWorkspaceSnapshot(
    createWorkspaceDocument("document-a", source),
  );
}

test("Pages actions retain stable identity and project one shared operation per action", () => {
  let current = snapshot();
  current = moveOrganizerWorkspacePage(current, 0, 2);
  current = rotateOrganizerWorkspacePages(current, new Set([0, 2]), "right");
  current = duplicateOrganizerWorkspacePage(
    current,
    1,
    "source-a:page:3:copy:1",
  );
  current = deleteOrganizerWorkspacePages(current, new Set([2]));

  assert.deepEqual(organizerItemsFromWorkspacePages(current.document.pages), [
    { id: "source-a:page:2", sourcePage: 2, rotation: 90 },
    { id: "source-a:page:3", sourcePage: 3, rotation: 0 },
    { id: "source-a:page:1", sourcePage: 1, rotation: 90 },
  ]);
  assert.equal(
    current.document.pages.find(
      (page) => page.id === "source-a:page:3:copy:1",
    )?.deleted,
    true,
  );
  assert.equal(
    current.document.pages.find(
      (page) => page.id === "source-a:page:3:copy:1",
    )?.provenance.sourcePageNumber,
    3,
  );

  const session = createOrganizerWorkspaceSession(current);
  assert.equal(session.state.lifecycle, "modified");
  assert.equal(session.state.activeArea, "pages");
  assert.equal(session.state.operationCount, 4);
  assert.deepEqual(
    session.history.operations.map((operation) => operation.type),
    ["reorder-pages", "rotate-pages", "duplicate-pages", "delete-pages"],
  );
  assert.deepEqual(session.history.operations[3]?.scope, {
    kind: "pages",
    pageIds: ["source-a:page:3:copy:1"],
  });
  assert.deepEqual(session.history.operations[3]?.flow, {
    eligible: false,
    reason: "page-specific",
  });
});

test("invalid and identity page moves do not create phantom history", () => {
  const current = snapshot();
  assert.equal(moveOrganizerWorkspacePage(current, 0, 0), current);
  assert.equal(moveOrganizerWorkspacePage(current, -1, 2), current);
  assert.equal(
    rotateOrganizerWorkspacePages(current, new Set(), "left"),
    current,
  );
  assert.equal(deleteOrganizerWorkspacePages(current, new Set()), current);
  assert.equal(current.semanticHistory.entries.length, 0);
});

test("Pages export lifecycle stays outside undo history", () => {
  const changed = rotateOrganizerWorkspacePages(snapshot(), new Set([1]), "left");
  const session = createOrganizerWorkspaceSession(changed);
  const exporting = projectOrganizerExportState(session, "exporting");
  const exported = projectOrganizerExportState(session, "exported");
  const failed = projectOrganizerExportState(session, "error");

  assert.equal(exporting.state.lifecycle, "exporting");
  assert.equal(exported.state.lifecycle, "exported");
  assert.equal(exported.state.hasUnsavedChanges, false);
  assert.equal(failed.state.lifecycle, "error");
  assert.equal(failed.state.hasUnsavedChanges, true);
  assert.equal(exported.state.operationCount, 1);
  assert.equal(exported.history.operations.length, 1);
});

test("Organize runtime exposes Workspace history and rejects stale exports", async () => {
  const source = await readFile(
    new URL("../components/pdf/OrganizePdfTool.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /useHistoryState<OrganizerWorkspaceSnapshot \| null>/);
  assert.match(source, /createOrganizerWorkspaceSession\(organizerState\)/);
  assert.match(source, /data-workspace-operation-count/);
  assert.match(source, /data-workspace-lifecycle/);
  assert.match(source, /exportRevision !== exportRevisionRef\.current/);
  assert.match(source, /exportSnapshot !== getCurrentOrganizerState\(\)/);
  assert.match(source, /onClick=\{handleUndo\}/);
  assert.match(source, /onClick=\{handleRedo\}/);
});
