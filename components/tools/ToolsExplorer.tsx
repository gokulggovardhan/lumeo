"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ToolGlyph } from "@/components/pdf/ToolGlyph";
import {
  DISCOVERY_CATEGORY_LABEL,
  type ToolDiscoveryCategory,
} from "@/lib/tools/catalog";
import { toolMatchesQuery } from "@/lib/tools/discovery-search";
import type { Tile } from "@/lib/tools/tiles";

type CategoryFilter = "all" | ToolDiscoveryCategory;

const FILTERS: { id: CategoryFilter; label: string }[] = [
  { id: "all", label: "All tools" },
  { id: "organize", label: "Organize" },
  { id: "edit", label: "Edit" },
  { id: "convert", label: "Convert" },
  { id: "sign-fill", label: "Sign & Fill" },
  { id: "optimize", label: "Optimize" },
  { id: "recognize", label: "Recognize" },
  { id: "image-tools", label: "Image Tools" },
];

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

function ToolCard({ tool }: { tool: Tile }) {
  const available = tool.availability === "active" || tool.availability === "beta";
  const contents = (
    <>
      <div className="flex items-start justify-between gap-4">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] border border-[var(--border-hairline)] bg-[var(--surface-base)] text-[var(--atelier-sage-300)] shadow-[inset_0_1px_0_rgba(var(--paper-rgb),0.05)]">
          <ToolGlyph name={tool.glyph} className="h-5 w-5" />
        </span>
        <span className="text-[10px] font-bold uppercase tracking-[0.09em] text-[var(--text-muted)]">
          {tool.categoryLabel}
        </span>
      </div>

      <div>
        <h3 className="font-serif text-[1.16rem] font-medium leading-tight text-[var(--text-primary)]">
          {tool.label}
        </h3>
        <p className="mt-2 text-[13px] leading-5 text-[var(--text-secondary)]">{tool.description}</p>
      </div>

      <div className="mt-auto flex min-h-11 items-center justify-between gap-3 pt-3">
        {!available ? (
          <span className="text-xs font-bold text-[var(--atelier-warning)]">
            {availabilityLabel(tool)}
          </span>
        ) : tool.availability === "beta" ? (
          <span className="text-xs font-bold text-[var(--text-premium)]">Beta</span>
        ) : null}
        {available ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 text-sm font-bold text-[var(--atelier-sage-300)]">
            Open
            <span aria-hidden="true" className="transition-transform duration-200 group-hover:translate-x-1 motion-reduce:transform-none">→</span>
          </span>
        ) : null}
      </div>
    </>
  );

  const shell =
    "lumeo-tool-card group flex min-h-[13.5rem] flex-col gap-4 rounded-[16px] border p-5 shadow-[var(--shadow-sm)] " +
    (available
      ? "border-[var(--border-hairline)] bg-[var(--surface-raised)] transition duration-200 ease-out hover:-translate-y-0.5 hover:border-[var(--border-subtle)] hover:bg-[var(--surface-elevated)] hover:shadow-[var(--shadow-md)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--champagne-rgb),0.2)] motion-reduce:transform-none"
      : "border-[var(--border-subtle)] bg-[var(--surface-raised)] opacity-80");

  if (!available) {
    return (
      <article className={shell} aria-label={`${tool.label}, ${availabilityLabel(tool)}`}>
        {contents}
      </article>
    );
  }

  return (
    <Link
      href={tool.route}
      className={shell}
      aria-label={`Open ${tool.label}. ${PROCESSING_LABEL[tool.processing]}.`}
    >
      {contents}
    </Link>
  );
}

