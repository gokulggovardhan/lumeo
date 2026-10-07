import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Step 7 exposes existing Workspace document identity without new persistence", () => {
  const source = readFileSync(
    "components/pdf/workspace/WorkspaceHistoryControls.tsx",
    "utf8",
  );

  assert.match(source, /data-workspace-document-status="true"/);
  assert.match(source, /document\.revision\.fileName/);
  assert.match(source, /document\.revision\.pageCount/);
  assert.match(source, /document\.revision\.number/);
  assert.match(source, /document\.revision\.byteLength/);
  assert.match(source, /Open document:/);
  assert.match(source, /truncate/);
  assert.match(source, /Workspace changes/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB/i);
});
