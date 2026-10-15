import type { ReactNode } from "react";

/**
 * Server-rendered presentation-only header for the initial Edit PDF page.
 * Keep the markup and utility classes in sync with L2ToolPageHeader while
 * avoiding the heavy client ToolWorkspace/Aura bundle on the initial route.
 */
export function PublicToolPageHeader({
  title,
  description,
  categoryLabel = "PDF TOOL",
  privacy,
  action,
}: {
  title: string;
  description: string;
  categoryLabel?: string;
  privacy?: string;
  action?: ReactNode;
}) {
  return (
    <header className="l2-tool-page-header flex flex-col justify-between gap-5 md:flex-row md:items-end">
      <div className="max-w-3xl">
        <p className="aura-text-label text-[var(--text-accent)]">{categoryLabel}</p>
        <h1 className="mt-2.5 font-serif font-semibold text-[clamp(1.4rem,2.24vw,1.625rem)] leading-[0.94] tracking-[-0.04em] text-[var(--text-primary)]">
          {title}
        </h1>
        <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)] sm:text-base">
          {description}
        </p>
        {privacy ? (
          <p className="mt-3 inline-flex rounded-[var(--radius-pill)] border border-[var(--border-subtle)] bg-[rgba(var(--paper-rgb),0.055)] px-3 py-1.5 text-xs font-extrabold text-[var(--text-subtle)]">
            {privacy}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}
