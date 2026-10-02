"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { sanitizeFileStem } from "@/lib/pdf/sanitizeFileName";
import {
  beginWorkspaceExport,
  completeWorkspaceExport,
  failWorkspaceExport,
} from "@/lib/pdf/workspace/session";
import { visibleWorkspaceHistory } from "@/lib/pdf/workspace/presentation";
import { useWorkspaceDocument } from "./WorkspaceDocumentProvider";

function outputName(value: string): string {
  return `${sanitizeFileStem(value.replace(/\.pdf$/i, ""), "lumeo-finished")}.pdf`;
}

function formatBytes(value: number): string {
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(value >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

function changeSummaries(
  operations: ReturnType<typeof visibleWorkspaceHistory>,
): Array<{ label: string; count: number }> {
  const counts = new Map<string, number>();
  for (const operation of operations) {
    counts.set(operation.description, (counts.get(operation.description) ?? 0) + 1);
  }
  return [...counts.entries()].map(([label, count]) => ({ label, count }));
}

export function WorkspaceFinish() {
  const router = useRouter();
  const {
    document,
    fileForCurrentRevision,
    replaceSession,
    continueCurrent,
  } = useWorkspaceDocument();
  const [name, setName] = useState("lumeo-finished.pdf");
  const [error, setError] = useState("");
  const [downloaded, setDownloaded] = useState(false);

  useEffect(() => {
    if (!document) return;
    setName(outputName(currentDocument.revision.fileName));
    setError("");
    setDownloaded(false);
  }, [document?.id, document?.revision.number, document?.revision.fileName]);

  const changes = useMemo(() => {
    if (!document) return [];
    return changeSummaries(
      visibleWorkspaceHistory(
        currentDocument.session.history.operations,
        currentDocument.session.state.historyCursor,
        12,
      ),
    );
  }, [document]);

  if (!document) {
    return (
      <section className="mx-auto max-w-[720px] rounded-[var(--radius-2xl)] border border-[var(--border-default)] bg-[var(--surface-raised)] p-6 text-center shadow-[var(--v2-elevation-2)]">
        <h2 className="font-serif text-2xl font-semibold text-[var(--text-primary)]">
          No PDF is open
        </h2>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[var(--text-secondary)]">
          Finish appears after you continue a PDF between Lumeo tools.
        </p>
        <button
          type="button"
          onClick={() => router.push("/pdf-tools")}
          className="lumeo-focus-ring mt-5 inline-flex min-h-11 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-5 text-sm font-bold text-[var(--text-primary)] hover:border-[var(--border-selected)]"
        >
          Browse PDF tools
        </button>
      </section>
    );
  }

  const currentDocument = document;
  const safeName = outputName(name);
  const pageLabel = `${currentDocument.revision.pageCount} ${currentDocument.revision.pageCount === 1 ? "page" : "pages"}`;

  function moveToCompress() {
    if (!continueCurrent("optimize")) return;
    router.push("/pdf/compress");
  }

  function downloadPdf() {
    setError("");
    let exporting = currentDocument.session;

    try {
      const file = fileForCurrentRevision();
      if (!file) throw new Error("The current PDF is unavailable.");

      exporting = beginWorkspaceExport(currentDocument.session);
      replaceSession(exporting);

      const url = URL.createObjectURL(file);
      const link = window.document.createElement("a");
      link.href = url;
      link.download = safeName;
      window.document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);

      replaceSession(completeWorkspaceExport(exporting));
      setDownloaded(true);
    } catch {
      try {
        replaceSession(failWorkspaceExport(exporting));
      } catch {
        // The export may have failed before an exporting state existed.
      }
      setError("Could not prepare the download. Your PDF is still open in this workspace.");
    }
  }

  return (
    <section className="mx-auto grid max-w-[940px] gap-4">
      <div className="rounded-[var(--radius-2xl)] border border-[var(--border-default)] bg-[var(--surface-raised)] p-5 shadow-[var(--v2-elevation-2)] sm:p-6">
        <div className="flex flex-col gap-4 border-b border-[var(--border-subtle)] pb-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="aura-text-label text-[var(--text-accent)]">READY TO FINISH</p>
            <h2 className="mt-2 font-serif text-2xl font-semibold text-[var(--text-primary)]">
              Review your PDF
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
              {pageLabel} · {formatBytes(currentDocument.revision.byteLength)}
            </p>
          </div>
          <span className="rounded-full border border-[var(--border-subtle)] bg-[rgba(var(--paper-rgb),0.04)] px-3 py-1.5 text-xs font-bold text-[var(--text-muted)]">
            Revision {currentDocument.revision.number}
          </span>
        </div>

        <div className="grid gap-5 pt-5 md:grid-cols-[minmax(0,1fr)_minmax(260px,0.75fr)]">
          <div>
            <h3 className="text-sm font-extrabold text-[var(--text-primary)]">
              Changes in this PDF
            </h3>
            {changes.length > 0 ? (
              <ul className="mt-3 grid gap-2">
                {changes.map((item) => (
                  <li
                    key={item.label}
                    className="flex min-h-10 items-center justify-between gap-4 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(var(--paper-rgb),0.025)] px-3 py-2 text-sm"
                  >
                    <span className="text-[var(--text-secondary)]">{item.label}</span>
                    {item.count > 1 ? (
                      <span className="shrink-0 text-xs font-bold text-[var(--text-muted)]">
                        ×{item.count}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">
                The current PDF is ready to download.
              </p>
            )}
          </div>

          <div className="rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[rgba(var(--paper-rgb),0.025)] p-4">
            <label className="block text-xs font-extrabold uppercase tracking-[0.12em] text-[var(--text-subtle)]">
              File name
              <input
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setDownloaded(false);
                }}
                onBlur={() => setName(safeName)}
                className="lumeo-focus-ring mt-2 min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-canvas)] px-3 text-sm font-bold normal-case tracking-normal text-[var(--text-primary)]"
                inputMode="text"
              />
            </label>

            <button
              type="button"
              onClick={moveToCompress}
              className="lumeo-focus-ring mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-default)] bg-transparent px-4 text-sm font-bold text-[var(--text-secondary)] transition hover:border-[var(--border-selected)] hover:text-[var(--text-primary)]"
            >
              Reduce size first
            </button>
            <p className="mt-2 text-xs leading-5 text-[var(--text-subtle)]">
              Optional. This opens the existing Compress tool with the same PDF.
            </p>
          </div>
        </div>
      </div>

      <div className="sticky bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-20 rounded-[var(--radius-2xl)] border border-[var(--border-default)] bg-[var(--surface-overlay)] p-3 shadow-[var(--v2-elevation-4)] backdrop-blur-xl">
        <button
          type="button"
          onClick={downloadPdf}
          className="lumeo-primary-action lumeo-focus-ring inline-flex min-h-12 w-full items-center justify-center rounded-[var(--radius-md)] bg-[var(--emerald-600)] px-6 text-sm font-black text-[var(--text-on-accent)] transition hover:bg-[var(--emerald-500)] active:scale-[0.99]"
        >
          Download PDF
        </button>
        {downloaded ? (
          <p className="mt-2 text-center text-xs font-semibold text-[var(--atelier-sage-300)]">
            Download prepared. Your workspace stays open.
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="mt-2 text-center text-xs font-semibold text-[var(--text-danger)]">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  );
}
