"use client";

import Link from "next/link";
import { useWorkspaceDocument } from "./WorkspaceDocumentProvider";

const ADD_ACTIONS = [
  {
    href: "/pdf/watermark",
    label: "Watermark",
    description: "Add text or an image mark.",
  },
  {
    href: "/pdf/page-numbers",
    label: "Page numbers",
    description: "Number selected or all pages.",
  },
  {
    href: "/pdf/header-footer",
    label: "Header & footer",
    description: "Add repeating document text.",
  },
] as const;

export function AddWorkspaceEntry() {
  const { document, continuationTarget } = useWorkspaceDocument();
  const continuing = Boolean(document && continuationTarget === "enhance");

  return (
    <section className="mx-auto grid w-full max-w-[780px] gap-4">
      {continuing ? (
        <div
          role="status"
          className="rounded-[var(--radius-lg)] border border-[var(--border-hairline)] bg-[var(--surface-raised)] px-4 py-3"
        >
          <p className="text-sm font-bold text-[var(--text-primary)]">
            Continue with {document!.revision.fileName}
          </p>
          <p className="mt-0.5 text-xs leading-5 text-[var(--text-muted)]">
            Choose what to add. You won&apos;t need to open the PDF again.
          </p>
        </div>
      ) : null}

      <div
        className="grid gap-2.5 sm:grid-cols-3"
        aria-label="Add to PDF"
      >
        {ADD_ACTIONS.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className="lumeo-focus-ring group flex min-h-[5.5rem] flex-col justify-center rounded-[var(--radius-xl)] border border-[var(--border-hairline)] bg-[var(--surface-raised)] px-4 py-3 transition hover:-translate-y-0.5 hover:border-[var(--border-selected)] hover:bg-[var(--surface-elevated)] motion-reduce:transform-none"
          >
            <span className="text-sm font-extrabold text-[var(--text-primary)]">
              {action.label}
            </span>
            <span className="mt-1 text-xs leading-5 text-[var(--text-muted)]">
              {action.description}
            </span>
          </Link>
        ))}
      </div>

      {!continuing ? (
        <p className="text-center text-xs leading-5 text-[var(--text-muted)]">
          Each option also works as a normal standalone tool.
        </p>
      ) : null}
    </section>
  );
}
