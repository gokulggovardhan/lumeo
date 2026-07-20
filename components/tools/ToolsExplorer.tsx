"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { ToolGlyph } from "@/components/pdf/ToolGlyph";
import type { ToolAction, ToolProcessing } from "@/lib/tools/catalog";
import type { ResolvedTool } from "@/lib/tools/resolve";

const PROCESSING_TAG: Record<ToolProcessing, string> = {
  browser: "Private",
  server: "Server",
  hybrid: "Adaptive",
};

function actionMatches(action: ToolAction, q: string) {
  return action.label.toLowerCase().includes(q);
}

function toolMatches(tool: ResolvedTool, q: string) {
  if (!q) return true;
  return (
    tool.name.toLowerCase().includes(q) ||
    tool.plain.toLowerCase().includes(q) ||
    tool.tag.toLowerCase().includes(q) ||
    tool.actions.some((action) => actionMatches(action, q))
  );
}

function ProcessingLine({ tool }: { tool: ResolvedTool }) {
  const dotColor =
    tool.processing === "browser"
      ? "var(--atelier-sage-300)"
      : tool.processing === "server"
        ? "var(--atelier-brass-300)"
        : "var(--atelier-info)";
  return (
    <span className="inline-flex items-center gap-2 text-[11.5px] text-[var(--text-muted)]">
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full" style={{ background: dotColor }} />
      {PROCESSING_TAG[tool.processing]}
    </span>
  );
}

function ToolCard({
  tool,
  query,
  animate,
  index,
}: {
  tool: ResolvedTool;
  query: string;
  animate: boolean;
  index: number;
}) {
  const openable = Boolean(tool.effectivePrimaryRoute);
  const soon = tool.availability === "soon" || !openable;

  // A tool can bundle several genuinely separate destinations (Compose is
  // both Merge and Split -- two different routes, two different jobs).
  // Picking one as "the" primaryRoute and burying the other behind a search
  // was the actual bug: clicking the card always opened Merge, and Split was
  // only reachable by typing its name into the search box first. Instead,
  // every distinct live route gets its own equal-weight button up front --
  // first action pointing at a given route names that button (so "Split",
  // not one of its later sub-modes like "Split by range").
  const destinations: ToolAction[] = [];
  const seenRoutes = new Set<string>();
  for (const action of tool.actions) {
    if (!action.live || !action.route || seenRoutes.has(action.route)) continue;
    seenRoutes.add(action.route);
    destinations.push(action);
  }

  const extraActions = tool.actions.filter(
    (action) => !destinations.some((dest) => dest.slug === action.slug),
  );

  const inner = (
    <>
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[11px] border border-[var(--border-hairline)] bg-[var(--surface-base)] text-[var(--atelier-sage-300)]">
          <ToolGlyph name={tool.key} className="h-[19px] w-[19px]" />
        </span>
        <span className="min-w-0">
          <span className="block font-serif text-[1.05rem] font-medium leading-none tracking-[-0.01em] text-[var(--text-primary)]">
            {tool.name}
          </span>
          <span className="mt-1 block font-mono text-[10px] tracking-[0.01em] text-[var(--text-muted)]">
            {tool.plain}
          </span>
        </span>
      </div>

      <p className="text-[12.5px] leading-relaxed text-[var(--text-secondary)]">{tool.tag}</p>

      {destinations.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {destinations.map((action) => {
            const hit = query.length > 0 && actionMatches(action, query);
            return (
              <Link
                key={action.slug}
                href={action.route as string}
                className={`inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border px-3 py-1.5 text-[12.5px] font-semibold transition ${
                  hit
                    ? "border-[var(--atelier-sage-500)] bg-[rgba(var(--atelier-sage-rgb),0.14)] text-[var(--text-primary)]"
                    : "border-[var(--border-hairline)] bg-[var(--surface-base)] text-[var(--text-secondary)] hover:border-[var(--atelier-sage-500)] hover:text-[var(--text-primary)]"
                }`}
              >
                {action.label}
                <span aria-hidden="true" className="text-[var(--text-subtle)] transition-transform group-hover:translate-x-0.5">→</span>
              </Link>
            );
          })}
        </div>
      ) : null}

      {extraActions.length > 0 ? (
        <div className="mt-auto flex flex-wrap gap-x-2.5 gap-y-1 text-[11px] leading-6 text-[var(--text-muted)]">
          {extraActions.map((action) => {
            const hit = query.length > 0 && actionMatches(action, query);
            const style = hit ? { color: "var(--atelier-sage-300)" } : undefined;

            if (action.live && action.route) {
              return (
                <Link
                  key={action.slug}
                  href={action.route}
                  className="inline-flex items-center rounded-full text-[var(--text-secondary)] underline decoration-transparent underline-offset-2 transition hover:text-[var(--text-primary)] hover:decoration-[var(--atelier-sage-400)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--atelier-sage-500)]"
                  style={style}
                >
                  <span aria-hidden="true" className="mr-1.5 h-1 w-1 rounded-full bg-[var(--atelier-sage-400)]" />
                  {action.label}
                </Link>
              );
            }

            return (
              <span key={action.slug} className="inline-flex items-center" style={style}>
                {action.label}
              </span>
            );
          })}
        </div>
      ) : null}

      {!soon ? (
        <div className="flex items-center justify-between pt-0.5">
          <ProcessingLine tool={tool} />
        </div>
      ) : null}
    </>
  );

  const shell =
    "lumeo-tool-card group relative flex flex-col gap-2.5 rounded-[14px] border p-4 " +
    (soon
      ? "border-dashed border-[var(--border-subtle)] bg-transparent"
      : "border-[var(--border-hairline)] bg-[var(--surface-raised)] transition duration-300 [transition-timing-function:var(--lumeo-spring)]") +
    (animate ? " lumeo-fade-up" : "");

  const style = animate ? { animationDelay: `${Math.min(index, 7) * 45}ms` } : undefined;

  return (
    <div id={`tool-${tool.key}`} className={shell} style={style} aria-disabled={soon ? "true" : undefined}>
      {inner}
      {soon ? (
        <span className="inline-flex items-center gap-1.5 self-start text-[12px] text-[var(--text-muted)]">
          Notify me
          <span aria-hidden="true">→</span>
        </span>
      ) : null}
    </div>
  );
}

