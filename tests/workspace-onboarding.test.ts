import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("Step 9 journey declares the three accessible stages without creating a second document store", () => {
  const journey = read("components/pdf/workspace/WorkspaceJourney.tsx");
  assert.match(journey, /id: "upload", label: "Upload"/);
  assert.match(journey, /id: "work", label: "Work"/);
  assert.match(journey, /id: "finish", label: "Finish"/);
  assert.match(journey, /aria-label="PDF Workspace flow"/);
  assert.match(journey, /aria-current=\{current \? "step" : undefined\}/);
  assert.match(journey, /data-workspace-onboarding-stage=\{stage\}/);
  assert.doesNotMatch(journey, /localStorage|sessionStorage|indexedDB|fetch\(|sendBeacon\(|createWorkspaceRuntime/);
});

test("Workspace onboarding reflects upload readiness and Finish without adding another export", () => {
  const start = read("components/pdf/workspace/WorkspaceStart.tsx");
  const finish = read("components/pdf/workspace/WorkspaceFinish.tsx");
  const intro = read("components/pdf/workspace/WorkspaceIntro.tsx");
  const route = read("app/pdf/page.tsx");

  assert.match(start, /<WorkspaceJourney stage=\{ready \? "work" : "upload"\} \/>/);
  assert.match(finish, /<WorkspaceJourney stage="finish" \/>/);
  assert.match(start, /data-workspace-start-ready="true"/);
  assert.match(start, /Browse all PDF tools/);
  assert.match(start, /ToolPrivacyNote/);
  assert.match(route, /<WorkspaceStart intro=\{<WorkspaceIntro \/>\} \/>/);
  assert.match(intro, /PDF Workspace/);
  assert.match(finish, /fileForCurrentRevision/);
  assert.equal((finish.match(/variant="primary"/g) ?? []).length, 1);
});
