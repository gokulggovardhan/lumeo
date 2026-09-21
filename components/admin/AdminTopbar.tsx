import type { AdminRole } from "@/lib/admin/types";

function environmentLabel(environment: string) {
  if (environment === "production") return "Production";
  if (environment === "preview") return "Preview";
  if (environment === "ci") return "CI";
  return "Local";
}

export function AdminTopbar({
  email,
  role,
  environment,
  revision,
}: {
  email: string | null;
  role: AdminRole;
  environment: string;
  revision: string | null;
}) {
  const live = environment === "production";

  return (
    <header className="hidden min-h-16 items-center justify-between gap-5 border-b border-[var(--border-hairline)] px-6 lg:flex xl:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${live ? "bg-[var(--lumeo-seal-400)]" : "bg-[var(--lumeo-gold-400)]"}`}
          aria-hidden="true"
        />
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
            {environmentLabel(environment)} · Cloudflare
          </p>
          <p className="mt-0.5 truncate font-mono text-[11px] text-[var(--text-subtle)]">
            {revision ? `rev ${revision.slice(0, 12)}` : "revision unavailable"}
          </p>
        </div>
      </div>

      <div className="flex min-w-0 items-center gap-3">
        <a
          href="/"
          target="_blank"
          rel="noreferrer"
          className="rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] transition hover:border-[var(--border-premium)] hover:text-[var(--text-primary)]"
        >
          View Lumeo ↗
        </a>
        <div className="min-w-0 border-l border-[var(--border-hairline)] pl-4 text-right">
          <p className="max-w-64 truncate text-sm font-semibold text-[var(--text-primary)]">
            {email || "Administrator"}
          </p>
          <p className="mt-0.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--text-accent)]">
            {role}
          </p>
        </div>
      </div>
    </header>
  );
}
