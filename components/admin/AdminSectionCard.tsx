import type { ReactNode } from "react";

export function AdminSectionCard({
  title,
  description,
  action,
  children,
  className = "",
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`aura-panel rounded-[var(--radius-2xl)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5 shadow-[var(--shadow-md)] transition duration-200 ${className}`}
    >
      {(title || description || action) && (
        <div className="mb-5 flex flex-col gap-3 border-b border-[var(--border-subtle)] pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            {title && <h2 className="font-serif font-semibold text-base text-[var(--lumeo-paper-50)]">{title}</h2>}
            {description && <p className="mt-1 text-sm leading-6 text-[var(--lumeo-paper-400)]">{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
