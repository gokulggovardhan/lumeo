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
    <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="max-w-3xl">
        {eyebrow && (
          <p className="aura-text-label text-[var(--lumeo-gold-300)]">
            {eyebrow}
          </p>
        )}
        <h1 className="mt-2 font-serif text-[length:var(--text-heading-lg)] font-semibold tracking-tight text-[var(--lumeo-paper-50)] sm:text-[length:var(--text-heading-xl)]">
          {title}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--lumeo-paper-400)]">{description}</p>
      </div>
      {meta}
    </header>
  );
}
