import Link from "next/link";
import type { ReactNode } from "react";
import { pdfTools } from "./PdfToolRegistry";
import type {
  PdfToolDefinition,
  PdfToolSlug,
} from "./PdfToolRegistry";

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
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${
        live
          ? "border-[#1E6B4A]/28 bg-[#1E6B4A]/10 text-[#7CC59E]"
          : "border-[#E8DFC8]/10 bg-[#F0EAD6]/[0.025] text-[#F0EAD6]/32"
      }`}
    >
      <svg
        aria-hidden="true"
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
    <Link
      href={tool.route}
      className="group relative flex min-h-[9rem] flex-col overflow-hidden rounded-2xl border border-[#E8DFC8]/12 bg-[#111A2A] p-5 shadow-[0_18px_55px_rgba(0,0,0,0.16)] transition duration-300 hover:-translate-y-0.5 hover:border-[#C9A84C]/35 hover:bg-[#142033] focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/45"
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#C9A84C]/45 to-transparent opacity-0 transition group-hover:opacity-100" />

      <div className="flex items-start justify-between gap-4">
        <ToolGlyph slug={tool.slug} live />
        <span className="inline-flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#A8E0C1]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#55B581]" />
          Available
        </span>
      </div>

      <div className="mt-5">
        <h2 className="font-serif text-2xl tracking-[-0.02em] text-[#F0EAD6]">
          {tool.title}
        </h2>
        <p className="mt-1.5 max-w-sm text-sm leading-6 text-[#F0EAD6]/52">
          {tool.description}
        </p>
      </div>

      <span className="mt-auto inline-flex items-center gap-2 pt-5 text-xs font-semibold text-[#C9A84C]">
        Open workspace
        <span aria-hidden="true" className="transition group-hover:translate-x-1">
          -&gt;
        </span>
      </span>
    </Link>
  );
}

function PlannedToolCard({ tool }: { tool: PdfToolDefinition }) {
  return (
    <article className="flex items-center justify-between gap-4 rounded-xl border border-[#E8DFC8]/8 bg-[#0A101C]/58 px-4 py-3.5 text-[#F0EAD6]/46">
      <div className="flex min-w-0 items-center gap-3">
        <ToolGlyph slug={tool.slug} live={false} />
        <div className="min-w-0">
          <h2 className="font-serif text-lg text-[#F0EAD6]/68">{tool.title}</h2>
          <p className="mt-0.5 text-xs leading-5 text-[#F0EAD6]/34">
            {tool.description}
          </p>
        </div>
      </div>
      <span className="shrink-0 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-[#C9A84C]/58">
        In development
      </span>
    </article>
  );
}

export function PdfToolLauncher({
  showHeading = true,
}: {
  showHeading?: boolean;
}) {
  const availableTools = pdfTools.filter((tool) => tool.status === "live");
  const upcomingTools = pdfTools.filter((tool) => tool.status !== "live");

  return (
    <div>
      {showHeading ? (
        <header className="mb-7 max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#C9A84C]">
            PDF workspace
          </p>
          <h1 className="mt-2 font-serif text-3xl leading-tight tracking-[-0.025em] text-[#F0EAD6] sm:text-4xl lg:text-[2.65rem]">
            Choose a PDF tool.
          </h1>
          <p className="mt-2 text-sm leading-6 text-[#F0EAD6]/50 sm:text-base">
            Start working immediately with Lumeo&apos;s available browser-first tools.
          </p>
        </header>
      ) : null}

      <section aria-labelledby="available-tools-heading">
        <div className="mb-3 flex items-center justify-between gap-4">
          <h2
            id="available-tools-heading"
            className="text-xs font-semibold uppercase tracking-[0.16em] text-[#F0EAD6]/48"
          >
            Available now
          </h2>
          <span className="hidden text-xs text-[#F0EAD6]/32 sm:inline">
            Select a workspace to begin
          </span>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {availableTools.map((tool) => (
            <LiveToolCard key={tool.slug} tool={tool} />
          ))}
        </div>
      </section>

      <section aria-labelledby="upcoming-tools-heading" className="mt-6">
        <h2
          id="upcoming-tools-heading"
          className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-[#F0EAD6]/38"
        >
          Coming next
        </h2>

        <div className="grid gap-3 md:grid-cols-2">
          {upcomingTools.map((tool) => (
            <PlannedToolCard key={tool.slug} tool={tool} />
          ))}
        </div>
      </section>

      <p className="mt-6 border-t border-[#E8DFC8]/10 pt-4 text-xs font-medium text-[#F0EAD6]/42">
        Private by design &middot; Browser-first where possible &middot; Clear file handling
      </p>
    </div>
  );
}
