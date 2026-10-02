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
  assert.match(provider, /stageContinuation/);
  assert.match(provider, /takeContinuation/);
  assert.match(provider, /mergeWorkspaceSessions/);

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

test("continuation UI stays user-facing and secondary to existing tool downloads", () => {
  const continuation = read(
    "components/pdf/workspace/ContinueWithPdf.tsx",
  );
  const edit = read("components/pdf/EditPdfTool.tsx");
  const pages = read("components/pdf/OrganizePdfTool.tsx");
  const sign = read("components/pdf/SignPdfTool.tsx");

  assert.match(continuation, /Continue with this PDF/);
  assert.match(continuation, /Keep working without opening the file again/);
  assert.match(continuation, /Edit/);
  assert.match(continuation, /Pages/);
  assert.match(continuation, /Sign/);

  for (const source of [continuation, edit, pages, sign]) {
    for (const phrase of [
      "document authority",
      "byte ownership",
      "mutation engine",
      "local session",
    ]) {
      assert.doesNotMatch(source, new RegExp(phrase, "i"));
    }
  }

  assert.match(edit, /Download edited PDF/);
  assert.match(sign, /Download signed PDF/);
  assert.match(pages, />\s*Download\s*</);
});


test("continuation centralizes compatibility and guards transfer continuity", () => {
  const continuation = read(
    "components/pdf/workspace/ContinueWithPdf.tsx",
  );
  const targets = read("lib/pdf/workspace/continuation.ts");
  const provider = read(
    "components/pdf/workspace/WorkspaceDocumentProvider.tsx",
  );

  assert.match(continuation, /continuationTargetsFor/);
  assert.match(continuation, /incompatibleTargets/);
  assert.match(continuation, /disabledTargets/);
  assert.match(continuation, /aria-describedby/);
  assert.match(targets, /WORKSPACE_CONTINUATION_TARGETS/);
  assert.match(provider, /assertContinuationTransfer/);
  assert.match(provider, /next\.revision\.number !== expectedRevision/);
  assert.match(provider, /next\.revision\.fileName !== input\.fileName/);
  assert.match(provider, /next\.revision\.pageCount !== input\.pageCount/);
  assert.match(provider, /next\.session\.state\.document\.id !== input\.session\.state\.document\.id/);
});
