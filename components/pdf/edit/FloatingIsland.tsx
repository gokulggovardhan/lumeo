"use client";

// components/pdf/edit/FloatingIsland.tsx
//
// Bottom-center floating pill for the Edit PDF workspace redesign.
// Fixed to the viewport (NOT attached to a selected element's on-page
// position, unlike a per-element contextual toolbar) -- so it needs none
// of lib/pdf/edit/floatingControlPlacement.ts's edge-aware math, which
// exists specifically for popups anchored to element/text-run geometry.
//
// Two modes only, per the approved spec:
// - "default": page navigation + zoom, shown whenever nothing relevant
//   is selected.
// - "text-inspector": font size/color/bold/italic for a selected PLACED
//   text element. Selecting a shape/whiteout element, or an existing
//   PDF text run, does NOT change this island's mode -- see
//   docs/superpowers/specs/2026-08-10-workspace-redesign-design.md.

import type { TextEditElement } from "@/lib/pdf/edit/elements";

function ChevronLeftIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none">
      <path d="M14.5 6 9 12l5.5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none">
      <path d="M9.5 6 15 12l-5.5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const ISLAND_BUTTON_CLASS =
  "grid h-11 !w-11 shrink-0 place-items-center rounded-full text-[var(--text-secondary)] transition hover:bg-[var(--text-primary)]/[0.08] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lumeo-gold)] disabled:cursor-not-allowed disabled:opacity-30";

function toggleClass(active: boolean) {
  return `grid h-11 !w-11 shrink-0 place-items-center rounded-full text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lumeo-gold)] ${
    active ? "bg-[var(--lumeo-gold)]/[0.16] text-[var(--lumeo-gold)]" : "text-[var(--text-secondary)] hover:bg-[var(--text-primary)]/[0.08] hover:text-[var(--text-primary)]"
  }`;
}

export type FloatingIslandProps =
  | {
      mode: "default";
      pageIndex: number;
      pageCount: number;
      onPrevPage: () => void;
      onNextPage: () => void;
      zoom: number;
      onZoomOut: () => void;
      onZoomIn: () => void;
      onFit: () => void;
    }
  | {
      mode: "text-inspector";
      element: TextEditElement;
      onPatch: (patch: Partial<TextEditElement>) => void;
    };

export function FloatingIsland(props: FloatingIslandProps) {
  return (
    // The pill floats over the canvas and, at some viewport sizes, over
    // the page-action bar below it. Its transparent gutter -- the glass
    // padding and the gaps between controls -- must never swallow a click
    // meant for what is underneath. Only the real controls take pointer
    // events; the chrome around them is inert.
    <div className="pointer-events-none [&_button]:pointer-events-auto [&_input]:pointer-events-auto [&_select]:pointer-events-auto [&_label]:pointer-events-auto aura-glass-regular absolute bottom-6 left-1/2 z-30 flex -translate-x-1/2 flex-wrap items-center justify-center gap-1 rounded-full px-2 py-1.5 shadow-[var(--v2-elevation-2)] sm:flex-nowrap">
      {props.mode === "default" ? (
        <>
          <button type="button" disabled={props.pageIndex === 0} onClick={props.onPrevPage} aria-label="Previous page" title="Previous page (PageUp)" className={ISLAND_BUTTON_CLASS}>
            <ChevronLeftIcon />
          </button>
          <span className="whitespace-nowrap px-1 text-xs font-bold tabular-nums text-[var(--text-secondary)]">
            {props.pageIndex + 1} / {props.pageCount}
          </span>
          <button type="button" disabled={props.pageIndex === props.pageCount - 1} onClick={props.onNextPage} aria-label="Next page" title="Next page (PageDown)" className={ISLAND_BUTTON_CLASS}>
            <ChevronRightIcon />
          </button>

          <div className="mx-1 h-6 w-px shrink-0 bg-[var(--text-primary)]/10" />

          <button type="button" onClick={props.onZoomOut} aria-label="Zoom out" title="Zoom out (or Ctrl/Cmd + scroll)" className={`${ISLAND_BUTTON_CLASS} text-base`}>
            −
          </button>
          <span className="w-11 text-center text-xs font-bold tabular-nums text-[var(--text-secondary)]">{Math.round(props.zoom * 100)}%</span>
          <button type="button" onClick={props.onZoomIn} aria-label="Zoom in" title="Zoom in (or Ctrl/Cmd + scroll)" className={`${ISLAND_BUTTON_CLASS} text-base`}>
            +
          </button>
          <button
            type="button"
            onClick={props.onFit}
            className="ml-0.5 grid h-11 shrink-0 place-items-center rounded-full px-3 text-xs font-bold text-[var(--text-secondary)] transition hover:bg-[var(--text-primary)]/[0.08] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lumeo-gold)]"
          >
            Fit
          </button>
        </>
      ) : (
        <>
          <input
            type="number"
            min={8}
            max={72}
            value={props.element.fontSizePt}
            onChange={(e) => props.onPatch({ fontSizePt: Number(e.target.value) })}
            aria-label="Font size"
            title="Font size"
            className="h-11 w-14 rounded-full border border-[var(--text-primary)]/14 bg-transparent px-2 text-center text-xs font-bold text-[var(--text-primary)]"
          />
          <input
            type="color"
            value={props.element.color}
            onChange={(e) => props.onPatch({ color: e.target.value })}
            aria-label="Text color"
            title="Text color"
            className="h-11 w-11 shrink-0 rounded-full border border-[var(--text-primary)]/14 bg-transparent"
          />
          <button type="button" aria-pressed={props.element.bold} onClick={() => props.onPatch({ bold: !props.element.bold })} aria-label="Bold" title="Bold" className={toggleClass(props.element.bold)}>
            B
          </button>
          <button
            type="button"
            aria-pressed={props.element.italic}
            onClick={() => props.onPatch({ italic: !props.element.italic })}
            aria-label="Italic"
            title="Italic"
            className={`${toggleClass(props.element.italic)} italic`}
          >
            I
          </button>
          <button
            type="button"
            aria-pressed={props.element.underline}
            onClick={() => props.onPatch({ underline: !props.element.underline })}
            aria-label="Underline"
            title="Underline"
            className={`${toggleClass(props.element.underline)} underline`}
          >
            U
          </button>
        </>
      )}
    </div>
  );
}
