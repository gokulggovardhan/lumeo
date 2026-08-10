"use client";

// components/pdf/edit/MicroDock.tsx
//
// Left-edge (desktop) / top-edge (mobile) tool dock for the Edit PDF
// workspace redesign. Purely presentational -- see
// docs/superpowers/specs/2026-08-10-workspace-redesign-design.md's "view
// swap, logic untouched" approach: activeTool, shapeKind, inkColor, and
// inkStrokeWidth all stay owned by EditPdfTool.tsx; this component only
// renders them and reports clicks back up via callbacks.
//
// Privacy Shield is a one-shot ACTION (triggers a scan), not a persistent
// tool mode -- it never changes `activeTool`, so it's a separate button,
// not a 6th ActiveTool value.

import type { ActiveTool } from "../EditPdfTool";
import type { ShapeKind } from "@/lib/pdf/edit/elements";

function SelectToolIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none">
      <path d="M6 4.5 18 12l-5.2 1.2L15 19l-2.4 1L10 14l-4 3.5V4.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function TextToolIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none">
      <path d="M5 6.5h14M12 6.5V18M9 18h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DrawToolIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none">
      <path d="M14.5 5.5 18.5 9.5 8 20H4v-4L14.5 5.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M13 7 17 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function ShapeToolIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none">
      <rect x="4" y="4" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="16" cy="16" r="4.5" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

// Deliberately NOT a red icon -- whiteout must read as "cover this
// content," not "delete." Kept identical to the pre-redesign icon.
function WhiteoutToolIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none">
      <path d="M5 5h10.5L19 8.5V19H5V5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M15.5 5v3.5H19" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M8 12.5h8M8 15.5h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none">
      <path d="M12 3.5 19 6.5V11c0 5-3 8.2-7 9.5-4-1.3-7-4.5-7-9.5V6.5L12 3.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M9 12l2 2 4-4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const TOOL_META: Array<{ id: ActiveTool; label: string; shortcut: string; Icon: () => React.JSX.Element }> = [
  { id: "select", label: "Select", shortcut: "1", Icon: SelectToolIcon },
  { id: "text", label: "Text", shortcut: "2", Icon: TextToolIcon },
  { id: "draw", label: "Draw", shortcut: "3", Icon: DrawToolIcon },
  { id: "shape", label: "Shape", shortcut: "4", Icon: ShapeToolIcon },
  { id: "whiteout", label: "Whiteout", shortcut: "5", Icon: WhiteoutToolIcon },
];

// Shared icon-button styling for every dock entry -- 44px hit target
// (h-11 w-11), matching the project's PR #230 touch-target convention.
// The `!` on w-11 beats the same global `width:100%` rule PR #230's
// `!w-9` pattern exists to override (app/globals.css:476-478).
function dockButtonClass(active: boolean) {
  return `grid h-11 !w-11 shrink-0 place-items-center rounded-[var(--radius-lg)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lumeo-gold)] ${
    active
      ? "bg-[var(--lumeo-gold)]/[0.14] text-[var(--lumeo-gold)]"
      : "text-[var(--text-secondary)] hover:bg-[var(--text-primary)]/[0.06] hover:text-[var(--text-primary)]"
  }`;
}

export type MicroDockProps = {
  activeTool: ActiveTool;
  onSelectTool: (tool: ActiveTool) => void;
  shapeKind: ShapeKind;
  onShapeKindChange: (kind: ShapeKind) => void;
  inkColor: string;
  onInkColorChange: (color: string) => void;
  inkStrokeWidth: number;
  onInkStrokeWidthChange: (width: number) => void;
  onPrivacyShieldClick: () => void;
  privacyShieldMatchCount: number;
};

