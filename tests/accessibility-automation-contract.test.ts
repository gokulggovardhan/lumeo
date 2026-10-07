import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Step 6 accessibility audit covers desktop Chromium and mobile WebKit", () => {
  const source = readFileSync("scripts/run-accessibility-audit.mjs", "utf8");

  for (const tag of ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]) {
    assert.match(source, new RegExp(tag));
  }

  for (const route of ["/", "/pdf", "/pdf-tools", "/pdf/edit"]) {
    assert.ok(source.includes(`"${route}"`));
  }

  assert.match(source, /chromium\.launch/);
  assert.match(source, /webkit\.launch/);
  assert.match(source, /mobile WebKit connected Workspace Edit/);
  assert.match(source, /mobile WebKit Workspace Finish/);
  assert.match(source, /keyboard focus did not enter the page/);
  assert.doesNotMatch(source, /networkidle/);
});

test("Step 6 keeps the two verified contrast fixes narrow", () => {
  const home = readFileSync("app/page.tsx", "utf8");
  const command = readFileSync("components/CommandPaletteTrigger.tsx", "utf8");

  assert.match(home, /bg-\[var\(--action-primary-active\)\]/);
  assert.match(home, /hover:bg-\[var\(--atelier-sage-700\)\]/);
  assert.match(home, />\s*Start PDF Workspace\s*<\/Link>/);
  assert.match(
    command,
    /<kbd className="text-\[var\(--text-secondary\)\]">Ctrl K<\/kbd>/,
  );
});

test("Step 6 workflow pins axe and installs Chromium plus WebKit", () => {
  const workflow = readFileSync(".github/workflows/accessibility.yml", "utf8");

  assert.match(workflow, /axe-core@4\.10\.3/);
  assert.match(workflow, /playwright install --with-deps chromium webkit/);
  assert.match(workflow, /npm run verify:accessibility/);
});
