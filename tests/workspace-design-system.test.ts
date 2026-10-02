import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

test("shared Workspace actions use Aura primitives instead of bespoke button systems", () => {
  const continuation = read(
    "components/pdf/workspace/ContinueWithPdf.tsx",
  );
  const history = read(
    "components/pdf/workspace/WorkspaceHistoryControls.tsx",
  );
  const health = read(
    "components/pdf/workspace/WorkspaceDocumentHealth.tsx",
  );
  const finish = read(
    "components/pdf/workspace/WorkspaceFinish.tsx",
  );

  for (const source of [continuation, history, health, finish]) {
    assert.match(source, /AuraButton/);
  }

  assert.match(finish, /AuraInput/);
  assert.match(finish, /AuraStatus/);
  assert.doesNotMatch(
    continuation,
    /<button[\s\S]{0,240}Continue with this PDF/i,
  );
});

test("mobile Workspace chrome uses semantic design tokens and practical touch targets", () => {
  const mobile = read(
    "components/pdf/workspace/WorkspaceMobileNav.tsx",
  );

  assert.match(mobile, /bg-\[var\(--surface-overlay\)\]/);
  assert.match(mobile, /shadow-\[var\(--v2-elevation-4\)\]/);
  assert.match(mobile, /bg-\[var\(--surface-success\)\]/);
  assert.match(mobile, /text-\[var\(--text-success\)\]/);
  assert.match(mobile, /min-h-12/);

  assert.doesNotMatch(mobile, /rgba\(18,20,17/);
  assert.doesNotMatch(mobile, /0_-14px_34px_rgba/);
  assert.doesNotMatch(mobile, /rgba\(var\(--emerald-rgb\)/);
});

test("Workspace design-system guidance documents the shared chrome rule", () => {
  const guide = read("docs/LUMEO_AURA_DESIGN_SYSTEM.md");

  assert.match(guide, /Workspace continuation chrome/i);
  assert.match(guide, /AuraButton/);
  assert.match(guide, /semantic tokens/i);
});
