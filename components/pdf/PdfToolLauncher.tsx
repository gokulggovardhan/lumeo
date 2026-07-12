// components/pdf/PdfToolLauncher.tsx

import Link from "next/link";
import type { ReactNode } from "react";
import { pdfTools } from "./PdfToolRegistry";
import type { PdfToolDefinition, PdfToolSlug } from "./PdfToolRegistry";

function ToolGlyph({ slug }: { slug: PdfToolSlug }) {
  const paths: Record<PdfToolSlug, ReactNode> = {
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
    "pdf-to-jpg": <path d="M5.5 4.5h8l3 3V14h-11V4.5Zm5 11h9v4h-9v-4Z" />,
  };

  return (
    <span
      aria-hidden="true"
      className="lumeo-card-icon flex h-12 w-12 shrink-0 items-center justify-center rounded-[15px] border border-[#CBA052]/22 bg-[linear-gradient(145deg,rgba(203,160,82,0.14),rgba(30,107,74,0.08))] text-[#D8BC7A] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
    >
      <svg viewBox="0 0 24 24" className="h-[1.3rem] w-[1.3rem]" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.55">
        {paths[slug]}
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

function LiveToolCard({ tool, index }: { tool: PdfToolDefinition; index: number }) {
  return (
    <li className="lumeo-fade-up min-w-0" style={{ animationDelay: `${index * 80}ms` }}>
      <Link
        href={tool.route}
        aria-label={`Open ${tool.title} workspace`}
        className="lumeo-card lumeo-shine group relative flex h-full min-h-[10.75rem] flex-col overflow-hidden rounded-[22px] border border-[#E8DFC8]/8 bg-[linear-gradient(180deg,rgba(17,26,43,0.98),rgba(13,21,36,0.98))] p-5 shadow-[0_18px_42px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(240,234,214,0.035)] transition duration-200 hover:-translate-y-1 hover:border-[#CBA052]/30 hover:shadow-[0_24px_58px_rgba(0,0,0,0.38),0_0_28px_rgba(203,160,82,0.06)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CBA052]/50 motion-reduce:transform-none sm:p-6"
      >
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-[#CBA052]/48 to-transparent opacity-60 transition group-hover:opacity-100" />

        <div className="flex items-start justify-between gap-4">
          <ToolGlyph slug={tool.slug} />
          <span className="lumeo-arrow flex h-9 w-9 items-center justify-center rounded-full border border-[#E8DFC8]/9 bg-[#F0EAD6]/[0.02] text-[#CBA052] transition duration-200 group-hover:translate-x-0.5 group-hover:border-[#CBA052]/28 group-hover:bg-[#CBA052]/[0.08] motion-reduce:transform-none">
            <ArrowIcon />
          </span>
        </div>

        <h2 className="mt-5 text-[1.28rem] font-bold tracking-[-0.025em] text-[#F0EAD6]">
          {tool.title}
        </h2>
        <p className="mt-2 text-sm leading-6 text-[#F0EAD6]/60">
          {tool.description}
        </p>
      </Link>
    </li>
  );
}

export function PdfToolLauncher({ showHeading = true }: { showHeading?: boolean }) {
  const liveTools = pdfTools.filter((tool) => tool.status === "live");

  return (
    <section aria-label="PDF tools">
      {showHeading ? (
        <header className="mb-7 text-center">
          <p className="text-[0.63rem] font-bold uppercase tracking-[0.2em] text-[#CBA052]">
            Lumeo PDF Workspace
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-[-0.04em] text-[#F0EAD6] sm:text-5xl">
            Choose a tool. Get it done.
          </h1>
        </header>
      ) : null}

      <nav aria-label="Available PDF tools">
        <ul className="grid gap-4 md:grid-cols-3">
          {liveTools.map((tool, index) => (
            <LiveToolCard key={tool.slug} tool={tool} index={index} />
          ))}
        </ul>
      </nav>
    </section>
  );
}
