import assert from "node:assert/strict";
import test from "node:test";
import {
  createCompressWorkspaceSession,
  createStandaloneCompressWorkspaceDocument,
} from "../lib/pdf/workspace/compressAdapter.ts";
import {
  createDocumentSession,
  recordWorkspaceOperation,
} from "../lib/pdf/workspace/session.ts";

test("Compress appends a concise operation after prior Workspace changes", () => {
  const document = createStandaloneCompressWorkspaceDocument({
    fileName: "report.pdf",
    byteLength: 10_000,
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

  const next = createCompressWorkspaceSession({
    document,
    baseSession: base,
    details: {
      mode: "quality",
      profile: "balanced",
      originalBytes: 10_000,
      outputBytes: 6_000,
    },
  });

  assert.equal(next.state.activeArea, "optimize");
  assert.equal(next.state.operationCount, 2);
  assert.deepEqual(
    next.history.operations.map((operation) => operation.description),
    ["Text edited", "PDF compressed"],
  );
  assert.equal(next.history.operations[1]?.flow.eligible, true);
});

test("standalone Compress establishes stable page provenance", () => {
  const document = createStandaloneCompressWorkspaceDocument({
    fileName: "source.pdf",
    byteLength: 20_000,
    pageCount: 3,
  });

  assert.equal(document.sources[0]?.name, "source.pdf");
  assert.equal(document.pages.length, 3);
  assert.deepEqual(
    document.pages.map((page) => page.provenance.sourcePageNumber),
    [1, 2, 3],
  );
  assert.equal(new Set(document.pages.map((page) => page.id)).size, 3);
});
