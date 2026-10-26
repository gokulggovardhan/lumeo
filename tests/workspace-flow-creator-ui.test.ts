import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string): string {
  return readFileSync(new URL("../" + path, import.meta.url), "utf8");
}

test("Finish integrates a creator review UI only after the existing local Workspace document", () => {
  const finish = source("components/pdf/workspace/WorkspaceFinish.tsx");
  assert.match(finish, /import \{ WorkspaceFlowCreator \} from "\.\/WorkspaceFlowCreator"/);
  assert.match(finish, /<WorkspaceFlowCreator[\s\S]*session=\{currentDocument\.session\}/);
  assert.match(finish, /key=\{\`\$\{currentDocument\.id\}/);
});

test("Creator UX is explicit-review, consent-gated and data-only", () => {
  const ui = source("components/pdf/workspace/WorkspaceFlowCreator.tsx");
  assert.match(ui, /prepareFlowCreatorDraft\(session\)/);
  assert.match(ui, /confirmFlowCreatorHandoff\(draft, true\)/);
  assert.match(ui, /disabled=\{!confirmed\}/);
  assert.match(ui, /latest\.templateJson !== draft\.templateJson/);
  assert.match(ui, /link\.download = "lumeo-flow-v1\.json"/);
  assert.match(ui, /window\.setTimeout\(\(\) => URL\.revokeObjectURL\(url\), 60_000\)/);
  assert.doesNotMatch(ui, /\bfetch\(|\blocalStorage\b|\bsessionStorage\b|\bsendBeacon\b/);
  assert.doesNotMatch(ui, /runtime\.revision\.bytes|\blink\.download = .*fileName/);
});
