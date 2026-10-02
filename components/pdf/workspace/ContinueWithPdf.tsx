"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { WorkspaceArea } from "@/lib/pdf/workspace/model";
import type { DocumentSession } from "@/lib/pdf/workspace/session";
import { useWorkspaceDocument } from "./WorkspaceDocumentProvider";

export type ContinuationArea = Extract<
  WorkspaceArea,
  "edit" | "pages" | "sign" | "enhance" | "optimize"
>;

const TARGETS: ReadonlyArray<{
  area: ContinuationArea;
  label: string;
  route: string;
}> = [
  { area: "edit", label: "Edit", route: "/pdf/edit" },
  { area: "pages", label: "Pages", route: "/pdf/organize" },
  { area: "sign", label: "Sign", route: "/pdf/sign" },
  { area: "enhance", label: "Add", route: "/pdf/add" },
  { area: "optimize", label: "Compress", route: "/pdf/compress" },
];

export function ContinueWithPdf({
  sourceArea,
  fileName,
  bytes,
  pageCount,
  session,
}: {
  sourceArea: ContinuationArea;
  fileName: string;
  bytes: ArrayBuffer;
  pageCount: number;
  session: DocumentSession;
}) {
  const router = useRouter();
  const { stageContinuation } = useWorkspaceDocument();
  const [busyTarget, setBusyTarget] = useState<ContinuationArea | null>(null);
  const [error, setError] = useState("");

  const targets = TARGETS.filter(
    (target) => target.area !== sourceArea || sourceArea === "enhance",
  );

  function continueTo(
    target: (typeof TARGETS)[number],
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
        {targets.map((target) => (
          <button
            key={target.area}
            type="button"
            disabled={Boolean(busyTarget)}
            onClick={() => continueTo(target)}
            className="lumeo-focus-ring inline-flex min-h-11 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] transition hover:border-[var(--border-selected)] hover:bg-[var(--surface-selected)] disabled:cursor-wait disabled:opacity-60"
          >
            {busyTarget === target.area ? "Opening…" : target.label}
          </button>
        ))}
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
