import assert from "node:assert/strict";
import test from "node:test";
import type { PlacedElement } from "../lib/sign/types.ts";
import {
  organizerItemsFromWorkspacePages,
  signElementsFromWorkspace,
  signElementsToWorkspace,
} from "../lib/pdf/workspace/adapters.ts";
import {
  createSourcePages,
  createWorkspaceDocument,
  type WorkspaceOperation,
} from "../lib/pdf/workspace/model.ts";
import {
  appendSourcePages,
  beginWorkspaceExport,
  completeWorkspaceExport,
  createDocumentSession,
  failWorkspaceExport,
  pageIdAtIndex,
  pageIndexForId,
  recordWorkspaceOperation,
  redoWorkspaceOperation,
  setSelectedPages,
  setWorkspaceArea,
  undoWorkspaceOperation,
} from "../lib/pdf/workspace/session.ts";

const source = {
  id: "source-a",
  name: "private.pdf",
  byteLength: 2048,
  pageCount: 4,
};
const document = createWorkspaceDocument("document-a", source);

function operation(id: string, area: WorkspaceOperation["area"]): WorkspaceOperation {
  return {
    id,
    type: id,
    area,
    description: id,
    scope: { kind: "document" },
    parameters: {},
    undoable: true,
    affectsPreview: true,
    affectsExport: true,
    flow:
      area === "optimize" || area === "enhance"
        ? { eligible: true, version: 1 }
        : { eligible: false, reason: "non-portable" },
  };
}

test("one local session records operations across workspace areas", () => {
  let session = createDocumentSession({
    id: "session-a",
    document,
    initialArea: "pages",
  });
  session = recordWorkspaceOperation(session, operation("move-page", "pages"));
  session = setWorkspaceArea(session, "enhance");
  session = recordWorkspaceOperation(session, operation("watermark", "enhance"));
  session = setWorkspaceArea(session, "sign");
  session = recordWorkspaceOperation(session, operation("signature", "sign"));
  session = setWorkspaceArea(session, "optimize");
  session = recordWorkspaceOperation(
    session,
    operation("compression-balanced", "optimize"),
  );

  assert.equal(session.state.privacy, "local");
  assert.equal(session.state.operationCount, 4);
  assert.equal(session.state.lifecycle, "modified");
  assert.equal(session.state.activeArea, "optimize");
  session = undoWorkspaceOperation(session);
  assert.equal(session.state.historyCursor, 3);
  session = redoWorkspaceOperation(session);
  assert.equal(session.state.historyCursor, 4);
});

test("verified export lifecycle is explicit and does not add undo history", () => {
  let session = createDocumentSession({
    id: "session-a",
    document,
    initialArea: "edit",
  });
  session = recordWorkspaceOperation(session, operation("edit-text", "edit"));
  const exporting = beginWorkspaceExport(session);

  assert.equal(exporting.state.lifecycle, "exporting");
  assert.equal(exporting.state.activeArea, "export");
  assert.equal(exporting.state.hasUnsavedChanges, true);
  assert.equal(exporting.state.operationCount, 1);

  const exported = completeWorkspaceExport(exporting);
  assert.equal(exported.state.lifecycle, "exported");
  assert.equal(exported.state.hasUnsavedChanges, false);
  assert.equal(exported.state.operationCount, 1);
  assert.equal(exported.state.historyCursor, 1);

  const modifiedAgain = recordWorkspaceOperation(
    exported,
    operation("edit-again", "edit"),
  );
  assert.equal(modifiedAgain.state.lifecycle, "modified");
  assert.equal(modifiedAgain.state.hasUnsavedChanges, true);
});

test("failed export preserves pending changes and requires a begun export", () => {
  let session = createDocumentSession({
    id: "session-a",
    document,
    initialArea: "edit",
  });
  session = recordWorkspaceOperation(session, operation("edit-text", "edit"));

  const failed = failWorkspaceExport(beginWorkspaceExport(session));
  assert.equal(failed.state.lifecycle, "error");
  assert.equal(failed.state.activeArea, "export");
  assert.equal(failed.state.hasUnsavedChanges, true);
  assert.equal(failed.state.operationCount, 1);
  assert.throws(() => completeWorkspaceExport(session), /must begin/);
});

