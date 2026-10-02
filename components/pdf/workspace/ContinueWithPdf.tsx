"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  continuationTargetsFor,
  type ContinuationArea,
} from "@/lib/pdf/workspace/continuation";
import type { DocumentSession } from "@/lib/pdf/workspace/session";
import { useWorkspaceDocument } from "./WorkspaceDocumentProvider";

export function ContinueWithPdf({
  sourceArea,
  fileName,
  bytes,
  pageCount,
  session,
  incompatibleTargets = [],
  disabledTargets,
}: {
  sourceArea: ContinuationArea;
  fileName: string;
  bytes: ArrayBuffer;
  pageCount: number;
  session: DocumentSession;
  incompatibleTargets?: readonly ContinuationArea[];
  disabledTargets?: Partial<Record<ContinuationArea, string>>;
}) {
  const router = useRouter();
  const { stageContinuation } = useWorkspaceDocument();
  const [busyTarget, setBusyTarget] = useState<ContinuationArea | null>(null);
  const [error, setError] = useState("");

  const targets = continuationTargetsFor(sourceArea, incompatibleTargets);

  function continueTo(
    target: (typeof targets)[number],
  ) {
    if (busyTarget) return;
    setBusyTarget(target.area);
    setError("");

    try {
      stageContinuation({
        target: target.area,
        fileName,
        bytes,
        pageCount,
        session,
      });
      router.push(target.route);
    } catch {
      setBusyTarget(null);
      setError(
        "Could not continue with this PDF. Download it and try the next tool normally.",
      );
    }
  }

  if (targets.length === 0) return null;

  return (
    <section
      aria-label="Continue with this PDF"
      className="rounded-[var(--radius-xl)] border border-[var(--border-hairline)] bg-[rgba(var(--paper-rgb),0.025)] px-3.5 py-3 sm:flex sm:flex-wrap sm:items-center sm:justify-between sm:gap-4"
    >
      <div className="min-w-0">
        <p className="text-sm font-bold text-[var(--text-primary)]">
          Continue with this PDF
        </p>
        <p className="mt-0.5 text-xs leading-5 text-[var(--text-muted)]">
          Keep working without opening the file again.
        </p>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-0 sm:flex sm:shrink-0">
        {targets.map((target) => {
          const disabledReason = disabledTargets?.[target.area]?.trim() ?? "";
          const reasonId = `continue-${target.area}-reason`;

          return (
            <div key={target.area} className="min-w-0">
              <button
                type="button"
                disabled={Boolean(busyTarget) || Boolean(disabledReason)}
                aria-describedby={disabledReason ? reasonId : undefined}
                onClick={() => continueTo(target)}
                className="lumeo-focus-ring inline-flex min-h-11 w-full items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] transition hover:border-[var(--border-selected)] hover:bg-[var(--surface-selected)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busyTarget === target.area ? "Opening…" : target.label}
              </button>
              {disabledReason ? (
                <p
                  id={reasonId}
                  className="mt-1 max-w-36 text-[11px] leading-4 text-[var(--text-muted)]"
                >
                  {disabledReason}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      {error ? (
        <p
          role="alert"
          className="mt-2 text-xs font-semibold text-[var(--text-danger)] sm:basis-full"
        >
          {error}
        </p>
      ) : null}
    </section>
  );
}
