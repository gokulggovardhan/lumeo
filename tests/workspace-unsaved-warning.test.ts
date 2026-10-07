import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Step 8 binds native beforeunload only while Workspace changes are unsaved", () => {
  const source = readFileSync(
    "components/pdf/workspace/WorkspaceDocumentProvider.tsx",
    "utf8",
  );

  assert.match(source, /document\?\.session\.state\.hasUnsavedChanges/);
  assert.match(source, /window\.addEventListener\("beforeunload", warnBeforeUnload\)/);
  assert.match(source, /event\.preventDefault\(\)/);
  assert.match(source, /event\.returnValue = ""/);
  assert.match(source, /window\.removeEventListener\("beforeunload", warnBeforeUnload\)/);
  assert.doesNotMatch(source, /confirm\(|localStorage|sessionStorage/i);
});
