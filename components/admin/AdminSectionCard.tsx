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
      className={`rounded-2xl border border-[var(--border-hairline)] bg-[rgba(24,27,23,0.72)] shadow-[0_18px_60px_rgba(0,0,0,0.14)] backdrop-blur-sm ${className}`}
    >
      {(title || description || action) ? (
        <div className="flex flex-col gap-3 border-b border-[var(--border-hairline)] px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
          <div className="min-w-0">
            {title ? (
              <h2 className="text-sm font-semibold tracking-[-0.01em] text-[var(--text-primary)]">{title}</h2>
            ) : null}
            {description ? (
              <p className="mt-1 max-w-3xl text-sm leading-5 text-[var(--text-muted)]">{description}</p>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}
      <div className="p-5 sm:p-6">{children}</div>
    </section>
  );
}
