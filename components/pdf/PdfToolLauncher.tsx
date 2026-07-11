import Link from "next/link";
import { getStatusLabel, pdfTools } from "./PdfToolRegistry";
import type { PdfToolDefinition, PdfToolStatus } from "./PdfToolRegistry";
import { PdfTrustRail } from "./PdfTrustRail";

function ToolGlyph({ status }: { status: PdfToolStatus }) {
  const accent =
    status === "live"
      ? "text-[#1E6B4A]"
      : status === "coming-next"
        ? "text-[#C9A84C]"
        : "text-[#F0EAD6]/55";

  return (
    <span
      className={`flex h-11 w-11 items-center justify-center rounded-xl border border-[#E8DFC8]/12 bg-[#0A101C]/70 ${accent}`}
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none">
        <path
          d="M7 3.75h7.2L18 7.55v12.7H7z"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.6"
        />
        <path
          d="M14 4v4h4"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.6"
        />
        <path
          d="M9.6 12h4.8M9.6 15.2h3.1"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.6"
        />
      </svg>
    </span>
  );
}

function ToolCard({ tool }: { tool: PdfToolDefinition }) {
  const isLive = tool.status === "live";

  return (
    <Link
      href={tool.route}
      className={`group flex min-h-[11rem] flex-col rounded-xl border p-4 shadow-[0_18px_55px_rgba(0,0,0,0.2)] transition duration-300 hover:-translate-y-0.5 ${
        isLive
          ? "border-[#E8DFC8]/12 bg-gradient-to-br from-[#10192A] via-[#0D1524] to-[#090F1A] hover:border-[#C9A84C]/34"
          : "border-[#E8DFC8]/8 bg-[#0A101C]/58 opacity-82 hover:border-[#E8DFC8]/18 hover:opacity-100"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <ToolGlyph status={tool.status} />
        <span
          className={`rounded-full border px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-[0.14em] ${
            isLive
              ? "border-[#1E6B4A]/30 bg-[#1E6B4A]/12 text-[#A8E0C1]"
              : tool.status === "coming-next"
                ? "border-[#C9A84C]/28 bg-[#C9A84C]/10 text-[#E8DFC8]"
                : "border-[#E8DFC8]/12 bg-[#F0EAD6]/5 text-[#F0EAD6]/42"
          }`}
        >
          {getStatusLabel(tool.status)}
        </span>
      </div>

      <div className="mt-4">
        <h2 className="font-serif text-xl tracking-[-0.02em] text-[#F0EAD6]">
          {tool.title}
        </h2>
        <p className="mt-2 text-sm leading-6 text-[#F0EAD6]/50">
          {tool.description}
        </p>
      </div>

      <ul className="mt-3 space-y-1.5 text-xs text-[#F0EAD6]/42">
        {tool.bullets.slice(0, 3).map((bullet) => (
          <li key={bullet} className="flex gap-2">
            <span className="mt-1.5 h-1 w-1 rounded-full bg-[#C9A84C]/70" />
            <span>{bullet}</span>
          </li>
        ))}
      </ul>

      <div className="mt-auto flex items-center justify-between pt-4">
        <span className="text-xs font-semibold text-[#F0EAD6]/45">
          {tool.browserNote}
        </span>
        <span className="text-xs font-bold text-[#C9A84C] transition group-hover:translate-x-0.5">
          Open
        </span>
      </div>
    </Link>
  );
}

export function PdfToolLauncher() {
  const availableTools = pdfTools.filter((tool) => tool.status === "live");
  const upcomingTools = pdfTools.filter((tool) => tool.status !== "live");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <section className="shrink-0">
        <h1 className="max-w-4xl font-serif text-3xl leading-tight tracking-[-0.02em] text-[#F0EAD6] sm:text-4xl lg:text-[2.8rem]">
          PDF tools, ready when you need them.
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#F0EAD6]/55">
          Start with the live browser-first tools. Planned workspaces stay visible without competing for attention.
        </p>
      </section>

      <section className="mt-5 grid min-h-0 flex-1 gap-5 lg:grid-rows-[auto_auto]">
        <div>
          <p className="mb-3 text-xs font-semibold text-[#F0EAD6]/50">Available now</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {availableTools.map((tool) => (
              <ToolCard key={tool.slug} tool={tool} />
            ))}
          </div>
        </div>
        <div>
          <p className="mb-3 text-xs font-semibold text-[#F0EAD6]/50">Coming next</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {upcomingTools.map((tool) => (
              <ToolCard key={tool.slug} tool={tool} />
            ))}
          </div>
        </div>
      </section>

      <div className="mt-4 shrink-0">
        <PdfTrustRail compact />
      </div>
    </div>
  );
}
