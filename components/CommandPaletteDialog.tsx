"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ToolGlyph } from "@/components/pdf/ToolGlyph";
import {
  buildCommandPaletteIndex,
  searchCommandPaletteIndex,
  type CommandPaletteItem,
} from "@/lib/command-palette";
import type { Tile } from "@/lib/tools/tiles";

// Dynamically imported by CommandPaletteTrigger only once the palette is
// actually opened -- this file (search index, keyboard handling, result
// rendering) never loads its JS on a page load where the user never
// presses Cmd/Ctrl+K, per this PR's "no additional JS until opened" rule.

export function CommandPaletteDialog({
  tiles,
  onClose,
  triggerRef,
}: {
  tiles: Tile[];
  onClose: () => void;
  triggerRef: React.RefObject<HTMLElement | null>;
}) {
  const router = useRouter();
  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const index = useMemo(() => buildCommandPaletteIndex(tiles), [tiles]);
  const results = useMemo(() => searchCommandPaletteIndex(index, query), [index, query]);

  // Autofocus the input on open (real keyboard focus, not a JS .focus()
  // hack applied to something the user didn't ask for -- this is the
  // dialog's one interactive control, matching the ARIA combobox pattern
  // below where results are never independently focusable).
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Reset the active selection to the top result whenever the query
  // changes. Deliberately a render-phase adjustment (React's documented
  // pattern for "reset state when a prop/value changes"), not an effect
  // -- calling setState synchronously inside an effect body causes an
  // extra cascading render for no benefit here.
  const [queryAtLastReset, setQueryAtLastReset] = useState(query);
  if (query !== queryAtLastReset) {
    setQueryAtLastReset(query);
    setActiveIndex(0);
  }

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (panelRef.current?.contains(event.target as Node)) return;
      onClose();
    }
    // Same outside-click pattern already used by PublicPdfToolsMenuClient.
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [onClose]);

  useEffect(() => {
    // Captured now, not re-read in the cleanup -- by the time cleanup
    // runs, triggerRef.current could point somewhere else if the ref's
    // target unmounted or the ref was reused for a different element.
    const elementToRestore = triggerRef.current;
    return () => {
      // Focus restoration: return keyboard focus to whatever opened the
      // palette (the header button, or wherever focus was when Cmd/Ctrl+K
      // was pressed) once the dialog unmounts.
      elementToRestore?.focus();
    };
  }, [triggerRef]);

  function activate(item: CommandPaletteItem) {
    onClose();
    router.push(item.route);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      // Looping is intentional here -- every command-palette convention
      // this is modeled on (Spotlight, Raycast, Linear) wraps around,
      // and with a short, single-page result list there's no cost to it.
      setActiveIndex((current) => (results.length ? (current + 1) % results.length : 0));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => (results.length ? (current - 1 + results.length) % results.length : 0));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const selected = results[activeIndex];
      if (selected) activate(selected);
    }
  }

  const activeOptionId = results[activeIndex] ? `${listboxId}-option-${results[activeIndex].id}` : undefined;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-[var(--v2-surface-overlay)] px-4 pt-[12vh] sm:pt-[16vh]">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="aura-glass-thick aura-scale-in w-full max-w-xl overflow-hidden rounded-[var(--radius-2xl)]"
      >
        <div className="flex items-center gap-3 border-b border-[var(--border-hairline)] px-4 py-3">
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-[var(--text-muted)]" fill="none">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.75" />
            <path d="m20 20-3.5-3.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.75" />
          </svg>
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded="true"
            aria-controls={listboxId}
            aria-activedescendant={activeOptionId}
            aria-autocomplete="list"
            aria-label="Search Lumeo tools and pages"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search tools and pages..."
            className="min-w-0 flex-1 bg-transparent text-base font-semibold text-[var(--text-primary)] placeholder:text-[var(--text-subtle)] focus:outline-none"
          />
          <kbd className="hidden shrink-0 rounded-[var(--radius-sm)] border border-[var(--border-hairline)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--text-subtle)] sm:inline-block">
            Esc
          </kbd>
        </div>

        <ul
          id={listboxId}
          role="listbox"
          aria-label="Search results"
          className="aura-scrollbar max-h-[min(60vh,26rem)] overflow-y-auto p-2"
        >
          {results.length === 0 ? (
            <li role="presentation" className="px-3 py-8 text-center text-sm text-[var(--text-subtle)]">
              No results for &ldquo;{query}&rdquo;.
            </li>
          ) : (
            results.map((item, resultIndex) => {
              const selected = resultIndex === activeIndex;
              return (
                <li key={item.id} role="presentation">
                  <button
                    type="button"
                    id={`${listboxId}-option-${item.id}`}
                    role="option"
                    aria-selected={selected}
                    onMouseEnter={() => setActiveIndex(resultIndex)}
                    onClick={() => activate(item)}
                    className={`flex w-full min-h-11 items-center gap-3 rounded-[var(--radius-lg)] px-3 py-2.5 text-left transition duration-[var(--v2-motion-instant)] ${
                      selected ? "bg-[rgba(var(--champagne-rgb),0.14)]" : "hover:bg-[rgba(var(--paper-rgb),0.06)]"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius-md)] bg-[rgba(var(--champagne-rgb),0.1)] text-[var(--text-premium)]"
                    >
                      {item.glyph ? <ToolGlyph name={item.glyph} className="h-[18px] w-[18px]" /> : <span className="text-sm font-black">#</span>}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-[var(--text-primary)]">{item.title}</span>
                      {item.description ? (
                        <span className="mt-0.5 block truncate text-xs text-[var(--text-muted)]">{item.description}</span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-[10px] font-black uppercase tracking-[0.06em] text-[var(--text-subtle)]">
                      {item.category}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </div>
  );
}
