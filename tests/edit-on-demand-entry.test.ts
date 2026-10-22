import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const entry = readFileSync("components/pdf/edit/DeferredEditPdfTool.tsx", "utf8");
const editor = readFileSync("components/pdf/EditPdfTool.tsx", "utf8");

test("Edit PDF first visit renders an actual file chooser without importing the heavy editor", () => {
  assert.match(entry, /<L2UploadStage[\s\S]*?inputId="edit-pdf-upload"/);
  assert.match(entry, /onFilesSelected=\{\(files\) => \{/);
  assert.match(entry, /const file = files\.item\(0\)/);
  assert.match(entry, /if \(file\) setInitialFile\(file\)/);
  assert.match(entry, /ssr: false/);
  assert.match(entry, /if \(initialFile \|\| editorRequested\)/);
});

test("consuming a Workspace continuation cannot close the deferred editor", () => {
  assert.match(entry, /useState\(continuationTarget === "edit"\)/);
  assert.match(entry, /if \(continuationTarget === "edit" && !editorRequested\) \{\s*setEditorRequested\(true\)/);
  assert.doesNotMatch(entry, /setEditorRequested\(false\)/);
  assert.doesNotMatch(entry, /if \(initialFile \|\| continuationTarget === "edit"\)/);
});

test("Selected PDF is handed to the existing editor once in browser memory", () => {
  assert.match(editor, /initialFile\?: File \| null/);
  assert.match(editor, /initialFileConsumedRef\.current === initialFile/);
  assert.match(editor, /void addFile\(\[initialFile\]\)/);
  assert.match(editor, /const payload = takeContinuation\("edit"\)/);
  assert.match(editor, /void addFile\([\s\S]*\[payload\.file\]/);
  assert.doesNotMatch(entry, /localStorage|sessionStorage|indexedDB|fetch\("/);
});

test("Lightweight entry keeps upload readiness and exactly one tool-open tracker", () => {
  assert.match(entry, /data-edit-client-ready/);
  assert.match(entry, /eventName: "tool_opened", toolSlug: "edit"/);
  assert.doesNotMatch(editor, /eventName: "tool_opened", toolSlug: "edit"/);
  assert.match(entry, /<L2PrivacyNote \/>/);
});
