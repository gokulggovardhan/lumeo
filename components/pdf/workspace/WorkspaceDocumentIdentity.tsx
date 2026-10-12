"use client";

import { useId } from "react";
import {
  formatWorkspaceFileSize,
  workspaceDocumentDescription,
  workspacePageLabel,
} from "@/lib/pdf/workspace/documentIdentity";
import { useWorkspaceDocument } from "./WorkspaceDocumentProvider";

export function WorkspaceDocumentIdentity() {
  const descriptionId = useId();
  const { document, globalHistory } = useWorkspaceDocument();

  // Standalone quick tools have no connected Workspace identity.
  if (!document || !globalHistory.connected) return null;

  // Read the existing revision directly; Undo/Redo and tool transitions
  // update this same provider. No new document ID, state or storage is added.
  const revision = document.revision;
  const fullDescription = workspaceDocumentDescription(revision);

  return (
    <section
      aria-label="Current Workspace document"
      aria-describedby={descriptionId}
      data-workspace-document-identity
      data-workspace-revision-number={revision.number}
      className="mx-auto w-full max-w-[1480px] px-4 pt-2 sm:px-6 lg:px-8"
    >
      <p id={descriptionId} className="sr-only">
        {fullDescription}
      </p>
      <div className="aura-glass-thin flex min-w-0 flex-col gap-2 rounded-[var(--radius-xl)] border border-[var(--border-hairline)] px-3 py-2 shadow-[var(--v2-elevation-1)] sm:flex-row sm:flex-wrap sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span aria-hidden="true" className="shrink-0 rounded-[var(--radius-sm)] bg-[var(--surface-raised)] px-2 py-1 text-[10px] font-black text-[var(--text-secondary)]">
            PDF
          </span>
          <span
            data-workspace-document-filename
            title={revision.fileName}
            className="block min-w-0 flex-1 truncate text-sm font-extrabold text-[var(--text-primary)]"
          >
            {revision.fileName}
          </span>
        </div>
        <dl className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs font-bold text-[var(--text-secondary)]">
          <div>
            <dt className="sr-only">Pages</dt>
            <dd data-workspace-document-pages>{workspacePageLabel(revision.pageCount)}</dd>
          </div>
          <div>
            <dt className="sr-only">Revision</dt>
            <dd data-workspace-document-revision>Revision {revision.number}</dd>
          </div>
          <div>
            <dt className="sr-only">Current file size</dt>
            <dd data-workspace-document-size>{formatWorkspaceFileSize(revision.byteLength)}</dd>
          </div>
        </dl>
        <details className="min-w-0 w-full text-xs text-[var(--text-secondary)] sm:ml-auto sm:w-auto">
          <summary className="lumeo-focus-ring w-fit cursor-pointer rounded-[var(--radius-sm)] px-2 py-1.5 font-extrabold">
            Full details
          </summary>
          <p data-workspace-document-full-description className="mt-1 max-w-md break-words px-2 pb-1 leading-5">
            {fullDescription}
          </p>
        </details>
      </div>
    </section>
  );
}
