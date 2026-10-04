import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Workspace history bar keeps document identity visible", () => {
  const source = readFileSync(
    "components/pdf/workspace/WorkspaceHistoryControls.tsx",
    "utf8",
  );

  assert.match(source, /data-workspace-document-status/);
  assert.match(source, /document\.revision\.fileName/);
  assert.match(source, /document\.revision\.pageCount/);
  assert.match(source, /document\.revision\.number/);
  assert.match(source, /document\.revision\.byteLength/);
  assert.match(source, /truncate/);
  assert.match(source, /aria-label=/);
});
