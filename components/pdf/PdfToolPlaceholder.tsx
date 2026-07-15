import Link from "next/link";
import { PublicCatalogPageShell } from "@/components/public/PublicCatalogPageShell";
import { AuraNotice, L2ToolCard } from "@/components/ui/Aura";
import { getStatusLabel, pdfTools } from "./PdfToolRegistry";
import type { PdfToolDefinition } from "./PdfToolRegistry";

function StatusBadge({ tool }: { tool: PdfToolDefinition }) {
  return (
    <span className="inline-flex rounded-[var(--radius-pill)] bg-[rgba(var(--champagne-rgb),0.12)] px-3 py-1 text-[0.65rem] font-bold uppercase tracking-[0.16em] text-[var(--text-accent)] shadow-[inset_0_1px_0_rgba(255,253,248,0.08)]">
      {getStatusLabel(tool.status)}
    </span>
  );
}

export function PdfToolPlaceholder({ tool }: { tool: PdfToolDefinition }) {
  const relatedLiveTools = pdfTools.filter((item) => item.status === "live").slice(0, 3);

  return (
    <PublicCatalogPageShell
      maxWidth="max-w-[1160px]"
      mainClassName="min-h-dvh bg-[var(--surface-canvas)] text-[var(--text-primary)]"
      contentClassName="px-5 py-8 sm:px-8 sm:py-10"
    >
      <section className="lumeo-fade-up grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div>
          <StatusBadge tool={tool} />
          <h1 className="mt-5 font-serif text-[var(--text-heading-xl)] leading-[var(--leading-heading)] tracking-[var(--tracking-display)] text-[var(--text-primary)]">
            {tool.title}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--text-secondary)]">
            {tool.description}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/pdf-tools" className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-hairline)] bg-[var(--surface-interactive)] px-4 text-sm font-extrabold text-[var(--text-primary)] shadow-[var(--shadow-xs)] transition hover:bg-[rgba(var(--paper-rgb),0.12)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--sky-rgb),0.2)]">
              Browse PDF tools
            </Link>
            <Link href="/" className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-md)] border border-transparent px-4 text-sm font-extrabold text-[var(--text-secondary)] transition hover:bg-[rgba(var(--paper-rgb),0.06)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--sky-rgb),0.2)]">
              Back home
            </Link>
          </div>
        </div>

        <aside className="aura-luminous-card rounded-[var(--radius-2xl)] p-6">
          <p className="aura-text-label text-[var(--text-accent)]">Coming soon</p>
          <h2 className="mt-3 text-2xl font-black text-[var(--text-primary)]">Tool engine not active yet</h2>
          <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{tool.engineNote}</p>
          <ul className="mt-5 grid gap-2 text-sm text-[var(--text-secondary)]">
            {tool.bullets.map((bullet) => (
              <li key={bullet} className="flex gap-3 rounded-[var(--radius-lg)] bg-[rgba(var(--paper-rgb),0.055)] px-3 py-2">
                <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 rounded-full bg-[var(--champagne-300)]" />
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
          <div className="mt-5">
            <AuraNotice tone="info" title="Non-operational preview">
              Planned input: {tool.accepted}. No files can be selected or processed on this page yet.
            </AuraNotice>
          </div>
        </aside>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-black text-[var(--text-primary)]">Live tools you can use now</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {relatedLiveTools.map((item) => (
            <L2ToolCard
              key={item.slug}
              tool={{
                toolName: item.title,
                shortDescription: item.description,
                route: item.route,
                iconKey: item.slug,
              }}
            />
          ))}
        </div>
      </section>
    </PublicCatalogPageShell>
  );
}
