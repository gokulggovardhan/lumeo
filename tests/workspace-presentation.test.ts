import assert from "node:assert/strict";
import test from "node:test";
import type { WorkspaceOperation } from "../lib/pdf/workspace/model.ts";
import {
  WORKSPACE_AREA_PRESENTATION,
  visibleWorkspaceHistory,
  workspaceAreaDescription,
  workspaceAreaLabel,
} from "../lib/pdf/workspace/presentation.ts";

function op(id: string, description: string): WorkspaceOperation {
  return {
    id,
    type: id,
    area: "edit",
    description,
    scope: { kind: "document" },
    parameters: {},
    undoable: true,
    affectsPreview: true,
    affectsExport: true,
    flow: { eligible: false, reason: "content-specific" },
  };
}

test("workspace areas use short, understandable product language", () => {
  assert.deepEqual(
    Object.values(WORKSPACE_AREA_PRESENTATION).map((item) => item.label),
    ["Edit", "Pages", "Sign", "Add", "Compress", "Finish"],
  );
  assert.equal(workspaceAreaLabel("enhance"), "Add");
  assert.equal(workspaceAreaDescription("optimize"), "Reduce file size");
  assert.equal(workspaceAreaDescription("export"), "Review & export");
});

test("visible history respects the active cursor and newest-first presentation", () => {
  const operations = [
    op("a", "Edit text"),
    op("b", "Rotate page"),
    op("c", "Add signature"),
    op("d", "Compress"),
  ];

  assert.deepEqual(
    visibleWorkspaceHistory(operations, 3, 2).map((operation) => operation.id),
    ["c", "b"],
  );
  assert.deepEqual(visibleWorkspaceHistory(operations, 0, 4), []);
  assert.deepEqual(visibleWorkspaceHistory(operations, 4, 0), []);
});
