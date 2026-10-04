import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(
  ".github/workflows/workspace-production-certification.yml",
  "utf8",
);
const productionSmoke = readFileSync(
  "e2e/production-conversion-smoke.spec.ts",
  "utf8",
);

test("production certification pins the exact deployed revision", () => {
  assert.match(workflow, /github\.event\.pull_request\.base\.sha/);
  assert.match(workflow, /github\.sha/);
  assert.match(workflow, /\/api\/build-info/);
  assert.match(workflow, /deployed_environment/);
  assert.match(workflow, /production revision/);
});

test("production certification covers connected Workspace routes and Admin boundary", () => {
  for (const route of [
    "/pdf",
    "/pdf/edit",
    "/pdf/organize",
    "/pdf/sign",
    "/pdf/add",
    "/pdf/compress",
    "/pdf/finish",
  ]) {
    assert.ok(
      workflow.includes(`"${route}"`),
      `missing production route ${route}`,
    );
  }

  assert.match(workflow, /\/admin\/login/);
  assert.match(workflow, /private\*no-store|no-store\*private/);
});

test("production certification runs the maintained multi-browser live conversion suite", () => {
  assert.match(
    workflow,
    /playwright\.production-conversion\.config\.ts/,
  );
  assert.match(workflow, /chromium webkit firefox/);
  assert.match(workflow, /workspace-production-certification-report/);
});


test("every protected-main push receives exact production certification", () => {
  const pushBlock = workflow.match(/\r?\n  push:\r?\n([\s\S]*?)\r?\n  workflow_dispatch:/)?.[1] ?? "";
  assert.match(pushBlock, /branches:\s*\r?\n\s*- main/);
  assert.doesNotMatch(pushBlock, /paths:/);
});


test("production certification includes a live connected Workspace mutation and final export", () => {
  assert.match(productionSmoke, /production connected Workspace preserves a real Pages change through Edit and Finish/);
  assert.match(productionSmoke, /gotoProductionRoute\(page, "\/pdf"\)/);
  assert.match(productionSmoke, /heading", \{ name: "PDF Workspace", exact: true \}/);
  assert.match(productionSmoke, /button", \{ name: \/\^Pages\//);
  assert.match(productionSmoke, /Rotate right/);
  assert.match(productionSmoke, /Organized PDF ready/);
  assert.match(productionSmoke, /clickPersistentWorkspaceNav\(page, "Edit"\)/);
  assert.match(productionSmoke, /clickPersistentWorkspaceNav\(page, "Finish"\)/);
  assert.match(productionSmoke, /\/pdf\/edit/);
  assert.match(productionSmoke, /heading", \{ name: "Finish", exact: true \}/);
  assert.match(productionSmoke, /Download PDF/);
  assert.match(productionSmoke, /getRotation\(\)\.angle/);
});
