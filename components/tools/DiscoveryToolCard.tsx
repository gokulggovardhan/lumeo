import Link from "next/link";
import { ToolGlyph } from "@/components/pdf/ToolGlyph";
import type { Tile } from "@/lib/tools/tiles";

const PROCESSING_LABEL: Record<Tile["processing"], string> = {
  browser: "On device",
  server: "Server-assisted",
  hybrid: "Adaptive processing",
};

function availabilityLabel(tool: Tile) {
  if (tool.availability === "maintenance") return "Temporarily unavailable";
  if (tool.availability === "coming_soon") return "Coming soon";
  if (tool.availability === "beta") return "Beta";
  return "Available";
}

export function DiscoveryToolCard({
  tool,
  context = "directory",
}: {
  tool: Tile;
  context?: "home" | "directory";
}) {
  const available = tool.availability === "active" || tool.availability === "beta";
  const compact = context === "home";

  const contents = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] border border-[var(--border-hairline)] bg-[var(--surface-base)] text-[var(--atelier-sage-300)] shadow-[inset_0_1px_0_rgba(var(--paper-rgb),0.05)]">
          <ToolGlyph name={tool.glyph} className="h-[18px] w-[18px]" />
        </span>
        <span className="pt-0.5 text-right text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">
          {tool.categoryLabel}
        </span>
      </div>

      <div className={compact ? "mt-4" : "mt-4"}>
        <h3 className="font-serif text-[1.02rem] font-semibold leading-tight text-[var(--text-primary)]">
          {tool.label}
        </h3>
        <p className="mt-1.5 text-[12.5px] leading-[1.45rem] text-[var(--text-secondary)]">
          {tool.description}
        </p>
      </div>

      <div className="mt-auto flex min-h-8 items-end justify-between gap-3 pt-3">
        {!available ? (
          <span className="text-[11px] font-bold text-[var(--atelier-warning)]">
            {availabilityLabel(tool)}
          </span>
        ) : tool.availability === "beta" ? (
          <span className="text-[11px] font-bold text-[var(--text-premium)]">Beta</span>
        ) : (
          <span />
        )}

        {available ? (
          <span className="inline-flex shrink-0 items-center gap-1 text-[12px] font-bold text-[var(--atelier-sage-300)]">
            Open
            <span
              aria-hidden="true"
              className="transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transform-none"
            >
              →
            </span>
          </span>
        ) : null}
      </div>
    </>
  );

  const shell =
    "lumeo-tool-card group flex h-full flex-col rounded-[15px] border border-[var(--border-hairline)] bg-[var(--surface-raised)] p-4 shadow-[var(--shadow-sm)] " +
    (compact ? "min-h-[9.5rem] " : "min-h-[10.25rem] ") +
    (available
      ? "transition duration-200 ease-out hover:-translate-y-0.5 hover:border-[var(--border-subtle)] hover:bg-[var(--surface-elevated)] hover:shadow-[var(--shadow-md)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--champagne-rgb),0.2)] motion-reduce:transform-none"
      : "cursor-default opacity-80");

  if (!available) {
    return (
      <article
        className={shell}
        aria-label={`${tool.label}, ${availabilityLabel(tool)}`}
        data-tool-card={tool.slug}
      >
        {contents}
      </article>
    );
  }

  return (
    <Link
      href={tool.route}
      className={shell}
      aria-label={`Open ${tool.label}. ${PROCESSING_LABEL[tool.processing]}.`}
      data-tool-card={tool.slug}
    >
      {contents}
    </Link>
  );
}
