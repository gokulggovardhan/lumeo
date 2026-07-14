// components/pdf/PdfToolLauncher.tsx

import Link from "next/link";
import type { ReactNode } from "react";
import { getPublicHomepageTools } from "@/lib/public-catalog/data";
import type { PublicHomepageTool } from "@/lib/public-catalog/types";

function ToolGlyph({ iconKey }: { iconKey: string }) {
  const paths: Record<string, ReactNode> = {
    merge: (
      <>
        <path d="M5.5 5.5h7l2 2V15h-9V5.5Z" />
        <path d="M9.5 9.5h7l2 2V19h-9V9.5Z" />
      </>
    ),
    split: (
      <>
        <path d="M7 4.5h10v15H7v-15Z" />
        <path d="M12 6.5v11" strokeDasharray="2 2" />
        <path d="M5 12H2.8m0 0 1.7-1.7M2.8 12l1.7 1.7M19 12h2.2m0 0-1.7-1.7m1.7 1.7-1.7 1.7" />
      </>
    ),
    compress: (
      <>
        <path d="M6.5 4.5h8l3 3V19h-11V4.5Z" />
        <path d="M14.5 4.8v3h3" />
        <path d="m9 9.5 3 3 3-3M9 15.5l3-3 3 3" />
      </>
    ),
    "jpg-to-pdf": <path d="M4.5 6h8.5v7H4.5V6Zm10.5 3.5h4.5v8H10.5v-2" />,
    "image-to-pdf": <path d="M4.5 6h8.5v7H4.5V6Zm10.5 3.5h4.5v8H10.5v-2" />,
    "pdf-to-jpg": <path d="M5.5 4.5h8l3 3V14h-11V4.5Zm5 11h9v4h-9v-4Z" />,
    "pdf-to-image": <path d="M5.5 4.5h8l3 3V14h-11V4.5Zm5 11h9v4h-9v-4Z" />,
    all: (
      <>
        <path d="M5 5h6v6H5V5Zm8 0h6v6h-6V5ZM5 13h6v6H5v-6Zm8 0h6v6h-6v-6Z" />
      </>
    ),
  };

  return (
    <span
      aria-hidden="true"
      className="lumeo-card-icon flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--radius-lg)] border border-[var(--border-premium)] bg-[linear-gradient(145deg,rgba(var(--lumeo-gold-rgb),0.16),rgba(var(--lumeo-aura-rgb),0.08))] text-[var(--lumeo-gold-300)] shadow-[inset_0_1px_0_rgba(255,253,247,0.08)]"
    >
      <svg viewBox="0 0 24 24" className="h-[1.3rem] w-[1.3rem]" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.55">
        {paths[iconKey] ?? paths.all}
      </svg>
    </span>
  );
}

function ArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none">
      <path d="M5 12h14M14 7l5 5-5 5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
    </svg>
  );
}

function ToolCard({
  tool,
  index,
}: {
  tool: PublicHomepageTool | { toolName: string; shortDescription: string; route: string; iconKey: string };
  index: number;
}) {
  return (
    <li className="lumeo-fade-up min-w-0" style={{ animationDelay: `${index * 80}ms` }}>
      <Link
        href={tool.route}
        aria-label={`Open ${tool.toolName}`}
        className="lumeo-card lumeo-shine aura-tool-card group relative flex h-full min-h-[10.75rem] flex-col overflow-hidden rounded-[var(--radius-2xl)] border border-[var(--border-subtle)] bg-[linear-gradient(180deg,rgba(25,48,77,0.82),rgba(16,29,49,0.94))] p-5 shadow-[var(--shadow-md)] transition duration-200 hover:-translate-y-1 hover:border-[var(--border-premium)] hover:shadow-[var(--shadow-lg)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--lumeo-aura-rgb),0.2)] motion-reduce:transform-none sm:p-6"
      >
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-[#CBA052]/48 to-transparent opacity-60 transition group-hover:opacity-100" />

        <div className="flex items-start justify-between gap-4">
          <ToolGlyph iconKey={tool.iconKey} />
          <span className="lumeo-arrow flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[rgba(var(--lumeo-paper-rgb),0.045)] text-[var(--lumeo-gold-300)] transition duration-200 group-hover:translate-x-0.5 group-hover:border-[var(--border-premium)] group-hover:bg-[rgba(var(--lumeo-gold-rgb),0.1)] motion-reduce:transform-none">
            <ArrowIcon />
          </span>
        </div>

        <h2 className="mt-5 text-[1.28rem] font-black tracking-[-0.025em] text-[var(--lumeo-paper-50)]">
          {tool.toolName}
        </h2>
        <p className="mt-2 text-sm leading-6 text-[var(--lumeo-paper-400)]">
          {tool.shortDescription}
        </p>
      </Link>
    </li>
  );
}

export async function PdfToolLauncher({ showHeading = true }: { showHeading?: boolean }) {
  const configuredTools = await getPublicHomepageTools();
  const tools = configuredTools.slice(0, 5);
  const allToolsCard = {
    toolName: "All PDF Tools",
    shortDescription: "Browse every available PDF tool by category.",
    route: "/pdf-tools",
    iconKey: "all",
  };

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
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...tools, allToolsCard].map((tool, index) => (
            <ToolCard key={`${tool.route}-${index}`} tool={tool} index={index} />
          ))}
        </ul>
      </nav>
    </section>
  );
}
