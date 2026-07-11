// PdfToolLauncher.tsx
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
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
        live
          ? "bg-[#1E6B4A]/12 text-[#73B993]"
          : "bg-[#F0EAD6]/[0.035] text-[#F0EAD6]/34"
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-[1.15rem] w-[1.15rem]"
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

function dividerClass(index: number) {
  if (index === 0 || index === 1) {
    return "border-b border-[#E8DFC8]/10 sm:border-r lg:border-b-0";
  }

  if (index === 2) {
    return "border-b border-[#E8DFC8]/10 lg:border-b-0 lg:border-r";
  }

  if (index === 3) {
    return "border-b border-[#E8DFC8]/10 sm:border-b-0 sm:border-r";
  }

  return "";
}

function PdfToolDockItem({
  tool,
  index,
}: {
  tool: PdfToolDefinition;
  index: number;
}) {
  const live = tool.status === "live";
  const content = (
    <>
      <ToolGlyph slug={tool.slug} live={live} />
      <span className="min-w-0 flex-1">
        <span
          className={`block truncate font-serif text-[1.06rem] leading-tight tracking-[-0.01em] ${
            live ? "text-[#F0EAD6]" : "text-[#F0EAD6]/62"
          }`}
        >
          {tool.title}
        </span>
        {!live ? (
          <span className="mt-1 block text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-[#F0EAD6]/38">
            Soon
          </span>
        ) : null}
      </span>
    </>
  );

  return (
    <li className={dividerClass(index)}>
      {live ? (
        <Link
          href={tool.route}
          aria-label={`Open ${tool.title} workspace`}
          className="flex min-h-[4.75rem] w-full items-center gap-3 px-4 py-3 transition-colors duration-200 hover:bg-[#F0EAD6]/[0.035] focus-visible:bg-[#F0EAD6]/[0.045] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#C9A84C]/55 motion-reduce:transition-none sm:min-h-[5.5rem] sm:flex-col sm:items-start sm:justify-center sm:px-5 lg:min-h-[7rem] lg:items-center lg:px-4 xl:flex-row xl:justify-start xl:px-5"
        >
          {content}
        </Link>
      ) : (
        <div
          aria-label={`${tool.title}, soon`}
          className="flex min-h-[4.75rem] w-full items-center gap-3 px-4 py-3 sm:min-h-[5.5rem] sm:flex-col sm:items-start sm:justify-center sm:px-5 lg:min-h-[7rem] lg:items-center lg:px-4 xl:flex-row xl:justify-start xl:px-5"
        >
          {content}
        </div>
      )}
    </li>
  );
}

export function PdfToolLauncher({
  showHeading = true,
}: {
  showHeading?: boolean;
}) {
  return (
    <div>
      {showHeading ? (
        <header className="mb-5">
          <h1 className="font-serif text-3xl leading-tight tracking-[-0.025em] text-[#F0EAD6] sm:text-4xl">
            PDF Tools
          </h1>
          <p className="mt-1.5 text-sm text-[#F0EAD6]/46">
            Choose a tool to begin.
          </p>
        </header>
      ) : null}

      <nav aria-label="PDF tools">
        <ul className="grid overflow-hidden rounded-[20px] border border-[#E8DFC8]/13 bg-[#111A2A] shadow-[inset_0_1px_0_rgba(240,234,214,0.035)] sm:grid-cols-3 lg:grid-cols-5">
          {pdfTools.map((tool, index) => (
            <PdfToolDockItem key={tool.slug} tool={tool} index={index} />
          ))}
        </ul>
      </nav>

      <p className="mt-3 text-center text-[0.7rem] font-medium tracking-[0.02em] text-[#F0EAD6]/34 sm:text-left sm:text-xs">
        Private by design &middot; Browser-first where possible &middot; Clear file handling
      </p>
    </div>
  );
}