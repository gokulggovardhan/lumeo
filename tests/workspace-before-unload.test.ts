import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  beginWorkspaceExport,
  completeWorkspaceExport,
  createDocumentSession,
  failWorkspaceExport,
  recordWorkspaceOperation,
} from "../lib/pdf/workspace/session.ts";

test("native unload protection follows existing Workspace state, not standalone tools or new storage", () => {
  const layout = readFileSync("app/pdf/layout.tsx", "utf8");
  const guard = readFileSync("components/pdf/workspace/WorkspaceBeforeUnloadProtection.tsx", "utf8");
  assert.match(layout, /<WorkspaceDocumentProvider>/);
  assert.match(layout, /<WorkspaceBeforeUnloadProtection \/>/);
  assert.match(guard, /useWorkspaceDocument\(\)/);
  assert.match(guard, /document\?\.session\.state\.hasUnsavedChanges \?\? false/);
  assert.match(guard, /if \(!hasUnsavedChanges\) return;/);
  assert.match(guard, /window\.addEventListener\("beforeunload", onBeforeUnload\)/);
  assert.match(guard, /event\.preventDefault\(\)/);
  assert.match(guard, /event\.returnValue = ""/);
  assert.match(guard, /window\.removeEventListener\("beforeunload", onBeforeUnload\)/);
  assert.match(guard, /\[hasUnsavedChanges\]/);
  assert.doesNotMatch(guard, /localStorage|sessionStorage|indexedDB|fetch\(|confirm\(|alert\(|prompt\(/);
});

test("Workspace exports clear unsaved state only on successful completion", () => {
  const source = readFileSync("lib/pdf/workspace/session.ts", "utf8");
  assert.match(source, /hasUnsavedChanges: false/);
  assert.match(source, /hasUnsavedChanges: history\.cursor > 0/);
  assert.match(source, /lifecycle === "exported" \? false : session\.state\.hasUnsavedChanges/);
  assert.match(source, /export function completeWorkspaceExport/);
  assert.match(source, /export function failWorkspaceExport/);
});
