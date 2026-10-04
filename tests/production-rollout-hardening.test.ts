import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path: string) {
  return readFileSync(path, "utf8");
}

test("analytics rollout remains compatible until terminal diagnostics migration is live", () => {
  const client = read("lib/analytics/client.ts");
  const route = read("app/api/analytics/route.ts");
  const workflow = read(".github/workflows/production-conversion-smoke.yml");

  assert.match(client, /failureStage: input\.failureStage/);
  assert.match(route, /p_failure_stage: input\.failureStage/);
  assert.match(workflow, /Wait for production analytics schema/);
  assert.match(workflow, /record_public_analytics_event/);
  assert.match(workflow, /failure_stage text/);
  assert.match(workflow, /pg_notify\('pgrst', 'reload schema'\)/);
});

test("Word to PDF waits until cross-origin isolation recovery settles", () => {
  const tool = read("components/pdf/WordToPdfTool.tsx");
  const certification = read("e2e/production-conversion-certification.spec.ts");

  assert.match(tool, /data-word-to-pdf-client-ready/);
  assert.match(tool, /const reloadingForIsolation = ensureWordToPdfCrossOriginIsolation\(\)/);
  assert.match(certification, /waitForWordToPdfClientReady/);
});

test("public navigation avoids speculative Worker route rendering on the Free plan", () => {
  const nav = read("components/public/PublicNavLink.tsx");
  const chrome = read("components/PublicPdfChrome.tsx");
  const menu = read("components/public/PublicPdfToolsMenuClient.tsx");

  assert.match(nav, /prefetch=\{props\.prefetch \?\? false\}/);
  assert.match(chrome, /href="\/"[\s\S]*prefetch=\{false\}/);
  assert.match(menu, /prefetch=\{false\}/);
});

test("production browser certification retries only bounded transient edge 5xx responses", () => {
  const smoke = read("e2e/production-conversion-smoke.spec.ts");
  const certification = read("e2e/production-conversion-certification.spec.ts");

  for (const source of [smoke, certification]) {
    assert.match(source, /async function gotoProductionRoute/);
    assert.match(source, /\[502, 503, 504\]\.includes\(lastStatus\)/);
    assert.match(source, /attempt <= 3/);
  }
});
