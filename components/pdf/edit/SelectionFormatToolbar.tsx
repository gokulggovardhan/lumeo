// components/pdf/edit/SelectionFormatToolbar.tsx
//
// Contextual floating toolbar shown next to the current selection in the
// Edit PDF workspace. Two distinct modes, matching the two distinct
// editing systems in this tool (see lib/pdf/edit/editPlan.ts's own top
// comment): "run" is a read-only info strip for an EXISTING PDF text run
// (font name + size only -- editPlan.ts only supports same-font glyph
// substitution, so there is nothing editable to expose here); "element" is
// a real formatting toolbar for a PLACED text element, wired to the same
// patchElement/onDelete callbacks the old sidebar "Text properties" card
// used, just relocated next to the selection instead of living in a
// permanent panel.
//
// Pure presentational component: position is entirely the caller's
// responsibility (via positionClassName), matching the existing inline
// text-run editor's pattern of computing pickVerticalPlacement/
// pickHorizontalAlign once in the parent and passing down CSS classes.

import type { TextEditElement } from "@/lib/pdf/edit/elements";

type RunMode = {
  mode: "run";
  fontName: string;
  fontSizePt: number;
};

type ElementMode = {
  mode: "element";
  element: TextEditElement;
  onPatch: (patch: Partial<TextEditElement>) => void;
  onDelete: () => void;
};

export type SelectionFormatToolbarProps = (RunMode | ElementMode) & {
  positionClassName: string;
};

const TOGGLE_BUTTON_CLASS =
  "grid h-9 !w-9 shrink-0 place-items-center rounded-full border text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lumeo-gold)]";

function toggleClass(active: boolean): string {
  return `${TOGGLE_BUTTON_CLASS} ${active ? "border-[var(--lumeo-gold)] bg-[var(--lumeo-gold)]/15 text-[var(--text-primary)]" : "border-[var(--text-primary)]/14 bg-[var(--atelier-surface-1)]/95 text-[var(--text-primary)]/70 hover:border-[var(--text-primary)]/24"}`;
}

export function SelectionFormatToolbar(props: SelectionFormatToolbarProps) {
  const { positionClassName } = props;

  if (props.mode === "run") {
    return (
      <div
        className={`z-30 flex items-center gap-2 whitespace-nowrap rounded-full border border-[var(--text-primary)]/14 bg-[var(--atelier-surface-1)]/95 px-3 py-1.5 text-[10px] font-semibold text-[var(--text-primary)]/70 shadow-lg ${positionClassName}`}
      >
        <span className="max-w-[140px] truncate" title={props.fontName}>{props.fontName}</span>
        <span aria-hidden="true" className="h-3 w-px bg-[var(--text-primary)]/16" />
        <span className="tabular-nums">{Math.round(props.fontSizePt)}pt</span>
      </div>
    );
  }

  const { element, onPatch, onDelete } = props;

  return (
    <div
      className={`absolute z-30 flex items-center gap-1.5 whitespace-nowrap rounded-full border border-[var(--text-primary)]/14 bg-[var(--atelier-surface-1)]/95 px-2 py-1.5 shadow-lg ${positionClassName}`}
    >
      <input
        type="number"
        min={8}
        max={72}
        value={element.fontSizePt}
        onChange={(event) => onPatch({ fontSizePt: Number(event.target.value) })}
        onClick={(event) => event.stopPropagation()}
        aria-label="Font size"
        title="Font size"
        className="h-9 w-12 rounded-md border border-[var(--text-primary)]/14 bg-transparent px-1 text-center text-xs font-bold text-[var(--text-primary)]"
      />
      <input
        type="color"
        value={element.color}
        onChange={(event) => onPatch({ color: event.target.value })}
        onClick={(event) => event.stopPropagation()}
        aria-label="Text color"
        title="Text color"
        className="h-9 w-9 shrink-0 rounded-md border border-[var(--text-primary)]/14 bg-transparent"
      />
      <button
        type="button"
        aria-pressed={element.bold}
        onClick={(event) => {
          event.stopPropagation();
          onPatch({ bold: !element.bold });
        }}
        aria-label="Bold"
        title="Bold"
        className={toggleClass(element.bold)}
      >
        B
      </button>
      <button
        type="button"
        aria-pressed={element.italic}
        onClick={(event) => {
          event.stopPropagation();
          onPatch({ italic: !element.italic });
        }}
        aria-label="Italic"
        title="Italic"
        className={`${toggleClass(element.italic)} italic`}
      >
        I
      </button>
      <button
        type="button"
        aria-pressed={element.underline}
        onClick={(event) => {
          event.stopPropagation();
          onPatch({ underline: !element.underline });
        }}
        aria-label="Underline"
        title="Underline"
        className={`${toggleClass(element.underline)} underline`}
      >
        U
      </button>
      <span aria-hidden="true" className="mx-0.5 h-5 w-px shrink-0 bg-[var(--text-primary)]/16" />
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onDelete();
        }}
        aria-label="Delete text"
        title="Delete"
        className="grid h-9 !w-9 shrink-0 place-items-center rounded-full border border-[var(--border-danger)]/30 bg-[var(--surface-danger)] text-[var(--text-danger)] transition hover:border-[var(--border-danger)]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lumeo-gold)]"
      >
        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none">
          <path d="M5 5 15 15M15 5 5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
