import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(
  ".github/workflows/workspace-production-certification.yml",
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
  const pushBlock = workflow.match(/\n  push:\n([\s\S]*?)\n  workflow_dispatch:/)?.[1] ?? "";
  assert.match(pushBlock, /branches:\s*\n\s*- main/);
  assert.doesNotMatch(pushBlock, /paths:/);
});