test("selection keeps unique visible stable page ids", () => {
  const pages = document.pages.map((page, index) =>
    index === 1 ? { ...page, deleted: true } : page,
  );
  const session = createDocumentSession({
    id: "session-a",
    document: { ...document, pages },
    initialArea: "pages",
  });
  const selected = setSelectedPages(session, [
    pages[0]!.id,
    pages[0]!.id,
    pages[1]!.id,
    "missing-page",
  ]);
  assert.deepEqual(selected.state.selectedPageIds, [pages[0]!.id]);
});

test("stable page ids resolve after reorder and earlier-page deletion", () => {
  const pages = createSourcePages("source-a", 4);
  const signedPageId = pageIdAtIndex(pages, 2);
  assert.ok(signedPageId);
  const reordered = [pages[2]!, pages[0]!, pages[1]!, pages[3]!];
  assert.equal(pageIndexForId(reordered, signedPageId), 0);

  const withDeletedEarlierPage = pages.map((page, index) =>
    index === 0 ? { ...page, deleted: true } : page,
  );
  assert.equal(pageIndexForId(withDeletedEarlierPage, signedPageId), 1);
});

test("organizer adapter preserves stable identity, provenance, and rotation", () => {
  const pages = createSourcePages("source-a", 3).map((page, index) =>
    index === 1
      ? { ...page, deleted: true }
      : index === 2
        ? { ...page, rotation: 90 as const }
        : page,
  );
  assert.deepEqual(organizerItemsFromWorkspacePages(pages), [
    { id: "source-a:page:1", sourcePage: 1, rotation: 0 },
    { id: "source-a:page:3", sourcePage: 3, rotation: 90 },
  ]);
});

test("sign adapter keeps a placement on its stable page after reorder", () => {
  const pages = createSourcePages("source-a", 4);
  const signature: PlacedElement = {
    id: "signature-a",
    type: "signature",
    pageIndex: 2,
    xPct: 10,
    yPct: 20,
    widthPct: 25,
    heightPct: 8,
    rotationDeg: 0,
    signatureId: "saved-a",
    dataUrl: "data:image/png;base64,AA==",
    aspectRatio: 3,
  };
  const workspace = signElementsToWorkspace([signature], pages);
  assert.equal(workspace[0]?.pageId, "source-a:page:3");

  const reordered = [pages[2]!, pages[0]!, pages[1]!, pages[3]!];
  const restored = signElementsFromWorkspace(workspace, reordered);
  assert.equal(restored[0]?.pageIndex, 0);
});

test("sign adapter omits a deleted owner page instead of drifting", () => {
  const pages = createSourcePages("source-a", 3);
  const element: PlacedElement = {
    id: "text-a",
    type: "text",
    pageIndex: 1,
    xPct: 10,
    yPct: 10,
    widthPct: 20,
    heightPct: 5,
    rotationDeg: 0,
    text: "Approved",
    fontSizePt: 12,
  };
  const workspace = signElementsToWorkspace([element], pages);
  const deletedOwner = pages.map((page, index) =>
    index === 1 ? { ...page, deleted: true } : page,
  );
  assert.deepEqual(signElementsFromWorkspace(workspace, deletedOwner), []);
});

test("sign adapter rejects an invalid legacy page index", () => {
  const pages = createSourcePages("source-a", 1);
  const element: PlacedElement = {
    id: "text-a",
    type: "text",
    pageIndex: 4,
    xPct: 10,
    yPct: 10,
    widthPct: 20,
    heightPct: 5,
    rotationDeg: 0,
    text: "Approved",
    fontSizePt: 12,
  };
  assert.throws(() => signElementsToWorkspace([element], pages), RangeError);
});

test("appending a source rejects duplicate page identity", () => {
  assert.throws(
    () =>
      appendSourcePages(
        document,
        { id: "source-b", name: "second.pdf", byteLength: 1024, pageCount: 1 },
        [document.pages[0]!],
      ),
    /Duplicate workspace page id/,
  );
});
