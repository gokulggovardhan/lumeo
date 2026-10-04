import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Workspace onboarding presents Upload, Work, Finish without removing the standalone escape", () => {
  const source = readFileSync(
    "components/pdf/workspace/WorkspaceStart.tsx",
    "utf8",
  );

  assert.match(source, /data-workspace-onboarding/);
  assert.match(source, /label: "Upload"/);
  assert.match(source, /label: "Work"/);
  assert.match(source, /label: "Finish"/);
  assert.match(source, /Browse all PDF tools/);
  assert.match(source, /ToolPrivacyNote/);
  assert.match(source, /grid-cols-3/);
});
