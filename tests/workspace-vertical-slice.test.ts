import assert from "node:assert/strict";
import test from "node:test";
import type { PlacedElement } from "../lib/sign/types.ts";
import { createSourcePages, createWorkspaceDocument, type WorkspaceOperation } from "../lib/pdf/workspace/model.ts";
import { signElementsFromWorkspace, signElementsToWorkspace } from "../lib/pdf/workspace/adapters.ts";
import { createDocumentSession, pageIdAtIndex, pageIndexForId, recordWorkspaceOperation, redoWorkspaceOperation, setWorkspaceArea, undoWorkspaceOperation } from "../lib/pdf/workspace/session.ts";

const source = { id: "source-a", name: "private.pdf", byteLength: 2048, pageCount: 4 };
const document = createWorkspaceDocument("document-a", source);

function operation(id: string, area: WorkspaceOperation["area"]): WorkspaceOperation {
  return {
    id, type: id, area, description: id, scope: { kind: "document" }, parameters: {},
    undoable: true, affectsPreview: true, affectsExport: true,
    flow: { eligible: area === "optimize" || area === "enhance", version: 1 },
  };
}

test("one session records operations across the vertical-slice areas", () => {
  let session = createDocumentSession({ id: "session-a", document, initialArea: "pages" });
  session = recordWorkspaceOperation(session, operation("move-page", "pages"));
  session = setWorkspaceArea(session, "enhance");
  session = recordWorkspaceOperation(session, operation("watermark", "enhance"));
  session = setWorkspaceArea(session, "sign");
  session = recordWorkspaceOperation(session, operation("signature", "sign"));
  session = setWorkspaceArea(session, "optimize");
  session = recordWorkspaceOperation(session, operation("compression-balanced", "optimize"));
  assert.equal(session.state.operationCount, 4);
  assert.equal(session.state.lifecycle, "modified");
  assert.equal(session.state.activeArea, "optimize");
  session = undoWorkspaceOperation(session);
  assert.equal(session.state.historyCursor, 3);
  session = redoWorkspaceOperation(session);
  assert.equal(session.state.historyCursor, 4);
});

test("stable page id resolves its new index after reorder", () => {
  const pages = createSourcePages("source-a", 4);
  const signedPageId = pageIdAtIndex(pages, 2);
  assert.ok(signedPageId);
  const reordered = [pages[2]!, pages[0]!, pages[1]!, pages[3]!];
  assert.equal(pageIndexForId(reordered, signedPageId), 0);
});

test("sign adapter keeps a signature attached to the same stable page after reorder", () => {
  const pages = createSourcePages("source-a", 4);
  const signature: PlacedElement = {
    id: "signature-a", type: "signature", pageIndex: 2, xPct: 10, yPct: 20,
    widthPct: 25, heightPct: 8, rotationDeg: 0, signatureId: "saved-a",
    dataUrl: "data:image/png;base64,AA==", aspectRatio: 3,
  };
  const workspace = signElementsToWorkspace([signature], pages);
  assert.equal(workspace[0]?.pageId, "source-a:page:3");
  const reordered = [pages[2]!, pages[0]!, pages[1]!, pages[3]!];
  const restored = signElementsFromWorkspace(workspace, reordered);
  assert.equal(restored[0]?.pageIndex, 0);
});

test("deleted pages do not cause stable sign ownership to drift", () => {
  const pages = createSourcePages("source-a", 4);
  const element: PlacedElement = {
    id: "text-a", type: "text", pageIndex: 2, xPct: 10, yPct: 10,
    widthPct: 20, heightPct: 5, rotationDeg: 0, text: "Approved", fontSizePt: 12,
  };
  const workspace = signElementsToWorkspace([element], pages);
  const withDeletedEarlierPage = pages.map((page, index) => index === 0 ? { ...page, deleted: true } : page);
  const restored = signElementsFromWorkspace(workspace, withDeletedEarlierPage);
  assert.equal(restored[0]?.pageIndex, 1);
});
