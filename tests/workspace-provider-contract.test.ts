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
  const targets = read("lib/pdf/workspace/continuation.ts");
  const edit = read("components/pdf/EditPdfTool.tsx");
  const pages = read("components/pdf/OrganizePdfTool.tsx");
  const sign = read("components/pdf/SignPdfTool.tsx");

  assert.match(continuation, /Continue with this PDF/);
  assert.match(continuation, /Keep working without opening the file again/);
  assert.match(targets, /label: "Edit"/);
  assert.match(targets, /label: "Pages"/);
  assert.match(targets, /label: "Sign"/);

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


test("cross-tool history restores actual revisions and stays browser-memory only", () => {
  const provider = read(
    "components/pdf/workspace/WorkspaceDocumentProvider.tsx",
  );
  const history = read("lib/pdf/workspace/revisionHistory.ts");
  const controls = read(
    "components/pdf/workspace/WorkspaceHistoryControls.tsx",
  );
  const layout = read("app/pdf/layout.tsx");

  assert.match(provider, /appendWorkspaceCheckpoint/);
  assert.match(provider, /undoWorkspaceCheckpoint/);
  assert.match(provider, /redoWorkspaceCheckpoint/);
  assert.match(provider, /currentWorkspaceCheckpoint/);
  assert.match(provider, /setContinuationTargetSafely/);
  assert.match(history, /checkpoints/);
  assert.match(history, /slice\(0, history\.cursor \+ 1\)/);
  assert.match(controls, />\s*Undo\s*</);
  assert.match(controls, />\s*Redo\s*</);
  assert.match(controls, /Recent changes/);
  assert.match(layout, /WorkspaceHistoryControls/);

  for (const source of [provider, history, controls]) {
    assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|OPFS/i);
  }
});


test("Finish uses the current materialized PDF and one primary download", () => {
  const finish = read("components/pdf/workspace/WorkspaceFinish.tsx");
  const page = read("app/pdf/finish/page.tsx");
  const continuation = read("lib/pdf/workspace/continuation.ts");
  const provider = read(
    "components/pdf/workspace/WorkspaceDocumentProvider.tsx",
  );

  assert.match(continuation, /area: "export", label: "Finish", route: "\/pdf\/finish"/);
  assert.match(finish, /fileForCurrentRevision/);
  assert.match(finish, /beginWorkspaceExport/);
  assert.match(finish, /completeWorkspaceExport/);
  assert.match(finish, /Download PDF/);
  assert.match(finish, /Reduce size first/);
  assert.match(finish, /continueCurrent\("optimize"\)/);
  assert.match(provider, /continueCurrent/);
  assert.match(provider, /setWorkspaceArea\(current\.session, target\)/);
  const controls = read(
    "components/pdf/workspace/WorkspaceHistoryControls.tsx",
  );
  assert.match(controls, /router\.push\("\/pdf\/finish"\)/);
  assert.match(controls, />\s*Finish\s*</);
  assert.match(page, /robots:/);
  assert.match(page, /index: false/);
  assert.equal((finish.match(/lumeo-primary-action/g) ?? []).length, 1);
  assert.doesNotMatch(finish, /PDFDocument|copyPages|embedPage|drawText/);
});


test("document health stays contextual, compact, and connected to proven tools", () => {
  const layout = read("app/pdf/layout.tsx");
  const provider = read(
    "components/pdf/workspace/WorkspaceDocumentProvider.tsx",
  );
  const health = read(
    "components/pdf/workspace/WorkspaceDocumentHealth.tsx",
  );
  const edit = read("components/pdf/EditPdfTool.tsx");
  const pages = read("components/pdf/OrganizePdfTool.tsx");
  const compress = read("components/pdf/CompressPdfTool.tsx");

  assert.match(layout, /WorkspaceDocumentHealth/);
  assert.match(provider, /reportDocumentHealth/);
  assert.match(provider, /documentHealthDocumentIdRef/);
  assert.match(provider, /setDocumentHealth\(\{\}\)/);
  assert.match(health, /getDocumentHealthSuggestions/);
  assert.match(health, /globalHistory\.connected/);
  assert.match(health, /\.slice\(0, 2\)/);
  assert.match(health, /Recognize text/);
  assert.match(health, /Fix rotation/);
  assert.match(health, /Reduce size/);
  assert.match(edit, /reportDocumentHealth/);
  assert.match(edit, /SCANNED_IMAGE/);
  assert.match(pages, /rotatedPageCount/);
  assert.match(compress, /imageHeavy/);

  assert.doesNotMatch(
    health,
    /diagnostics dashboard|document analyzer|technical diagnostics/i,
  );
});
