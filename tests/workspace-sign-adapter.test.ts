import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  appendPdfSemanticHistory,
  createPdfSemanticHistory,
  type PdfSemanticHistoryDraft,
} from "../lib/pdf/history/semanticHistory.ts";
import { createWorkspaceDocument } from "../lib/pdf/workspace/model.ts";
import {
  createSignWorkspaceSession,
  projectSignExportState,
  projectSignHistoryToWorkspace,
} from "../lib/pdf/workspace/signAdapter.ts";

const document = createWorkspaceDocument("document-a", {
  id: "source-a",
  name: "private.pdf",
  byteLength: 2048,
  pageCount: 2,
});

function insertion(
  pageIndex: number,
  elementId: string,
  text = "Private approval",
): PdfSemanticHistoryDraft {
  return {
    tool: "sign",
    type: "insert",
    target: {
      kind: "element",
      pageIndex,
      elementId,
      elementType: "signature",
    },
    before: null,
    after: {
      present: true,
      text,
      geometry: {
        pageIndex,
        xPct: 10,
        yPct: 20,
        widthPct: 30,
        heightPct: 10,
      },
    },
  };
}

test("Sign history projects stable page identity without private content", () => {
  const history = appendPdfSemanticHistory(createPdfSemanticHistory(), [
    insertion(1, "signature-1", "SECRET-TEXT"),
  ]);
  const projection = projectSignHistoryToWorkspace(history, document.pages);

  assert.equal(projection.compatible, true);
  if (!projection.compatible) return;
  assert.equal(projection.operations.length, 1);
  assert.deepEqual(projection.operations[0]?.scope, {
    kind: "pages",
    pageIds: ["source-a:page:2"],
  });
  assert.equal(projection.operations[0]?.area, "sign");
  assert.deepEqual(projection.operations[0]?.flow, {
    eligible: false,
    reason: "page-specific",
  });
  const serialized = JSON.stringify(projection.operations);
  assert.equal(serialized.includes("SECRET-TEXT"), false);
  assert.equal(serialized.includes("data:image"), false);
});

test("one unresolved Sign page fails the projection atomically", () => {
  const history = appendPdfSemanticHistory(createPdfSemanticHistory(), [
    insertion(0, "signature-1"),
    insertion(8, "signature-2"),
  ]);
  const projection = projectSignHistoryToWorkspace(history, document.pages);

  assert.equal(projection.compatible, false);
  if (projection.compatible) return;
  assert.equal(projection.reason, "missing-page");
  assert.deepEqual(projection.operations, []);
});

test("Sign export lifecycle stays outside semantic undo history", () => {
  const history = appendPdfSemanticHistory(createPdfSemanticHistory(), [
    insertion(0, "signature-1"),
  ]);
  const projection = createSignWorkspaceSession({
    history,
    sessionId: "sign-session-a",
    document,
  });

  assert.equal(projection.compatible, true);
  if (!projection.compatible) return;
  const exporting = projectSignExportState(projection.session, "exporting");
  const exported = projectSignExportState(projection.session, "exported");
  const failed = projectSignExportState(projection.session, "error");

  assert.equal(exporting.state.lifecycle, "exporting");
  assert.equal(exported.state.lifecycle, "exported");
  assert.equal(exported.state.hasUnsavedChanges, false);
  assert.equal(failed.state.lifecycle, "error");
  assert.equal(failed.state.hasUnsavedChanges, true);
  assert.equal(exported.state.operationCount, 1);
  assert.equal(exported.history.operations.length, 1);
});

test("Sign runtime exposes Workspace state and rejects stale exports", async () => {
  const source = await readFile(
    new URL("../components/pdf/SignPdfTool.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /createSignWorkspaceSession\(\{/);
  assert.match(source, /data-workspace-projection-compatible=/);
  assert.match(source, /data-workspace-operation-count=/);
  assert.match(source, /data-workspace-lifecycle=/);
  assert.match(source, /exportRevision !== exportRevisionRef\.current/);
  assert.match(source, /exportSnapshot !== getCurrentSignHistoryState\(\)/);
  assert.match(source, /onClick=\{undo\}/);
  assert.match(source, /onClick=\{redo\}/);
});
