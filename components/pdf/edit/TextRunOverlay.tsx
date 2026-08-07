"use client";

// components/pdf/edit/TextRunOverlay.tsx
//
// Phase 9.1 of true PDF text editing: the interactive bounding box for ONE
// existing, pdfjs-detected text run (lib/pdf/edit/textRuns.ts) on top of
// the rendered page image. Purely a selection/hover/focus surface -- it
// never drags, resizes, or writes to the PDF itself (that happens in
// EditPdfTool.tsx's applyTextRunEdit, via the lib/pdf/edit EditPlan
// pipeline). Structurally mirrors EditElementView.tsx/CropRectView.tsx
// (one overlay component per interactive item, parent owns the array and
// selection state) but is deliberately much simpler: no pointer-drag math
// is needed here at all, so none of PlacedElementView's DOM-write-during-
// gesture performance concern applies -- clicking/focusing a run is a
// single discrete event, not a continuous one.
//
// `editable` reflects only whether this run was matched to a content-
// stream operator (lib/pdf/edit/matchTextRun.ts's matchDetectedRunToOperator)
// -- a cheap, position-only check done once per page load. Whether a
// SPECIFIC replacement string can actually be written (font encoding,
// glyph availability, clipping-path text mode, etc.) is a separate,
// necessarily per-edit question only lib/pdf/edit/editPlan.ts's
// buildEditPlan can answer, and is surfaced by the parent after the user
// types a replacement -- this box only ever promises "in-place editing is
// available to try here," never "this exact edit will succeed."
//
// Phase 9.2: onSelect passes along whether Shift was held, so the parent
// can extend a CONTIGUOUS multi-run selection (Shift+click) instead of
// always replacing it with a single run -- matches Shift+click's usual
// range-select convention, and the same Shift+Arrow keyboard equivalent
// the parent wires at the stage level.

import { memo, type KeyboardEvent, type MouseEvent } from "react";
import type { DetectedTextRun } from "@/lib/pdf/edit/textRuns.ts";

type TextRunOverlayProps = {
  run: DetectedTextRun;
  editable: boolean;
  selected: boolean;
  hovered: boolean;
  onSelect: (shiftKey: boolean) => void;
  onHoverStart: () => void;
  onHoverEnd: () => void;
  onFocusRun: () => void;
  registerNode: (node: HTMLDivElement | null) => void;
};

// Phase 10: memoized so selecting/hovering ONE run (a state change in the
// parent, EditPdfTool.tsx) doesn't force React to reconcile every other
// run's overlay on a text-heavy page -- only the ones whose props actually
// changed re-render. The parent's per-item inline callbacks (onSelect,
// onHoverStart, etc., built fresh inside its .map()) still compare stable
// across renders where they're unchanged: this project's React Compiler
// auto-memoizes them by their closed-over dependencies, so no manual
// useCallback/ref-caching is needed (and would conflict with the
// compiler's own memoization -- see react-hooks/refs).
function TextRunOverlayImpl({
  run,
  editable,
  selected,
  hovered,
  onSelect,
  onHoverStart,
  onHoverEnd,
  onFocusRun,
  registerNode,
}: TextRunOverlayProps) {
  function handleClick(event: MouseEvent<HTMLDivElement>) {
    event.stopPropagation();
    onSelect(event.shiftKey);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(event.shiftKey);
    }
  }

  // Selected always wins visually; otherwise hovered/focused get a lighter
  // highlight, and a plain (still focusable/clickable) run gets no border
  // until interacted with, so a text-heavy page doesn't turn into a wall
  // of boxes at rest.
  const borderClass = selected
    ? "border-2 border-dashed border-[var(--lumeo-gold)] bg-[var(--lumeo-gold)]/10"
    : hovered
      ? editable
        ? "border border-[var(--lumeo-gold)]/50 bg-[var(--lumeo-gold)]/[0.06]"
        : "border border-[var(--text-primary)]/25 bg-[var(--text-primary)]/[0.04]"
      : "border border-transparent";

  return (
    <div
      ref={registerNode}
      role="button"
      tabIndex={0}
      aria-label={`${editable ? "Editable" : "Not yet editable"} text: ${run.str}`}
      aria-pressed={selected}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onMouseEnter={onHoverStart}
      onMouseLeave={onHoverEnd}
      onFocus={onFocusRun}
      className={`absolute z-10 rounded-[2px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--lumeo-gold)] ${borderClass} ${editable ? "cursor-text" : "cursor-not-allowed"}`}
      style={{
        left: `${run.xPct}%`,
        top: `${run.yPct}%`,
        width: `${run.widthPct}%`,
        height: `${run.heightPct}%`,
      }}
    />
  );
}

export const TextRunOverlay = memo(TextRunOverlayImpl);
