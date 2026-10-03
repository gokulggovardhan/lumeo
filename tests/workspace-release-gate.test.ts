import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(
  ".github/workflows/workspace-release-gate.yml",
  "utf8",
);
const mainWorkflow = readFileSync(
  ".github/workflows/lumeo-ci.yml",
  "utf8",
);

test("Workspace release gate covers the five final jobs", () => {
  for (const job of [
    "Core Workspace fidelity and build",
    "Workspace mobile and Edit browsers",
    "Conversion corpus on Chromium, WebKit and Firefox",
    "Edit PDF 120 and 320 page performance",
    "Workspace release gate",
  ]) {
    assert.ok(workflow.includes(job), `Missing release-gate job: ${job}`);
  }
});

test("Workspace release gate executes real mobile and Edit browser coverage", () => {
  assert.match(workflow, /workspace-mobile\.spec\.ts/);
  assert.match(workflow, /--project=chromium/);
  assert.match(workflow, /--project=webkit/);
  assert.match(workflow, /--project=firefox/);
  assert.match(workflow, /playwright\.vinext\.config\.ts/);
  assert.match(workflow, /wrangler dev/);
});

test("Workspace release gate executes conversion and large-document performance coverage", () => {
  assert.match(workflow, /playwright\.browser-conversion\.config\.ts/);
  assert.match(workflow, /libreoffice-writer poppler-utils python3-pil/);
  assert.match(workflow, /playwright\.edit-performance\.config\.ts/);
  assert.match(workflow, /NEXT_PUBLIC_EDIT_PERFORMANCE_DIAGNOSTICS/);
  assert.match(workflow, /120 and 320 page Edit PDF sessions/);
});

test("Workspace release gate includes fidelity, static quality and Worker validation", () => {
  assert.match(workflow, /npm run report:edit-fidelity/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /npx tsc --noEmit/);
  assert.match(workflow, /npm run lint/);
  assert.match(workflow, /npm run build/);
  assert.match(workflow, /npm run build:vinext/);
  assert.match(workflow, /verify-cloudflare-worker-config/);
  assert.match(workflow, /vinext-cloudflare deploy --dry-run/);
  assert.match(workflow, /npm run verify:public/);
  assert.match(workflow, /npm run verify:supabase/);
  assert.match(workflow, /trap 'rm -f \.env\.local' EXIT/);
});


test("required main validation cannot bypass the comprehensive Workspace release gate", () => {
  assert.match(workflow, /workflow_call:/);
  assert.match(
    mainWorkflow,
    /workspace-release-gate:\s*[\s\S]*?uses:\s*\.\/\.github\/workflows\/workspace-release-gate\.yml/,
  );
  assert.match(
    mainWorkflow,
    /validate:\s*[\s\S]*?name:\s*Validate Lumeo PDF Workspace[\s\S]*?needs:\s*workspace-release-gate[\s\S]*?if:\s*\$\{\{ always\(\) \}\}/,
  );
  assert.match(
    mainWorkflow,
    /needs\.workspace-release-gate\.result != 'success'[\s\S]*?exit 1/,
  );
});
