"use client";

import { useState } from "react";
import type { DocumentSession } from "@/lib/pdf/workspace/session";
import {
  confirmFlowCreatorHandoff,
  prepareFlowCreatorDraft,
  type CreatorFlowDraft,
} from "@/lib/pdf/workspace/creatorHandoff";

/**
 * Opt-in template review, not a Flow runner. The only output is a small
 * allowlisted JSON file saved locally after explicit user confirmation.
 */
export function WorkspaceFlowCreator({ session }: { session: DocumentSession }) {
  const [draft, setDraft] = useState<CreatorFlowDraft | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [notice, setNotice] = useState("");

  function reviewCurrentChanges() {
    try {
      const next = prepareFlowCreatorDraft(session);
      setDraft(next);
      setConfirmed(false);
      setNotice("");
    } catch {
      setDraft(null);
      setConfirmed(false);
      setNotice("No portable Flow steps are available. Currently only full-document quality compression can be reused.");
    }
  }

  function downloadTemplate() {
    if (!draft || confirmed !== true) return;
    try {
      // Do not confirm a stale review if the underlying applied operations
      // changed while this panel was open.
      const latest = prepareFlowCreatorDraft(session);
      if (
        latest.templateJson !== draft.templateJson ||
        latest.omittedOperationCount !== draft.omittedOperationCount
      ) {
        setDraft(null);
        setConfirmed(false);
        setNotice("Your document changed. Review the reusable steps again.");
        return;
      }

      const handoff = confirmFlowCreatorHandoff(draft, true);
      if (!handoff) return;
      const blob = new Blob([handoff.templateJson], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement("a");
      link.href = url;
      link.download = "lumeo-flow-v1.json";
      window.document.body.appendChild(link);
      link.click();
      link.remove();
      // Safari/WebKit may cancel a download if its Blob URL is revoked in the
      // same task. Preserve it briefly, then release it without persistence.
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setNotice("Your browser has been asked to download the Flow template.");
    } catch {
      setNotice("The template could not be prepared. Review the steps again.");
      setConfirmed(false);
    }
  }

  return (
    <section
      aria-labelledby="flow-creator-title"
      className="rounded-[var(--radius-2xl)] border border-[var(--border-default)] bg-[var(--surface-raised)] p-5 shadow-[var(--v2-elevation-2)] sm:p-6"
    >
      <p className="aura-text-label text-[var(--text-accent)]">OPTIONAL · LOCAL ONLY</p>
      <h2 id="flow-creator-title" className="mt-2 font-serif text-xl font-semibold text-[var(--text-primary)]">
        Create a reusable Flow
      </h2>
      <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
        Review eligible steps from this session. Only compression quality settings
        can be saved for later manual use; your PDF, filename, signatures and
        private edits are never included.
      </p>

      <button
        type="button"
        onClick={reviewCurrentChanges}
        className="lumeo-focus-ring mt-4 min-h-11 rounded-[var(--radius-md)] border border-[var(--border-default)] px-4 text-sm font-bold text-[var(--text-primary)] transition hover:bg-[var(--surface-overlay)]"
      >
        Review reusable steps
      </button>

      {draft ? (
        <div className="mt-4 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] p-4">
          <h3 className="text-sm font-extrabold text-[var(--text-primary)]">Template preview</h3>
          <ol className="mt-3 grid gap-2">
            {draft.steps.map((step) => (
              <li key={step.order} className="flex items-center justify-between gap-4 rounded-[var(--radius-md)] bg-[var(--surface-overlay)] px-3 py-2 text-sm">
                <span className="text-[var(--text-primary)]">{step.order}. {step.title}</span>
                <span className="text-[var(--text-secondary)]">{step.quality}</span>
              </li>
            ))}
          </ol>
          {draft.omittedOperationCount > 0 ? (
            <p className="mt-3 text-xs leading-5 text-[var(--text-secondary)]">
              {draft.omittedOperationCount} non-portable operation(s) were excluded for privacy and safety.
            </p>
          ) : null}
          <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm leading-6 text-[var(--text-secondary)]">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
              className="mt-1 h-4 w-4 accent-[var(--emerald-600)]"
            />
            <span>I reviewed the steps. This saves only template settings, not my document, and runs nothing automatically.</span>
          </label>
          <button
            type="button"
            disabled={!confirmed}
            onClick={downloadTemplate}
            className="lumeo-focus-ring mt-4 min-h-11 rounded-[var(--radius-md)] bg-[var(--emerald-600)] px-4 text-sm font-bold text-[var(--text-on-accent)] transition hover:bg-[var(--emerald-500)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Download Flow template (JSON)
          </button>
          <p className="mt-3 text-xs leading-5 text-[var(--text-muted)]">
            Templates are not executable in this version. Choose a new local document manually when this feature is extended.
          </p>
        </div>
      ) : null}

      {notice ? <p role="status" aria-live="polite" className="mt-3 text-sm text-[var(--text-secondary)]">{notice}</p> : null}
    </section>
  );
}
