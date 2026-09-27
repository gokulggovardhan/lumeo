"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DiscoveryToolCard } from "@/components/tools/DiscoveryToolCard";
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
  { id: "sign-fill", label: "Sign & Fill" },
  { id: "optimize", label: "Optimize" },
  { id: "convert", label: "Convert" },
  { id: "recognize", label: "Recognize" },
  { id: "image-tools", label: "Image Tools" },
];

const CATEGORY_ORDER = new Map(
  FILTERS.filter((filter) => filter.id !== "all").map((filter, index) => [
    filter.id,
    index,
  ]),
);

function ToolGrid({ tools }: { tools: Tile[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {tools.map((tool) => (
        <DiscoveryToolCard key={tool.route} tool={tool} context="directory" />
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
    inputRef.current?.setAttribute("data-search-shortcut-ready", "true");

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      inputRef.current?.removeAttribute("data-search-shortcut-ready");
    };
  }, [query]);

  const shown = useMemo(
    () =>
      tools
        .filter(
          (tool) =>
            (category === "all" || tool.category === category) &&
            toolMatchesQuery(tool, query),
        )
        .slice()
        .sort((a, b) => {
          const categoryDelta =
            (CATEGORY_ORDER.get(a.category) ?? 99) -
            (CATEGORY_ORDER.get(b.category) ?? 99);
          return categoryDelta || a.label.localeCompare(b.label);
        }),
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
      <section aria-label="Find a PDF tool">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <label htmlFor="pdf-tool-search" className="sr-only">
            Search tools and actions
          </label>
          <div className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 transition focus-within:border-[var(--border-focus)] focus-within:shadow-[var(--shadow-focus)] lg:min-w-[22rem]">
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
              type="search"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder="Search PDF tools: merge, rotate, watermark, sign…"
              autoComplete="off"
              className="min-w-0 flex-1 bg-transparent py-2.5 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-subtle)]"
            />
            <kbd className="hidden rounded-md border border-[var(--border-hairline)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--text-subtle)] sm:inline">
              /
            </kbd>
          </div>

          <div
            className="aura-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 lg:mx-0 lg:max-w-[48rem] lg:px-0 lg:pb-0"
            aria-label="Filter PDF tools by category"
          >
            {FILTERS.map((filter) => (
              <button
                key={filter.id}
                type="button"
                aria-pressed={category === filter.id}
                onClick={() => setCategory(filter.id)}
                className={`lumeo-focus-ring min-h-10 shrink-0 rounded-full border px-3 text-[12px] font-bold transition duration-200 ${
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
      </section>

      <div className="mb-3 mt-5 flex items-center justify-between gap-4">
        <h2 className="font-serif text-lg font-semibold text-[var(--text-primary)]">
          {category === "all"
            ? "All tools"
            : DISCOVERY_CATEGORY_LABEL[category]}
        </h2>
        <p
          aria-live="polite"
          aria-atomic="true"
          className="text-xs text-[var(--text-muted)]"
        >
          {shown.length} {shown.length === 1 ? "tool" : "tools"}
        </p>
      </div>

      {shown.length === 0 ? (
        <div className="rounded-[15px] border border-[var(--border-hairline)] bg-[var(--surface-raised)] px-6 py-10 text-center">
          <p className="font-serif text-lg text-[var(--text-primary)]">
            No tools match that search
          </p>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Try another action or clear the current filters.
          </p>
          <button
            type="button"
            onClick={resetFilters}
            className="lumeo-focus-ring mt-5 inline-flex min-h-11 items-center rounded-[var(--radius-md)] bg-[var(--action-primary)] px-5 text-sm font-bold text-[var(--text-on-accent)] hover:bg-[var(--action-primary-hover)]"
          >
            Clear search and filters
          </button>
        </div>
      ) : (
        <>
          {available.length > 0 ? <ToolGrid tools={available} /> : null}
          {unavailable.length > 0 ? (
            <section
              className="mt-8"
              aria-labelledby="unavailable-tools-heading"
            >
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
        className="mt-8 border-t border-[var(--border-hairline)] pt-5 text-sm leading-6 text-[var(--text-secondary)]"
        aria-label="Processing information"
      >
        <p>
          <strong className="text-[var(--atelier-sage-300)]">
            Current live tools are browser-based.
          </strong>{" "}
          Each tool explains file handling and browser capability requirements
          before you begin. If a future workflow uses a different processing
          model, Lumeo will identify it before file selection.
        </p>
      </aside>
    </div>
  );
}
