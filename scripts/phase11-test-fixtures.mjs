// Install ephemeral routes only in an isolated checkout. Never committed or deployed.
import { mkdir, writeFile, rm } from "node:fs/promises";
const routes = ["app/phase11-recovery-fixture", "app/pdf/phase11-recovery-fixture", "app/admin/(protected)/phase11-recovery-fixture"];
if (process.argv[2] === "clean") {
  for (const route of routes) await rm(route, { recursive: true, force: true });
} else {
  if (process.env.LUMEO_RECOVERY_FIXTURES !== "1" || process.env.WORKERS_CI) {
    throw new Error("Recovery fixtures require explicit isolated-test opt-in and are forbidden in Workers CI");
  }
  for (const route of routes) {
    await mkdir(route, { recursive: true });
    const pdf = route.startsWith("app/pdf/");
    await writeFile(`${route}/page.tsx`, `"use client";
import { useState } from "react";
import { MaintenanceModeSubmitButton } from "@/components/admin/MaintenanceModeSubmitButton";
${pdf ? 'import { useWorkspaceDocument } from "@/components/pdf/workspace/WorkspaceDocumentProvider";' : ''}
export default function RecoveryFixture() {
  const [failed, setFailed] = useState(false);
  const [submissions, setSubmissions] = useState(0);
  ${pdf ? 'const workspace = useWorkspaceDocument();' : ''}
  if (failed) throw new Error("PHASE11_PRIVATE_DOCUMENT_SENTINEL");
  return <main id="main-content"><h1>Recovery fixture ready</h1>
    ${pdf ? `<button onClick={() => { workspace.startDocument({ fileName: "private-fixture.pdf", bytes: new Uint8Array([37,80,68,70]).buffer, pageCount: 1, initialArea: "edit" }); workspace.reportDraftUnsavedChanges(true); }}>Keep test document</button>
    <output aria-label="Retained document">{workspace.document?.revision.fileName ?? "none"}</output>
    <output aria-label="Document revision">{workspace.document?.revision.id ?? "none"}</output>` : ''}
    <form aria-label="Fixture maintenance" onSubmit={event => { event.preventDefault(); setSubmissions(value => value + 1); }}>
      <label><input type="checkbox" name="value" defaultChecked />Enabled</label>
      <MaintenanceModeSubmitButton wasEnabled={false} />
      <output aria-label="Submission count">{submissions}</output>
    </form>
    <button onClick={() => setFailed(true)}>Trigger controlled render failure</button>
  </main>;
}
`, { flag: "wx" });
  }
}