function SectionHead({ label, soon = false }: { label: string; soon?: boolean }) {
  return (
    <div className="mb-4 mt-8 flex items-center gap-3 first:mt-0">
      <h2 className="font-serif text-[0.95rem] font-medium tracking-[0.01em] text-[var(--text-muted)]">{label}</h2>
      <span aria-hidden="true" className="h-px flex-1 bg-[var(--border-hairline)]" />
      {soon ? (
        <span className="rounded-full border border-[rgba(var(--champagne-rgb),0.3)] px-2.5 py-[3px] font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--text-premium)]">
          In development
        </span>
      ) : null}
    </div>
  );
}

export function ToolsExplorer({ tools }: { tools: ResolvedTool[] }) {
  const [query, setQuery] = useState("");
  const [touched, setTouched] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const q = query.trim().toLowerCase();

  const jumps = useMemo(() => {
    if (!q) return [];
    const out: { action: ToolAction; tool: ResolvedTool }[] = [];
    for (const tool of tools) {
      for (const action of tool.actions) {
        if (actionMatches(action, q)) out.push({ action, tool });
      }
    }
    return out.slice(0, 8);
  }, [q, tools]);

  // A tool only counts as "available" once it both carries the design's
  // available flag AND actually has somewhere live to send someone --
  // otherwise an admin disabling every action underneath it would leave a
  // dead-looking card sitting in the wrong section.
  const shownAvailable = tools
    .filter((tool) => tool.availability === "available" && tool.effectivePrimaryRoute)
    .filter((tool) => toolMatches(tool, q));
  const shownSoon = tools
    .filter((tool) => tool.availability === "soon" || !tool.effectivePrimaryRoute)
    .filter((tool) => toolMatches(tool, q));
  const nothing = shownAvailable.length === 0 && shownSoon.length === 0;

  function scrollToTool(key: string) {
    const el = document.getElementById(`tool-${key}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.remove("lumeo-tool-flash");
    void el.offsetWidth;
    el.classList.add("lumeo-tool-flash");
    window.setTimeout(() => el.classList.remove("lumeo-tool-flash"), 1400);
  }

  return (
    <div>
      <div className="max-w-[560px]">
        <div className="flex items-center gap-3 rounded-[13px] border border-[var(--border-subtle)] bg-[var(--surface-base)] px-4 py-3.5 transition focus-within:border-[var(--atelier-sage-500)] focus-within:shadow-[0_0_0_4px_rgba(var(--atelier-sage-rgb),0.12)]">
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-[var(--text-muted)]">
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              if (!touched) setTouched(true);
            }}
            placeholder="Search an action — “rotate”, “watermark”, “sign”…"
            aria-label="Search tools"
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent text-[15px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-subtle)]"
          />
        </div>

        {jumps.length > 0 ? (
          <div className="mt-3">
            <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--text-subtle)]">Jump to</p>
            <div className="flex flex-wrap gap-2">
              {jumps.map(({ action, tool }) =>
                action.route && action.live ? (
                  <Link
                    key={`${tool.key}-${action.slug}`}
                    href={action.route}
                    className="inline-flex items-center gap-2 rounded-full border border-[var(--border-subtle)] px-3 py-1.5 text-[12.5px] text-[var(--text-secondary)] transition hover:border-[var(--atelier-sage-500)] hover:text-[var(--text-primary)]"
                  >
                    {action.label}
                    <span aria-hidden="true" className="text-[var(--text-subtle)]">→</span>
                    <span className="font-serif text-[var(--atelier-sage-300)]">{tool.name}</span>
                  </Link>
                ) : (
                  <button
                    key={`${tool.key}-${action.slug}`}
                    type="button"
                    onClick={() => scrollToTool(tool.key)}
                    className="inline-flex items-center gap-2 rounded-full border border-[var(--border-subtle)] px-3 py-1.5 text-[12.5px] text-[var(--text-secondary)] transition hover:border-[var(--atelier-sage-500)] hover:text-[var(--text-primary)]"
                  >
                    {action.label}
                    <span aria-hidden="true" className="text-[var(--text-subtle)]">→</span>
                    <span className="font-serif text-[var(--atelier-sage-300)]">{tool.name}</span>
                  </button>
                ),
              )}
            </div>
          </div>
        ) : null}
      </div>

      {nothing ? (
        <div className="py-14 text-center">
          <p className="font-serif text-lg text-[var(--text-secondary)]">Nothing matches that yet</p>
          <p className="mt-1.5 text-sm text-[var(--text-muted)]">Try a broader term, or tell us what you need built.</p>
        </div>
      ) : null}

      {shownAvailable.length > 0 ? (
        <>
          <SectionHead label="Available now" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {shownAvailable.map((tool, index) => (
              <ToolCard key={tool.key} tool={tool} query={q} animate={!touched} index={index} />
            ))}
          </div>
        </>
      ) : null}

      {shownSoon.length > 0 ? (
        <>
          <SectionHead label="Coming soon" soon />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {shownSoon.map((tool, index) => (
              <ToolCard key={tool.key} tool={tool} query={q} animate={!touched} index={shownAvailable.length + index} />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
