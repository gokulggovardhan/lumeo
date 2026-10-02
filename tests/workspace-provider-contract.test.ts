import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

test("PDF routes share one in-memory workspace provider", () => {
  const layout = read("app/pdf/layout.tsx");
  const provider = read(
    "components/pdf/workspace/WorkspaceDocumentProvider.tsx",
  );

  assert.match(layout, /WorkspaceDocumentProvider/);
  assert.match(provider, /createWorkspaceRuntime/);
  assert.match(provider, /publishWorkspaceRevision/);
  assert.match(provider, /fileForCurrentRevision/);

  // The initial shared-document foundation intentionally survives client-side
  // route changes only. It must not silently persist document bytes.
  assert.doesNotMatch(provider, /localStorage|sessionStorage|indexedDB|OPFS/i);
  assert.doesNotMatch(provider, /fetch\(|XMLHttpRequest|navigator\.sendBeacon/i);
});

test("shared document architecture stays internal rather than becoming user copy", () => {
  const provider = read(
    "components/pdf/workspace/WorkspaceDocumentProvider.tsx",
  );
  const layout = read("app/pdf/layout.tsx");

  for (const phrase of [
    "document authority",
    "byte ownership",
    "mutation engine",
    "local session",
  ]) {
    assert.doesNotMatch(`${provider}\n${layout}`, new RegExp(`>[^
<]*${phrase}`, "i"));
  }
});