function ToolGrid({ tools }: { tools: Tile[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {tools.map((tool) => <ToolCard key={tool.route} tool={tool} />)}
    </div>
  );
}

export function ToolsExplorer({ tools }: { tools: Tile[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = target?.matches("input, textarea, select, [contenteditable='true']");

      if (event.key === "/" && !typing && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        inputRef.current?.focus();
        return;
      }

      if (event.key === "Escape" && document.activeElement === inputRef.current) {
        event.preventDefault();
        if (query) setQuery("");
        else inputRef.current?.blur();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    inputRef.current?.setAttribute("data-search-shortcut-ready", "true");
    return () => {
      inputRef.current?.removeAttribute("data-search-shortcut-ready");
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [query]);

  const shown = useMemo(
    () => tools.filter((tool) => (category === "all" || tool.category === category) && toolMatchesQuery(tool, query)),
    [category, query, tools],
  );
  const available = shown.filter((tool) => tool.availability === "active" || tool.availability === "beta");
  const unavailable = shown.filter((tool) => tool.availability === "maintenance" || tool.availability === "coming_soon");
  const popular = tools.filter((tool) => tool.popular && (tool.availability === "active" || tool.availability === "beta"));

  function resetFilters() {
    setQuery("");
    setCategory("all");
    inputRef.current?.focus();
  }

  return (
    <div>
      <section aria-label="Find a PDF tool" className="rounded-[18px] border border-[var(--border-hairline)] bg-[var(--surface-raised)] p-4 shadow-[var(--shadow-sm)] sm:p-5">
        <div className="mb-2">
          <label htmlFor="pdf-tool-search" className="block text-sm font-bold text-[var(--text-primary)]">
            Search tools and actions
          </label>
          <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">
            Search by task, file type, or capability.
          </p>
        </div>
        <div className="flex min-h-12 items-center gap-3 rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-input)] px-4 transition focus-within:border-[var(--border-focus)] focus-within:shadow-[var(--shadow-focus)]">
          <svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-[var(--text-muted)]">
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            ref={inputRef}
            id="pdf-tool-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Search: merge, rotate, watermark, sign…"
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent py-3 text-[15px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-subtle)]"
          />
          <kbd className="hidden rounded-md border border-[var(--border-hairline)] px-2 py-1 text-[10px] font-bold text-[var(--text-subtle)] sm:inline">/</kbd>
        </div>

        <div className="aura-scrollbar -mx-1 mt-4 flex gap-2 overflow-x-auto px-1 pb-1" aria-label="Filter PDF tools by category">
          {FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              aria-pressed={category === filter.id}
              onClick={() => setCategory(filter.id)}
              className={`lumeo-focus-ring min-h-11 shrink-0 rounded-full border px-4 text-sm font-bold transition duration-200 ${
                category === filter.id
                  ? "border-[var(--border-selected)] bg-[var(--surface-selected)] text-[var(--text-primary)]"
                  : "border-[var(--border-hairline)] bg-[var(--surface-base)] text-[var(--text-secondary)] hover:border-[var(--border-default)] hover:text-[var(--text-primary)]"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </section>

      {popular.length > 0 ? (
        <nav aria-label="Popular PDF tools" className="mt-5 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Popular tools</span>
          {popular.map((tool) => (
            <Link key={tool.route} href={tool.route} className="lumeo-focus-ring inline-flex min-h-11 items-center rounded-full border border-[var(--border-hairline)] bg-[var(--surface-base)] px-4 text-sm font-bold text-[var(--text-secondary)] transition hover:border-[var(--border-selected)] hover:text-[var(--text-primary)]">
              {tool.label}
            </Link>
          ))}
        </nav>
      ) : null}

      <div className="mb-4 mt-7 flex items-center justify-between gap-4">
        <h2 className="font-serif text-xl font-medium text-[var(--text-primary)]">
          {category === "all" ? "All tools" : DISCOVERY_CATEGORY_LABEL[category]}
        </h2>
        <p aria-live="polite" aria-atomic="true" className="text-sm text-[var(--text-muted)]">
          {shown.length} {shown.length === 1 ? "tool" : "tools"}
        </p>
      </div>

      {shown.length === 0 ? (
        <div className="rounded-[16px] border border-[var(--border-hairline)] bg-[var(--surface-raised)] px-6 py-12 text-center">
          <p className="font-serif text-lg text-[var(--text-primary)]">No tools match that search</p>
          <p className="mt-2 text-sm text-[var(--text-muted)]">Try another action or clear the current filters.</p>
          <button type="button" onClick={resetFilters} className="lumeo-focus-ring mt-5 inline-flex min-h-11 items-center rounded-[var(--radius-md)] bg-[var(--action-primary)] px-5 text-sm font-bold text-[var(--text-on-accent)] hover:bg-[var(--action-primary-hover)]">
            Clear search and filters
          </button>
        </div>
      ) : (
        <>
          {available.length > 0 ? <ToolGrid tools={available} /> : null}
          {unavailable.length > 0 ? (
            <section className="mt-10" aria-labelledby="unavailable-tools-heading">
              <div className="mb-4 flex items-center gap-3">
                <h2 id="unavailable-tools-heading" className="font-serif text-lg font-medium text-[var(--text-secondary)]">Not currently available</h2>
                <span aria-hidden="true" className="h-px flex-1 bg-[var(--border-hairline)]" />
              </div>
              <ToolGrid tools={unavailable} />
            </section>
          ) : null}
        </>
      )}

      <aside
        className="mt-9 rounded-[16px] border border-[var(--border-hairline)] bg-[var(--surface-base)] p-4 text-sm leading-6 text-[var(--text-secondary)] sm:p-5"
        aria-label="Processing information"
      >
        <p>
          <strong className="text-[var(--atelier-sage-300)]">Current live tools are browser-based.</strong>{" "}
          Your tool page explains file handling and any browser capability requirements before you begin.
          If a future workflow uses a different processing model, Lumeo will identify it clearly before file selection.
        </p>
      </aside>
    </div>
  );
}
