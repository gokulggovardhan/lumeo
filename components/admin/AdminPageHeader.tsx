import type { ReactNode } from "react";

export function AdminPageHeader({
  eyebrow,
  title,
  description,
  meta,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  meta?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 border-b border-[var(--border-hairline)] pb-6 lg:flex-row lg:items-end lg:justify-between">
      <div className="max-w-3xl">
        {eyebrow ? (
          <p className="text-[11px] font-bold uppercase tracking-[0.17em] text-[var(--text-accent)]">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="mt-2 text-2xl font-semibold tracking-[-0.025em] text-[var(--text-primary)] sm:text-3xl">
          {title}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-muted)]">
          {description}
        </p>
      </div>
      {meta ? <div className="shrink-0">{meta}</div> : null}
    </header>
  );
}
