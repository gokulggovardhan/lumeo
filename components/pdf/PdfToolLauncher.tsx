// components/pdf/PdfToolLauncher.tsx

import Link from "next/link";
import { ToolGlyph } from "@/components/pdf/ToolGlyph";
import { getPublicPdfCatalog } from "@/lib/public-catalog/data";
import { resolveLumeoTools, type ResolvedTool } from "@/lib/tools/resolve";
import { ScrollReveal } from "@/components/ui/ScrollReveal";

function AllToolsIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="var(--text-accent)" />
    </svg>
  );
}

function OpenToolArrow() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3 transition-transform duration-200 group-hover:translate-x-1">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function CardShell({
  href,
  index,
  ariaLabel,
  children,
}: {
  href?: string;
  index: number;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  const cardClassName =
    "lumeo-tool-card aura-luminous-card group relative flex min-w-0 flex-col overflow-hidden rounded-[16px] p-3.5 transition duration-300 [transition-timing-function:cubic-bezier(.2,.8,.2,1)] hover:-translate-y-1.5 hover:shadow-[0_20px_48px_rgba(0,0,0,0.35)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--champagne-rgb),0.18)]";

  return (
    <ScrollReveal index={index}>
      {href ? (
        <Link href={href} aria-label={ariaLabel} className={cardClassName}>
          {children}
        </Link>
      ) : (
        <div className={cardClassName} aria-disabled="true">
          {children}
        </div>
      )}
    </ScrollReveal>
  );
}

function ToolCard({ tool, index }: { tool: ResolvedTool; index: number }) {
  const href = tool.effectivePrimaryRoute ? `/pdf-tools/${tool.key}` : undefined;

  return (
    <li className="min-w-0">
      <CardShell href={href} index={index} ariaLabel={`Open ${tool.name}`}>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[rgba(var(--atelier-sage-rgb),0.16)] text-[var(--atelier-sage-300)] transition duration-300 [transition-timing-function:cubic-bezier(.34,1.4,.64,1)] group-hover:scale-110 group-hover:bg-[rgba(var(--atelier-sage-rgb),0.26)]">
          <ToolGlyph name={tool.key} className="h-[20px] w-[20px]" />
        </div>
        <h3 className="mt-2 font-serif font-semibold text-base leading-tight text-[var(--text-primary)]">
          {tool.name} <span className="font-mono text-[10.5px] font-normal text-[var(--text-muted)]">{tool.plain}</span>
        </h3>
        <p className="mt-1 line-clamp-2 text-sm leading-5 text-[var(--text-secondary)]">{tool.tag}</p>
        {href ? (
          <span className="mt-2 inline-flex translate-x-[-6px] items-center gap-1.5 text-xs font-bold text-[var(--atelier-sage-300)] opacity-0 transition duration-200 group-hover:translate-x-0 group-hover:opacity-100">
            Open tool <OpenToolArrow />
          </span>
        ) : null}
      </CardShell>
    </li>
  );
}

export async function PdfToolLauncher({ showHeading = true }: { showHeading?: boolean }) {
  const catalog = await getPublicPdfCatalog();
  const tools = resolveLumeoTools(catalog.tools).filter(
    (tool) => tool.availability === "available" && tool.effectivePrimaryRoute,
  );

  return (
    <section aria-label="PDF tools">
      {showHeading ? (
        <header className="mb-7 text-center">
          <p className="aura-text-label text-[var(--lumeo-gold-300)]">
            Lumeo PDF Workspace
          </p>
          <h1 className="mt-3 font-serif text-[length:var(--text-heading-xl)] leading-[var(--leading-heading)] text-[color:var(--lumeo-paper-50)]">
            Choose a tool. Get it done.
          </h1>
        </header>
      ) : null}

      <nav aria-label="Available PDF tools">
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {tools.map((tool, index) => (
            <ToolCard key={tool.key} tool={tool} index={index} />
          ))}
          <li className="min-w-0">
            <CardShell href="/pdf-tools" index={tools.length} ariaLabel="Browse Tools">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[rgba(var(--atelier-sage-rgb),0.16)] text-[var(--atelier-sage-300)] transition duration-300 [transition-timing-function:cubic-bezier(.34,1.4,.64,1)] group-hover:scale-110 group-hover:bg-[rgba(var(--atelier-sage-rgb),0.26)]">
                <AllToolsIcon />
              </div>
              <h3 className="mt-2 font-serif font-semibold text-base text-[var(--text-primary)]">Browse Tools</h3>
              <p className="mt-1 line-clamp-2 text-sm leading-5 text-[var(--text-secondary)]">See every available PDF tool in one place.</p>
              <span className="mt-2 inline-flex translate-x-[-6px] items-center gap-1.5 text-xs font-bold text-[var(--atelier-sage-300)] opacity-0 transition duration-200 group-hover:translate-x-0 group-hover:opacity-100">
                Browse tools <OpenToolArrow />
              </span>
            </CardShell>
          </li>
        </ul>
      </nav>
    </section>
  );
}
