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
  { id: "all", label: "All" },
  { id: "organize", label: "Pages" },
  { id: "edit", label: "Edit" },
  { id: "convert", label: "Convert" },
  { id: "sign-fill", label: "Sign" },
  { id: "optimize", label: "Compress" },
  { id: "recognize", label: "OCR & Text" },
  { id: "image-tools", label: "Images" },
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
  const available =
    tool.availability === "active" || tool.availability === "beta";
  const status = availabilityLabel(tool);

  const contents = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span
          aria-hidden="true"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] border border-[var(--border-hairline)] bg-[var(--surface-base)] text-[var(--atelier-sage-300)] shadow-[inset_0_1px_0_rgba(var(--paper-rgb),0.05)] transition duration-200 group-hover:-translate-y-0.5 motion-reduce:transform-none sm:h-10 sm:w-10 sm:rounded-[11px]"
        >
          <ToolGlyph name={tool.glyph} className="h-[17px] w-[17px] sm:h-[19px] sm:w-[19px]" />
        </span>
        <span className="hidden rounded-full border border-[var(--border-hairline)] px-2 py-1 text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)] sm:inline-flex">
          {tool.categoryLabel}
        </span>
      </div>

      <div className="min-w-0">
        <h3 className="font-serif text-[0.94rem] font-semibold leading-tight text-[var(--text-primary)] sm:text-[1.02rem]">
          {tool.label}
        </h3>
        <p className="mt-1.5 hidden line-clamp-2 text-[12.5px] leading-[1.15rem] text-[var(--text-secondary)] sm:block">
          {tool.description}
        </p>
      </div>

      <div className="mt-auto flex min-h-8 items-center justify-between gap-2 pt-1.5 sm:min-h-9 sm:gap-3 sm:pt-2">
        <span
          className={
            tool.availability === "beta"
              ? "text-[10px] font-bold text-[var(--text-premium)] sm:text-[11px]"
              : available
                ? "text-[10px] font-semibold text-[var(--text-muted)] sm:text-[11px]"
                : "text-[10px] font-bold text-[var(--atelier-warning)] sm:text-[11px]"
          }
        >
          {available ? (tool.availability === "beta" ? "Beta" : PROCESSING_LABEL[tool.processing]) : status}
        </span>
        {available ? (
          <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-bold text-[var(--atelier-sage-300)] sm:text-xs">
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
    "lumeo-tool-card group flex min-h-[8rem] flex-col gap-2 rounded-[14px] border p-3 shadow-[var(--shadow-sm)] sm:min-h-[10rem] sm:gap-3 sm:rounded-[15px] sm:p-4 " +
    (available
      ? "border-[var(--border-hairline)] bg-[var(--surface-raised)] transition duration-200 ease-out hover:-translate-y-0.5 hover:border-[var(--border-subtle)] hover:bg-[var(--surface-elevated)] hover:shadow-[var(--shadow-md)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--champagne-rgb),0.2)] motion-reduce:transform-none"
      : "border-[var(--border-subtle)] bg-[var(--surface-raised)] opacity-80");

  if (!available) {
    return (
      <article className={shell} aria-label={`${tool.label}, ${status}`}>
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
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
      {tools.map((tool) => (
        <ToolCard key={tool.route} tool={tool} />
      ))}
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
      const typing = target?.matches(
        "input, textarea, select, [contenteditable='true']",
      );

      if (
        event.key === "/" &&
        !typing &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey
      ) {
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
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [query]);

  const shown = useMemo(
    () =>
      tools.filter(
        (tool) =>
          (category === "all" || tool.category === category) &&
          toolMatchesQuery(tool, query),
      ),
    [category, query, tools],
  );

  const available = shown.filter(
    (tool) => tool.availability === "active" || tool.availability === "beta",
  );
  const unavailable = shown.filter(
    (tool) =>
      tool.availability === "maintenance" ||
      tool.availability === "coming_soon",
  );

  function resetFilters() {
    setQuery("");
    setCategory("all");
    inputRef.current?.focus();
  }

  return (
    <div>
      <section
        aria-label="Find a PDF tool"
        className="rounded-[16px] border border-[var(--border-hairline)] bg-[var(--surface-raised)] p-3.5 shadow-[var(--shadow-sm)] sm:p-4"
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <label htmlFor="pdf-tool-search" className="sr-only">
            Search tools and actions
          </label>
          <div className="flex min-h-11 flex-1 items-center gap-3 rounded-[11px] border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 transition focus-within:border-[var(--border-focus)] focus-within:shadow-[var(--shadow-focus)]">
            <svg
              aria-hidden="true"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="shrink-0 text-[var(--text-muted)]"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              ref={inputRef}
              id="pdf-tool-search"
              aria-label="Search tools and actions"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder="Search: join, reduce size, write, signature…"
              autoComplete="off"
              className="min-w-0 flex-1 bg-transparent py-2.5 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-subtle)]"
            />
            <kbd className="hidden rounded-md border border-[var(--border-hairline)] px-2 py-1 text-[10px] font-bold text-[var(--text-subtle)] sm:inline">
              /
            </kbd>
          </div>

          <div
            className="aura-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 lg:max-w-[58%]"
            aria-label="Filter PDF tools by category"
          >
            {FILTERS.map((filter) => (
              <button
                key={filter.id}
                type="button"
                aria-pressed={category === filter.id}
                onClick={() => setCategory(filter.id)}
                className={`lumeo-focus-ring min-h-10 shrink-0 rounded-full border px-3.5 text-xs font-bold transition duration-200 ${
                  category === filter.id
                    ? "border-[var(--border-selected)] bg-[var(--surface-selected)] text-[var(--text-primary)]"
                    : "border-[var(--border-hairline)] bg-[var(--surface-base)] text-[var(--text-secondary)] hover:border-[var(--border-default)] hover:text-[var(--text-primary)]"
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        <p className="mt-2.5 text-[11px] leading-5 text-[var(--text-muted)]">
          Try natural actions such as “join PDFs”, “reduce size”, “write on PDF”, or “signature”.
        </p>
      </section>

      <div className="mb-3 mt-5 flex items-center justify-between gap-4">
        <h2 className="font-serif text-lg font-semibold text-[var(--text-primary)]">
          {category === "all" ? "All PDF tools" : DISCOVERY_CATEGORY_LABEL[category]}
        </h2>
        <p
          aria-live="polite"
          aria-atomic="true"
          className="text-xs font-semibold text-[var(--text-muted)]"
        >
          {shown.length} {shown.length === 1 ? "tool" : "tools"}
        </p>
      </div>

      {shown.length === 0 ? (
        <div className="rounded-[15px] border border-[var(--border-hairline)] bg-[var(--surface-raised)] px-5 py-9 text-center">
          <p className="font-serif text-lg text-[var(--text-primary)]">
            No tools match that search
          </p>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Try another action, file type, or category.
          </p>
          <button
            type="button"
            onClick={resetFilters}
            className="lumeo-focus-ring mt-4 inline-flex min-h-11 items-center rounded-[var(--radius-md)] bg-[var(--action-primary)] px-5 text-sm font-bold text-[var(--text-on-accent)] hover:bg-[var(--action-primary-hover)]"
          >
            Clear search and filters
          </button>
        </div>
      ) : (
        <>
          {available.length > 0 ? <ToolGrid tools={available} /> : null}
          {unavailable.length > 0 ? (
            <section className="mt-8" aria-labelledby="unavailable-tools-heading">
              <div className="mb-3 flex items-center gap-3">
                <h2
                  id="unavailable-tools-heading"
                  className="font-serif text-base font-semibold text-[var(--text-secondary)]"
                >
                  Not currently available
                </h2>
                <span
                  aria-hidden="true"
                  className="h-px flex-1 bg-[var(--border-hairline)]"
                />
              </div>
              <ToolGrid tools={unavailable} />
            </section>
          ) : null}
        </>
      )}

      <aside
        className="mt-6 flex items-start gap-2.5 rounded-[13px] border border-[var(--border-hairline)] bg-[var(--surface-base)] px-4 py-3 text-xs leading-5 text-[var(--text-secondary)]"
        aria-label="Processing information"
      >
        <span aria-hidden="true" className="mt-0.5 text-[var(--atelier-sage-300)]">
          ●
        </span>
        <p>
          <strong className="text-[var(--text-primary)]">
            Local-first by default.
          </strong>{" "}
          Current live tools process documents in your browser. If a workflow ever needs a different processing model, Lumeo identifies it before file selection.
        </p>
      </aside>
    </div>
  );
}