export function MicroDock({
  activeTool,
  onSelectTool,
  shapeKind,
  onShapeKindChange,
  inkColor,
  onInkColorChange,
  inkStrokeWidth,
  onInkStrokeWidthChange,
  onPrivacyShieldClick,
  privacyShieldMatchCount,
}: MicroDockProps) {
  const hasFlyout = activeTool === "text" || activeTool === "shape" || activeTool === "draw" || activeTool === "whiteout";

  return (
    <div
      className="absolute z-30 flex flex-col items-center gap-3 top-2 left-1/2 -translate-x-1/2 sm:top-1/2 sm:left-4 sm:-translate-x-0 sm:-translate-y-1/2 sm:flex-row"
    >
      <div className="aura-glass-regular flex flex-row items-center gap-1 rounded-full p-1.5 shadow-[var(--v2-elevation-2)] sm:flex-col">
        {TOOL_META.map(({ id, label, shortcut, Icon }) => (
          <button
            key={id}
            type="button"
            aria-pressed={activeTool === id}
            onClick={() => onSelectTool(id)}
            title={`${label} (${shortcut})`}
            aria-label={label}
            className={dockButtonClass(activeTool === id)}
          >
            <Icon />
          </button>
        ))}
        <div className="mx-0.5 h-6 w-px shrink-0 bg-[var(--text-primary)]/10 sm:mx-0 sm:h-px sm:w-6" />
        <button
          type="button"
          onClick={onPrivacyShieldClick}
          title="Privacy Shield -- scan for sensitive info"
          aria-label="Privacy Shield"
          className={`relative ${dockButtonClass(privacyShieldMatchCount > 0)}`}
        >
          <ShieldIcon />
          {privacyShieldMatchCount > 0 ? (
            <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--lumeo-gold)] px-1 text-[9px] font-bold text-[var(--atelier-surface-0)]">
              {privacyShieldMatchCount}
            </span>
          ) : null}
        </button>
      </div>

      {hasFlyout ? (
        <div className="aura-glass-thin w-[calc(100vw-2rem)] max-w-56 rounded-[var(--radius-xl)] p-3 shadow-[var(--v2-elevation-1)]">
          {activeTool === "text" ? (
            <p className="text-[11px] leading-5 text-[var(--text-primary)]/60">Click or tap the page to add a text box.</p>
          ) : null}

          {activeTool === "shape" ? (
            <div className="grid grid-cols-4 gap-1.5">
              {(["rect", "ellipse", "line", "highlight"] as ShapeKind[]).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  aria-pressed={shapeKind === kind}
                  onClick={() => onShapeKindChange(kind)}
                  className={`min-h-11 rounded-lg border px-1.5 py-1.5 text-[10px] font-bold capitalize transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lumeo-gold)] ${
                    shapeKind === kind ? "border-[var(--lumeo-gold)] bg-[var(--lumeo-gold)]/10" : "border-[var(--text-primary)]/12 text-[var(--text-primary)]/60"
                  }`}
                >
                  {kind}
                </button>
              ))}
            </div>
          ) : null}

          {activeTool === "draw" ? (
            <div className="grid gap-2.5">
              <label className="flex items-center justify-between text-xs font-semibold text-[var(--text-primary)]/60">
                Color
                <input type="color" value={inkColor} onChange={(e) => onInkColorChange(e.target.value)} className="h-11 w-11 rounded border border-[var(--text-primary)]/14" />
              </label>
              <label className="flex items-center justify-between text-xs font-semibold text-[var(--text-primary)]/60">
                Thickness
                <input type="range" min={1} max={10} value={inkStrokeWidth} onChange={(e) => onInkStrokeWidthChange(Number(e.target.value))} className="w-24" />
              </label>
            </div>
          ) : null}

          {activeTool === "whiteout" ? (
            <p className="text-[11px] leading-5 text-[var(--text-primary)]/60">
              Drag over the text or content you want to hide -- it snaps to a line of text automatically, or drag freely for anything else. Hides content visually only; for legal or compliance redaction, verify the underlying content is also removed before sharing.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
