import Link from "next/link";
import { PublicCatalogPageShell } from "@/components/public/PublicCatalogPageShell";
import { getStatusLabel } from "./PdfToolRegistry";
import type { PdfToolDefinition } from "./PdfToolRegistry";
import { PdfTrustRail } from "./PdfTrustRail";

function StatusBadge({ tool }: { tool: PdfToolDefinition }) {
  return (
    <span className="inline-flex rounded-full border border-[#C9A84C]/24 bg-[#C9A84C]/10 px-3 py-1 text-[0.65rem] font-bold uppercase tracking-[0.16em] text-[#E8DFC8]">
      {getStatusLabel(tool.status)}
    </span>
  );
}

export function PdfToolPlaceholder({ tool }: { tool: PdfToolDefinition }) {
  return (
    <PublicCatalogPageShell
      maxWidth="max-w-[1700px]"
      mainClassName="min-h-screen bg-[var(--surface-canvas)] text-[var(--lumeo-paper-100)] lg:flex lg:h-dvh lg:flex-col lg:overflow-hidden"
      contentClassName="px-5 py-5 sm:px-8 lg:flex lg:w-[95vw] lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-hidden lg:px-8 lg:py-2 2xl:px-10"
    >
      <section className="shrink-0">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-serif text-4xl leading-tight tracking-[-0.02em] text-[var(--lumeo-paper-50)] sm:text-5xl lg:text-[2.85rem]">
              {tool.title}
            </h1>
            <p className="mt-0.5 max-w-2xl text-base leading-5 text-[var(--lumeo-paper-400)]">
              {tool.description}
            </p>
          </div>
          <StatusBadge tool={tool} />
        </div>
      </section>

      <section className="mt-3 grid min-h-0 flex-1 gap-5 lg:grid-cols-[minmax(0,1.65fr)_minmax(340px,0.72fr)] lg:overflow-hidden 2xl:grid-cols-[minmax(0,1.9fr)_minmax(360px,0.72fr)]">
        <div className="flex min-h-0 flex-col rounded-[var(--radius-2xl)] border border-[var(--border-subtle)] bg-[var(--surface-base)] p-4 shadow-[var(--shadow-md)]">
          <div className="rounded-[var(--radius-2xl)] border border-dashed border-[var(--border-premium)] bg-[rgba(var(--lumeo-paper-rgb),0.045)] p-7 text-center shadow-[inset_0_1px_0_rgba(240,234,214,0.05)] sm:p-9 lg:flex-1 lg:content-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--border-premium)] bg-[rgba(var(--lumeo-aura-rgb),0.1)] text-[var(--lumeo-gold-300)]">
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-7 w-7"
                fill="none"
              >
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
            </div>
            <h2 className="mt-5 font-serif text-3xl tracking-[-0.02em] text-[var(--lumeo-paper-50)]">
              Available soon
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[var(--lumeo-paper-400)]">
              {tool.engineNote} Planned input: {tool.accepted}.
            </p>
            <div className="mt-5 inline-flex rounded-full border border-[rgba(var(--lumeo-seal-rgb),0.3)] bg-[rgba(var(--lumeo-seal-rgb),0.14)] px-4 py-2 text-xs font-bold text-[var(--lumeo-paper-50)]">
              Engine not active yet
            </div>
          </div>

          <div className="mt-4">
            <PdfTrustRail compact />
          </div>
        </div>

        <aside className="flex min-h-0 flex-col rounded-[var(--radius-2xl)] border border-[var(--border-subtle)] bg-[var(--surface-base)] p-4 shadow-[var(--shadow-md)]">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-3">
            <div>
              <p className="aura-text-label text-[var(--lumeo-gold-300)]">
                Foundation
              </p>
              <h2 className="mt-1 font-serif text-2xl text-[var(--lumeo-paper-50)]">
                Planned controls
              </h2>
            </div>
          </div>

          <ul className="mt-4 min-h-0 flex-1 space-y-2 overflow-hidden text-sm text-[var(--lumeo-paper-400)]">
            {tool.bullets.map((bullet) => (
              <li
                key={bullet}
                className="flex items-center gap-3 rounded-xl border border-[var(--border-subtle)] bg-[rgba(var(--lumeo-paper-rgb),0.045)] px-3 py-2"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--lumeo-gold-300)]" />
                <span>{bullet}</span>
              </li>
            ))}
          </ul>

          <div className="mt-4 rounded-xl border border-[var(--border-subtle)] bg-[rgba(var(--lumeo-paper-rgb),0.045)] p-3">
            <p className="text-xs font-semibold text-[var(--lumeo-paper-200)]">
              {tool.browserNote}
            </p>
            <p className="mt-1 text-xs leading-5 text-[var(--lumeo-paper-400)]">
              Processing will be added only when it can be represented honestly
              in the product.
            </p>
          </div>

          <Link
            href="/pdf-tools"
            className="mt-4 inline-flex h-10 items-center justify-center rounded-full border border-[var(--border-subtle)] px-4 text-xs font-bold text-[var(--lumeo-paper-200)] transition hover:border-[var(--border-premium)] hover:text-[var(--lumeo-paper-50)]"
          >
            View all tools
          </Link>
        </aside>
      </section>
    </PublicCatalogPageShell>
  );
}
