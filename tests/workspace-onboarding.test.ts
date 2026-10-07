import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Step 9 explains the hybrid Workspace flow without hiding standalone tools", () => {
  const source = readFileSync(
    "components/pdf/workspace/WorkspaceStart.tsx",
    "utf8",
  );

  assert.match(source, /data-workspace-onboarding="true"/);
  assert.match(source, /aria-label="PDF Workspace flow"/);
  assert.match(source, /\["1", "Upload", "One PDF"\]/);
  assert.match(source, /\["2", "Work", "Switch tools"\]/);
  assert.match(source, /\["3", "Finish", "Download once"\]/);
  assert.match(source, /Browse all PDF tools/);
  assert.match(source, /ToolPrivacyNote/);
  assert.match(source, /Only need one quick task\?/);
});
