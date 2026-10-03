import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

test("validated first uploads bind directly to the shared Workspace", () => {
  const binder = read(
    "components/pdf/workspace/WorkspaceDocumentBinding.tsx",
  );
  const provider = read(
    "components/pdf/workspace/WorkspaceDocumentProvider.tsx",
  );

  assert.match(binder, /adoptDocument/);
  assert.match(provider, /const adoptDocument = useCallback/);
  assert.match(provider, /createWorkspaceRuntimeFromSession/);

  for (const path of [
    "components/pdf/EditPdfTool.tsx",
    "components/pdf/OrganizePdfTool.tsx",
    "components/pdf/WatermarkTool.tsx",
    "components/pdf/PageNumbersTool.tsx",
    "components/pdf/HeaderFooterTool.tsx",
    "components/pdf/SignPdfTool.tsx",
    "components/pdf/CompressPdfTool.tsx",
  ]) {
    assert.match(read(path), /WorkspaceDocumentBinding/);
  }
});

test("successful tool results auto-materialize before cross-tool navigation", () => {
  const continuation = read(
    "components/pdf/workspace/ContinueWithPdf.tsx",
  );
  const provider = read(
    "components/pdf/workspace/WorkspaceDocumentProvider.tsx",
  );

  assert.match(continuation, /syncRevision/);
  assert.match(continuation, /useEffect/);
  assert.match(provider, /const syncRevision = useCallback/);
  assert.match(provider, /matchesMaterializedRevision/);
  assert.match(provider, /replaceCurrentWorkspaceCheckpoint/);
  assert.match(provider, /appendWorkspaceCheckpoint/);
});

test("desktop and mobile keep persistent tool navigation after one upload", () => {
  const desktop = read(
    "components/pdf/workspace/WorkspaceHistoryControls.tsx",
  );
  const mobile = read(
    "components/pdf/workspace/WorkspaceMobileNav.tsx",
  );

  for (const label of ["Edit", "Pages", "Sign", "Add", "Compress"]) {
    assert.match(desktop, new RegExp(`label: "${label}"`));
  }
  assert.match(desktop, /continueCurrent\(area\)/);
  assert.match(mobile, /continueCurrent\(area\)/);
  assert.match(mobile, />\s*Finish\s*</);
});

test("hybrid synchronization remains browser-memory only", () => {
  const sources = [
    read("components/pdf/workspace/WorkspaceDocumentProvider.tsx"),
    read("components/pdf/workspace/WorkspaceDocumentBinding.tsx"),
    read("components/pdf/workspace/ContinueWithPdf.tsx"),
  ].join("\n");

  for (const forbidden of [
    "localStorage",
    "sessionStorage",
    "indexedDB",
    "OPFS",
    "XMLHttpRequest",
    "navigator.sendBeacon",
  ]) {
    assert.doesNotMatch(sources, new RegExp(forbidden, "i"));
  }
});
