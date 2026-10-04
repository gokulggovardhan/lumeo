import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("browser exit warning is scoped to meaningful unsaved Workspace changes", () => {
  const source = readFileSync(
    "components/pdf/workspace/WorkspaceDocumentProvider.tsx",
    "utf8",
  );

  assert.match(
    source,
    /if \(!document\?\.session\.state\.hasUnsavedChanges\) return;/,
  );
  assert.match(source, /addEventListener\("beforeunload"/);
  assert.match(source, /removeEventListener\("beforeunload"/);
  assert.match(source, /event\.preventDefault\(\)/);
  assert.match(source, /event\.returnValue = ""/);
});

test("exported Workspace sessions are already marked clean by the session model", () => {
  const source = readFileSync("lib/pdf/workspace/session.ts", "utf8");
  assert.match(
    source,
    /hasUnsavedChanges:\s*lifecycle === "exported" \? false/,
  );
});
