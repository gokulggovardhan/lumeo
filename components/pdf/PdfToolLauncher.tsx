// components/pdf/PdfToolLauncher.tsx

import Link from "next/link";
import { getPublicHomepageTools } from "@/lib/public-catalog/data";
import type { PublicHomepageTool } from "@/lib/public-catalog/types";
import { AuraBadge } from "@/components/ui/Aura";
import { ScrollReveal } from "@/components/ui/ScrollReveal";

function MergeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="10" height="13" rx="1.5" />
      <rect x="12" y="7" width="10" height="13" rx="1.5" stroke="var(--text-accent)" />
      <path d="M10.5 11.2l2 2-2 2" stroke="var(--text-accent)" strokeWidth="1.6" />
    </svg>
  );
}

function SplitIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M12 3v18" stroke="var(--text-accent)" strokeWidth="1.6" strokeDasharray="2.5 2.5" />
    </svg>
  );
}

function CompressIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M9 9L6 6M9 9H6.5M9 9V6.5" stroke="var(--text-accent)" strokeWidth="1.6" />
      <path d="M15 15l3 3M15 15h2.5M15 15v2.5" stroke="var(--text-accent)" strokeWidth="1.6" />
    </svg>
  );
}

function JpgToPdfIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="9" height="9" rx="1.5" />
      <circle cx="4.7" cy="6.7" r="1" fill="currentColor" stroke="none" />
      <path d="M2.8 11.5l2.2-2.6L7 11.2l2.5-3" />
      <path d="M12 8.5h4" stroke="var(--text-accent)" strokeWidth="1.6" />
      <path d="M14.5 6.5l2 2-2 2" stroke="var(--text-accent)" strokeWidth="1.6" />
      <rect x="13" y="12" width="9" height="9" rx="1.5" />
      <path d="M15.5 15h4M15.5 17.2h2.5" />
    </svg>
  );
}

function PdfToJpgIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="9" height="9" rx="1.5" />
      <path d="M4.5 6h4M4.5 8.2h2.5" />
      <path d="M12 8.5h4" stroke="var(--text-accent)" strokeWidth="1.6" />
      <path d="M14.5 6.5l2 2-2 2" stroke="var(--text-accent)" strokeWidth="1.6" />
      <rect x="13" y="12" width="9" height="9" rx="1.5" />
      <circle cx="15.7" cy="14.7" r="1" fill="currentColor" stroke="none" />
      <path d="M13.8 19.5l2.2-2.6l2.2 2.3l2.5-3" />
    </svg>
  );
}

function AllToolsIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
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

const iconBySlug: Record<string, () => React.ReactNode> = {
  merge: MergeIcon,
  split: SplitIcon,
  compress: CompressIcon,
  "jpg-to-pdf": JpgToPdfIcon,
  "pdf-to-jpg": PdfToJpgIcon,
};

function ToolCard({
  name,
  description,
  Icon,
  href,
  index,
  kind = "live",
}: {
  name: string;
  description: string;
  Icon: () => React.ReactNode;
  href?: string;
  index: number;
  kind?: "live" | "coming-soon" | "directory";
}) {
  const content = (
    <>
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[rgba(var(--atelier-sage-rgb),0.16)] text-[var(--atelier-sage-300)] transition duration-300 [transition-timing-function:cubic-bezier(.34,1.4,.64,1)] group-hover:scale-110 group-hover:-rotate-3 group-hover:bg-[rgba(var(--atelier-sage-rgb),0.26)]">
        <Icon />
      </div>
      <h3 className="mt-2 font-serif font-semibold text-base text-[var(--text-primary)]">{name}</h3>
      <p className="mt-1 line-clamp-2 text-sm leading-5 text-[var(--text-secondary)]">{description}</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        <AuraBadge tone="neutral" className="px-2 py-0.5">Browser-only</AuraBadge>
        {kind === "live" ? (
          <>
            <AuraBadge tone="success" className="px-2 py-0.5">Private</AuraBadge>
            <AuraBadge tone="warning" className="px-2 py-0.5">Free</AuraBadge>
          </>
        ) : null}
        {kind === "coming-soon" ? (
          <AuraBadge tone="unavailable" className="border-dashed px-2 py-0.5 opacity-70">Coming soon</AuraBadge>
        ) : null}
      </div>
      {href ? (
        <span className="mt-2 inline-flex translate-x-[-6px] items-center gap-1.5 text-xs font-bold text-[var(--atelier-sage-300)] opacity-0 transition duration-200 group-hover:translate-x-0 group-hover:opacity-100">
          {kind === "directory" ? "Browse tools" : "Open tool"} <OpenToolArrow />
        </span>
      ) : null}
    </>
  );

  const cardClassName =
    "aura-luminous-card group relative flex min-w-0 flex-col overflow-hidden rounded-[16px] p-3.5 transition duration-300 [transition-timing-function:cubic-bezier(.2,.8,.2,1)] hover:-translate-y-1.5 hover:shadow-[0_20px_48px_rgba(0,0,0,0.35)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--champagne-rgb),0.18)]";

  return (
    <ScrollReveal index={index}>
      {href ? (
        <Link href={href} aria-label={kind === "directory" ? name : `Open ${name}`} className={cardClassName}>
          {content}
        </Link>
      ) : (
        <div className={cardClassName} aria-disabled="true">
          {content}
        </div>
      )}
    </ScrollReveal>
  );
}

function toCardProps(tool: PublicHomepageTool) {
  const isComingSoon = tool.status === "coming_soon";
  return {
    name: tool.toolName,
    description: tool.shortDescription,
    Icon: iconBySlug[tool.toolSlug] ?? AllToolsIcon,
    href: isComingSoon ? undefined : tool.route,
    kind: (isComingSoon ? "coming-soon" : "live") as "live" | "coming-soon",
  };
}

export async function PdfToolLauncher({ showHeading = true }: { showHeading?: boolean }) {
  const tools = await getPublicHomepageTools();

  return (
    <section aria-label="PDF tools">
      {showHeading ? (
        <header className="mb-7 text-center">
          <p className="aura-text-label text-[var(--lumeo-gold-300)]">
            Lumeo PDF Workspace
          </p>
          <h1 className="mt-3 font-serif text-[var(--text-heading-xl)] leading-[var(--leading-heading)] text-[var(--lumeo-paper-50)]">
            Choose a tool. Get it done.
          </h1>
        </header>
      ) : null}

      <nav aria-label="Available PDF tools">
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {tools.map((tool, index) => (
            <li key={tool.toolSlug} className="min-w-0">
              <ToolCard {...toCardProps(tool)} index={index} />
            </li>
          ))}
          <li className="min-w-0">
            <ToolCard
              name="Browse Tools"
              description="See every available PDF tool in one place."
              Icon={AllToolsIcon}
              href="/pdf-tools"
              index={tools.length}
              kind="directory"
            />
          </li>
        </ul>
      </nav>
    </section>
  );
}
