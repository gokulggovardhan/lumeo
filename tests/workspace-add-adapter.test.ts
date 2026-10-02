import assert from "node:assert/strict";
import test from "node:test";
import {
  createAddWorkspaceSession,
  createStandaloneAddWorkspaceDocument,
} from "../lib/pdf/workspace/addAdapter.ts";
import {
  createDocumentSession,
  recordWorkspaceOperation,
} from "../lib/pdf/workspace/session.ts";

test("Add appends one readable operation after existing Workspace history", () => {
  const document = createStandaloneAddWorkspaceDocument({
    kind: "watermark",
    fileName: "sample.pdf",
    byteLength: 2048,
    pageCount: 2,
  });

  let base = createDocumentSession({
    id: "session-a",
    document,
    initialArea: "edit",
  });
  base = recordWorkspaceOperation(base, {
    id: "edit-1",
    type: "replace-text",
    area: "edit",
    description: "Text edited",
    scope: { kind: "pages", pageIds: [document.pages[0]!.id] },
    parameters: {},
    undoable: true,
    affectsPreview: true,
    affectsExport: true,
    flow: { eligible: false, reason: "content-specific" },
  });

  const next = createAddWorkspaceSession({
    document,
    baseSession: base,
    kind: "page-numbers",
  });

  assert.equal(next.state.activeArea, "enhance");
  assert.equal(next.state.operationCount, 2);
  assert.deepEqual(
    next.history.operations.map((operation) => operation.description),
    ["Text edited", "Page numbers added"],
  );
});

test("standalone Add documents retain stable page provenance", () => {
  const document = createStandaloneAddWorkspaceDocument({
    kind: "header-footer",
    fileName: "report.pdf",
    byteLength: 4096,
    pageCount: 3,
  });

  assert.equal(document.sources.length, 1);
  assert.equal(document.sources[0]?.name, "report.pdf");
  assert.equal(document.pages.length, 3);
  assert.deepEqual(
    document.pages.map((page) => page.provenance.sourcePageNumber),
    [1, 2, 3],
  );
  assert.equal(new Set(document.pages.map((page) => page.id)).size, 3);
});

test("Add operation labels stay concise and user-facing", () => {
  const document = createStandaloneAddWorkspaceDocument({
    kind: "watermark",
    fileName: "sample.pdf",
    byteLength: 1024,
    pageCount: 1,
  });

  for (const [kind, description] of [
    ["watermark", "Watermark added"],
    ["page-numbers", "Page numbers added"],
    ["header-footer", "Header and footer added"],
  ] as const) {
    const session = createAddWorkspaceSession({ document, kind });
    assert.equal(session.history.operations[0]?.description, description);
    assert.equal(session.history.operations[0]?.area, "enhance");
  }
});
