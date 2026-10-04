import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path: string) {
  return readFileSync(path, "utf8");
}

test("trusted analytics cutover keeps public processing independent and production tests synthetic", () => {
  const client = read("lib/analytics/client.ts");
  const route = read("app/api/analytics/route.ts");
  const cloudflareConfig = read("playwright.cloudflare-production.config.ts");
  const productionConfig = read("playwright.production-conversion.config.ts");
  const migration = read("supabase/migrations/20261004090000_trusted_analytics_cutover.sql");

  assert.match(client, /fetch\("\/api\/analytics"/);
  assert.match(client, /failureStage: input\.failureStage/);
  assert.match(route, /x-lumeo-analytics-traffic/);
  assert.match(route, /synthetic/);
  assert.match(cloudflareConfig, /x-lumeo-analytics-traffic/);
  assert.match(productionConfig, /x-lumeo-analytics-traffic/);
  assert.match(migration, /record_trusted_analytics_event/);
  assert.match(migration, /get_admin_verified_analytics/);
  assert.doesNotMatch(client, /await\s+track/);
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
