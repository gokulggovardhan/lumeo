import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("accessibility audit covers desktop, mobile Workspace and Finish", () => {
  const source = readFileSync("scripts/run-accessibility-audit.mjs", "utf8");
  assert.match(source, /wcag2a/);
  assert.match(source, /wcag2aa/);
  assert.match(source, /wcag21a/);
  assert.match(source, /wcag21aa/);
  assert.match(source, /desktop \/pdf-tools/);
  assert.match(source, /mobile connected Workspace Edit/);
  assert.match(source, /mobile Workspace Finish/);
  assert.match(source, /keyboard focus did not enter the page/);
});

test("accessibility workflow uses pinned axe runtime and Chromium", () => {
  const workflow = readFileSync(".github/workflows/accessibility.yml", "utf8");
  assert.match(workflow, /axe-core@4\.10\.3/);
  assert.match(workflow, /playwright install --with-deps chromium/);
  assert.match(workflow, /run-accessibility-audit\.mjs/);
});
