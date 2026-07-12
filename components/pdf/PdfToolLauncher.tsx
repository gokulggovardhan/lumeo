import Link from "next/link";
import type { ReactNode } from "react";
import { pdfTools } from "./PdfToolRegistry";
import type { PdfToolDefinition, PdfToolSlug } from "./PdfToolRegistry";

function ToolGlyph({ slug, live }: { slug: PdfToolSlug; live: boolean }) {
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
    "jpg-to-pdf": (
      <>
        <path d="M4.5 6h8.5v7H4.5V6Z" />
        <path d="m5.5 12 2.2-2.2 1.4 1.4 1.3-1.2 1.6 2" />
        <path d="M15 9.5h4.5v8H10.5v-2" />
      </>
    ),
    "pdf-to-jpg": (
      <>
        <path d="M5.5 4.5h8l3 3V14h-11V4.5Z" />
        <path d="M13.5 4.8v3h3" />
        <path d="M10.5 15.5h9v4h-9v-4Z" />
      </>
    ),
  };

  return (
    <span
      aria-hidden="true"
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${
        live
          ? "border-[#1E6B4A]/28 bg-[#1E6B4A]/12 text-[#8DD0AB]"
          : "border-[#E8DFC8]/10 bg-[#F0EAD6]/[0.025] text-[#F0EAD6]/34"
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.55"
      >
        {paths[slug]}
      </svg>
    </span>
  );
}

function LiveToolCard({ tool }: { tool: PdfToolDefinition }) {
  return (
    <li>
      <Link
        href={tool.route}
        aria-label={`Open ${tool.title} workspace`}
        className="group flex h-full min-h-[9.5rem] flex-col rounded-2xl border border-[#E8DFC8]/10 bg-[#0C1423]/78 p-4 transition duration-200 hover:border-[#C9A84C]/28 hover:bg-[#111C2D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A84C]/55 motion-reduce:transition-none"
      >
        <div className="flex items-start justify-between gap-3">
          <ToolGlyph slug={tool.slug} live />
          <span className="inline-flex items-center gap-1.5 text-[0.62rem] font-bold uppercase tracking-[0.14em] text-[#A8E0C1]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#55B581]" />
            Ready
          </span>
        </div>
        <h2 className="mt-4 font-serif text-xl tracking-[-0.015em] text-[#F0EAD6]">
          {tool.title}
        </h2>
        <p className="mt-1.5 text-xs leading-5 text-[#F0EAD6]/46">
          {tool.description}
        </p>
        <span className="mt-auto pt-4 text-xs font-bold text-[#C9A84C]">
          Open workspace
        </span>
      </Link>
    </li>
  );
}

function PlannedToolCard({ tool }: { tool: PdfToolDefinition }) {
  return (
    <li>
      <article className="flex h-full min-h-[8.5rem] flex-col rounded-2xl border border-[#E8DFC8]/8 bg-[#0A101C]/48 p-4">
        <div className="flex items-start justify-between gap-3">
          <ToolGlyph slug={tool.slug} live={false} />
          <span className="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-[#F0EAD6]/38">
            Soon
          </span>
        </div>
        <h2 className="mt-3 font-serif text-lg text-[#F0EAD6]/68">
          {tool.title}
        </h2>
        <p className="mt-1 text-xs leading-5 text-[#F0EAD6]/36">
          {tool.description}
        </p>
        <span className="mt-auto pt-3 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-[#F0EAD6]/30">
          In development
        </span>
      </article>
    </li>
  );
}

export function PdfToolLauncher({
  showHeading = true,
}: {
  showHeading?: boolean;
}) {
  const liveTools = pdfTools.filter((tool) => tool.status === "live");
  const plannedTools = pdfTools.filter((tool) => tool.status !== "live");

  return (
    <section
      aria-label="PDF tools"
      className="rounded-[24px] border border-[#E8DFC8]/12 bg-[#111A2A]/88 p-4 shadow-[inset_0_1px_0_rgba(240,234,214,0.04),0_28px_80px_rgba(0,0,0,0.22)] sm:p-5"
    >
      {showHeading ? (
        <header className="mb-5">
          <h1 className="font-serif text-3xl leading-tight tracking-[-0.025em] text-[#F0EAD6] sm:text-4xl">
            PDF Tools
          </h1>
          <p className="mt-1.5 text-sm text-[#F0EAD6]/46">
            Choose a workspace to begin.
          </p>
        </header>
      ) : (
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-[0.65rem] font-bold uppercase tracking-[0.18em] text-[#C9A84C]">
              Document tools
            </p>
            <p className="mt-1 text-sm text-[#F0EAD6]/46">
              Choose the task you need.
            </p>
          </div>
          <span className="hidden text-xs text-[#F0EAD6]/34 sm:inline">
            {liveTools.length} ready
          </span>
        </div>
      )}

      <nav aria-label="Available PDF tools">
        <ul className="grid gap-3 sm:grid-cols-3">
          {liveTools.map((tool) => (
            <LiveToolCard key={tool.slug} tool={tool} />
          ))}
        </ul>
      </nav>

      <ul className="mt-3 grid gap-3 sm:grid-cols-2">
        {plannedTools.map((tool) => (
          <PlannedToolCard key={tool.slug} tool={tool} />
        ))}
      </ul>

      <p className="mt-4 border-t border-[#E8DFC8]/8 pt-3 text-center text-[0.7rem] font-semibold text-[#F0EAD6]/42 sm:text-left sm:text-xs">
        Private by design &middot; Browser-only &middot; Cleared after download
      </p>
    </section>
  );
}
