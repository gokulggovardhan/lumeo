import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  formatWorkspaceFileSize,
  workspaceDocumentDescription,
  workspacePageLabel,
} from "../lib/pdf/workspace/documentIdentity.ts";

test("Workspace identity derives accurate size and page labels", () => {
  assert.equal(formatWorkspaceFileSize(0), "0 B");
  assert.equal(formatWorkspaceFileSize(1023), "1023 B");
  assert.equal(formatWorkspaceFileSize(1536), "1.5 KB");
  assert.equal(formatWorkspaceFileSize(2 * 1024 * 1024), "2.0 MB");
  assert.equal(formatWorkspaceFileSize(12 * 1024 * 1024), "12 MB");
  assert.throws(() => formatWorkspaceFileSize(-1), RangeError);
  assert.equal(workspacePageLabel(1), "1 page");
  assert.equal(workspacePageLabel(2), "2 pages");
});

test("Workspace identity announces full filename, pages, live revision and current file size", () => {
  const description = workspaceDocumentDescription({
    fileName: "a-very-long-contract-annexure-file.pdf",
    pageCount: 3,
    number: 7,
    byteLength: 1536,
  });
  for (const expected of [
    "a-very-long-contract-annexure-file.pdf",
    "3 pages",
    "Current revision 7",
    "File size 1.5 KB",
  ]) {
    assert.ok(description.includes(expected));
  }
});

test("identity is shared in PDF layout, follows existing provider and remains accessible on mobile", () => {
  const layout = readFileSync("app/pdf/layout.tsx", "utf8");
  const identity = readFileSync("components/pdf/workspace/WorkspaceDocumentIdentity.tsx", "utf8");
  assert.match(layout, /<WorkspaceDocumentIdentity \/>/);
  assert.match(layout, /<WorkspaceHistoryControls \/>/);
  assert.match(identity, /useWorkspaceDocument\(\)/);
  assert.doesNotMatch(identity, /globalHistory\.connected/);
  assert.match(identity, /if \(!document\) return null/);
  assert.match(identity, /document\.revision/);
  assert.match(identity, /aria-describedby=\{descriptionId\}/);
  assert.match(identity, /data-workspace-document-filename/);
  assert.match(identity, /title=\{revision\.fileName\}/);
  assert.match(identity, /truncate/);
  assert.match(identity, /Full details/);
  assert.match(identity, /data-workspace-revision-number=\{revision\.number\}/);
  assert.doesNotMatch(identity, /localStorage|sessionStorage|indexedDB|randomUUID|fetch\(/);
});
