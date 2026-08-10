# Edit PDF Workspace Redesign + Privacy Shield Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Edit PDF's sidebar/toolbar layout with a full-canvas MicroDock + FloatingIsland workspace, and add a Privacy Shield regex auto-redaction feature.

**Architecture:** View-swap over `components/pdf/EditPdfTool.tsx` — every existing hook/state (tool selection, elements, selection, zoom, undo/redo, page nav, edit-plan preview) stays exactly as it is. Two new presentational components (`MicroDock.tsx`, `FloatingIsland.tsx`) replace the old sidebar/toolbar JSX and receive that same state via props. `lib/pdf/edit/privacyShield.ts` is a new pure-function module, following this codebase's established `lib/pdf/edit/*.ts` pattern (self-contained, no project-file imports, testable under `node --experimental-strip-types`).

**Tech Stack:** Next.js/React/TypeScript, Tailwind CSS, pdf-lib, pdfjs-dist. No new dependencies.

## Global Constraints

- Branch `feature/workspace-redesign`, based on `main`, fully isolated from PR #232 (`feat/edit-pdf-professional-text-formatting`) — never merge/rebase against it.
- No Fabric.js or any new canvas library. Placed elements stay plain positioned DOM, matching `components/pdf/edit/EditElementView.tsx`.
- No AI/ML language anywhere in Privacy Shield UI copy — it's deterministic regex matching. Copy: "Privacy Shield," "Scan for sensitive info," "Apply redactions."
- Placed-text inspector (FloatingIsland's selected mode) covers font size/color/bold/italic only — no underline (that's PR #232 scope, not present on this branch).
- Shape/whiteout elements get no post-selection property editor in v1 (unchanged from current behavior — this codebase already has none for them).
- Existing-PDF-text-run inline editor (input + Apply/Cancel over a selected text run, `singleSelectedRun`/`singleSelectedRunMatch` in `EditPdfTool.tsx`) stays untouched, visually and logically, throughout every phase.
- 44px minimum touch target on every interactive control (established in PR #230, `!w-9` pattern for Tailwind's `important` modifier where a global `width:100%` rule needs overriding — see `app/globals.css:476-478`).
- Full test suite, `tsc --noEmit`, `eslint`, and `npm run build` must stay green after every task that touches shipped code.
- Spec reference: `docs/superpowers/specs/2026-08-10-workspace-redesign-design.md`.

## Sequencing note

Task 2 removes the old sidebar's "Text properties" card (placed-text formatting) as part of deleting the two-column grid. That functionality is intentionally unavailable between Task 2 and Task 4 (FloatingIsland's inspector mode restores it). This is fine WITHIN a feature branch — each task is reviewed individually — but this branch must not be merged or deployed until Phase 4 passes.

---

## Phase 1: Workspace Shell & MicroDock

### Task 1: Create `MicroDock.tsx`

**Files:**
- Create: `components/pdf/edit/MicroDock.tsx`
- Modify: `components/pdf/EditPdfTool.tsx:126` (export the `ActiveTool` type so `MicroDock.tsx` can import it)

**Interfaces:**
- Consumes: nothing from other new files (first task).
- Produces: `export type { ActiveTool } from "./EditPdfTool"` re-export point (via the modified line 126); `MicroDockProps` and the `MicroDock` component, consumed by Task 2.

- [ ] **Step 1: Export `ActiveTool` from `EditPdfTool.tsx`**

Find this line (currently line 126):
```ts
type ActiveTool = "select" | "text" | "draw" | "shape" | "whiteout";
```
Replace with:
```ts
export type ActiveTool = "select" | "text" | "draw" | "shape" | "whiteout";
```

- [ ] **Step 2: Create `MicroDock.tsx`**

```tsx
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
      className="absolute z-30 flex flex-row items-center gap-3 top-2 left-1/2 -translate-x-1/2 sm:top-1/2 sm:left-4 sm:-translate-x-0 sm:-translate-y-1/2 sm:flex-col"
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
        <div className="aura-glass-thin w-56 rounded-[var(--radius-xl)] p-3 shadow-[var(--v2-elevation-1)]">
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
                <input type="color" value={inkColor} onChange={(e) => onInkColorChange(e.target.value)} className="h-7 w-10 rounded border border-[var(--text-primary)]/14" />
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
```

- [ ] **Step 3: Typecheck the new file in isolation**

Run: `npx tsc --noEmit`
Expected: no errors referencing `MicroDock.tsx` (it isn't imported anywhere yet, so this only validates the file's own syntax/types against the exported `ActiveTool` and `ShapeKind` types).

- [ ] **Step 4: Commit**

```bash
git add components/pdf/EditPdfTool.tsx components/pdf/edit/MicroDock.tsx
git commit -m "feat(workspace): add MicroDock component (not yet wired)"
```

---

### Task 2: Replace sidebar/tool-rail with full-bleed canvas + MicroDock

**Files:**
- Modify: `components/pdf/EditPdfTool.tsx` (multiple regions, see steps)

**Interfaces:**
- Consumes: `MicroDock` from `./edit/MicroDock` (Task 1); existing state (`activeTool`, `setActiveTool`, `shapeKind`, `setShapeKind`, `inkColor`, `setInkColor`, `inkStrokeWidth`, `setInkStrokeWidth`, `outputName`, `setOutputName`, `setDownloadUrl`).
- Produces: full-bleed canvas layout consumed by Task 4 (FloatingIsland wiring); `onPrivacyShieldClick`/`privacyShieldMatchCount` props on `MicroDock` are wired to no-ops here (`() => {}` / `0`) — Task 6 replaces them with real handlers.

- [ ] **Step 1: Import `MicroDock` and remove the now-duplicated icon/TOOL_META definitions**

Add import near the top (alongside the existing `EditElementView`/`InkCanvas`/`TextRunOverlay` imports):
```tsx
import { MicroDock } from "@/components/pdf/edit/MicroDock";
```

Delete these six function definitions entirely (now living in `MicroDock.tsx`): `ChevronLeftIcon` and `ChevronRightIcon` stay (still used by page-nav, which moves to `FloatingIsland.tsx` in Phase 2 — leave them for now, Task 4 will move them). Delete only: `SelectToolIcon`, `TextToolIcon`, `DrawToolIcon`, `ShapeToolIcon`, `WhiteoutToolIcon` (originally lines 276-323), and the `TOOL_META` constant (originally lines 359-365).

Also delete the now-unused constant:
```ts
const TOOL_SHORTCUT_LABELS: Record<ActiveTool, string> = { select: "1", text: "2", draw: "3", shape: "4", whiteout: "5" };
```
(shortcuts moved into `MicroDock.tsx`'s own `TOOL_META`).

- [ ] **Step 2: Move the "File name" input into the top toolbar**

Find the "Start new" button in the top toolbar:
```tsx
        <L2ToolbarButton
          onClick={() => {
            if ((elements.length > 0 || hasTextEdits) && !window.confirm("Start a new PDF? Your current edits will be discarded.")) return;
            resetTool();
          }}
          className="ml-auto"
        >
          Start new
        </L2ToolbarButton>
      </div>
```

Replace with (adds a filename input before "Start new", removes `ml-auto` from the button since the input now anchors the right side):
```tsx
        <label className="ml-auto flex items-center gap-1.5">
          <span className="sr-only">File name</span>
          <input
            value={outputName}
            onChange={(e) => {
              setOutputName(e.target.value);
              setDownloadUrl("");
            }}
            className="w-36 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-right text-xs font-semibold text-[var(--text-primary)] outline-none placeholder:text-[var(--text-primary)]/26 focus:border-b-[var(--lumeo-gold)]/45 sm:w-48"
            placeholder="lumeo-edited.pdf"
          />
        </label>

        <L2ToolbarButton
          onClick={() => {
            if ((elements.length > 0 || hasTextEdits) && !window.confirm("Start a new PDF? Your current edits will be discarded.")) return;
            resetTool();
          }}
        >
          Start new
        </L2ToolbarButton>
      </div>
```

- [ ] **Step 3: Replace the two-column grid with a full-bleed canvas + MicroDock**

Find the grid wrapper:
```tsx
      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_15rem] lg:items-start">
```
Replace with:
```tsx
      <div className="relative min-w-0">
```

Find the closing of that same grid (the sidebar column's closing `</div>` immediately followed by the grid's own closing `</div>`, right before `<ToolActionBar>`):
```tsx
          <div className="aura-glass-thin rounded-[var(--radius-2xl)] p-3 shadow-[var(--v2-elevation-1)]">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-primary)]/34">File name</span>
              <input
                value={outputName}
                onChange={(e) => {
                  setOutputName(e.target.value);
                  setDownloadUrl("");
                }}
                className="mt-1.5 w-full rounded-md border border-transparent bg-transparent px-0 py-1 text-sm font-semibold text-[var(--text-primary)] outline-none placeholder:text-[var(--text-primary)]/26 focus:border-b-[var(--lumeo-gold)]/45"
                placeholder="lumeo-edited.pdf"
              />
            </label>
          </div>
        </div>
      </div>
```
Replace with (deletes the File-name card — moved to the top bar in Step 2 — and deletes the entire sidebar column: tool rail, Text/Shape/Draw/Whiteout contextual cards now in `MicroDock`'s flyout, and the "Text properties" card, which Task 4 restores via `FloatingIsland`):
```tsx
        <MicroDock
          activeTool={activeTool}
          onSelectTool={setActiveTool}
          shapeKind={shapeKind}
          onShapeKindChange={setShapeKind}
          inkColor={inkColor}
          onInkColorChange={setInkColor}
          inkStrokeWidth={inkStrokeWidth}
          onInkStrokeWidthChange={setInkStrokeWidth}
          onPrivacyShieldClick={() => {}}
          privacyShieldMatchCount={0}
        />
      </div>
```

This deletes everything between the tool-rail wrapper comment (`{/* Phase 27: tool rail + contextual controls... */}`) and the File-name card, inclusive — i.e. the entire `<div className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-[9.5rem] lg:self-start">...` sidebar block. `selectedElement` (still computed via `useMemo` elsewhere in the file) becomes temporarily unused by any JSX until Task 4 — leave its declaration in place, `eslint` will not flag an unused `useMemo` result that's later consumed, and Task 4 re-consumes it within this same task's commit boundary... actually since Task 2 and Task 4 are separate commits, run Step 4 below to confirm whether `selectedElement` (and `patchElement`/`EditElement` type import, if now otherwise-unused) trips `no-unused-vars` — if so, keep it referenced with a minimal no-op read (see Step 4).

- [ ] **Step 4: Typecheck, lint, verify no unused-variable errors**

Run: `npx tsc --noEmit && npx eslint components/pdf/EditPdfTool.tsx`

If `eslint` reports `selectedElement` (or `patchElement`, or the `EditElement` type import) as unused, add this temporary guard directly below the `selectedElement` `useMemo` (Task 4 removes this guard when it wires real usage):
```ts
  void selectedElement; // TODO(Task 4): consumed by FloatingIsland's inspector mode
```
Expected after fix: zero errors, zero warnings.

- [ ] **Step 5: Run full test suite and build**

Run: `npm test && npx tsc --noEmit && npx eslint . && npm run build`
Expected: all pass (this task touches no `lib/pdf/edit/*.ts` logic, so the existing 427 tests are unaffected).

- [ ] **Step 6: Manual browser check**

Start dev server, open `/pdf/edit`, upload a PDF:
- Canvas fills the full width (no right sidebar).
- MicroDock appears floating at the left edge (desktop) — Select/Text/Draw/Shape/Whiteout/Privacy Shield icons all present, Privacy Shield inert (no-op) for now.
- Clicking Text/Shape/Draw/Whiteout shows the flyout panel beside the dock with the same controls the old sidebar cards had.
- Top bar shows the file name input before "Start new."
- Confirm placed-text elements can still be created/moved/resized/deleted (their own font-size/color/bold/italic editing is intentionally broken right now — Task 4 restores it).

- [ ] **Step 7: Commit**

```bash
git add components/pdf/EditPdfTool.tsx
git commit -m "feat(workspace): replace sidebar/tool-rail with full-bleed canvas + MicroDock"
```

---

## Phase 2: FloatingIsland

### Task 3: Create `FloatingIsland.tsx`

**Files:**
- Create: `components/pdf/edit/FloatingIsland.tsx`

**Interfaces:**
- Consumes: `TextEditElement` type from `@/lib/pdf/edit/elements`.
- Produces: `FloatingIslandProps` and the `FloatingIsland` component, consumed by Task 4.

- [ ] **Step 1: Create `FloatingIsland.tsx`**

```tsx
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
    <div className="aura-glass-regular absolute bottom-6 left-1/2 z-30 flex -translate-x-1/2 flex-wrap items-center justify-center gap-1 rounded-full px-2 py-1.5 shadow-[var(--v2-elevation-2)] sm:flex-nowrap">
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
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck in isolation**

Run: `npx tsc --noEmit`
Expected: no errors referencing `FloatingIsland.tsx`.

- [ ] **Step 3: Commit**

```bash
git add components/pdf/edit/FloatingIsland.tsx
git commit -m "feat(workspace): add FloatingIsland component (not yet wired)"
```

---

### Task 4: Wire `FloatingIsland` into `EditPdfTool.tsx`

**Files:**
- Modify: `components/pdf/EditPdfTool.tsx`

**Interfaces:**
- Consumes: `FloatingIsland` from `./edit/FloatingIsland` (Task 3); existing state (`pageIndex`, `setPageIndex`, `pdf.pageCount`, `zoom`, `setZoom`, `selectedElement`, `setElements`, `patchElement` from `@/lib/pdf/edit/elements`).
- Produces: fully restored placed-text formatting via the island's inspector mode; this is the last workspace-layout task — Phase 3 builds on top of this file as it now stands.

- [ ] **Step 1: Import `FloatingIsland` and remove the temporary unused-var guard from Task 2**

```tsx
import { FloatingIsland } from "@/components/pdf/edit/FloatingIsland";
```

Delete the `void selectedElement;` line added in Task 2 Step 4 (if it was needed) — Step 3 below gives `selectedElement` a real consumer.

- [ ] **Step 2: Remove the page-nav + zoom block from the top toolbar**

Find (the page-nav and zoom blocks together, between the Undo/Redo cluster and "File name"/"Start new"):
```tsx
        <div className="mx-1 h-6 w-px shrink-0 bg-[var(--text-primary)]/10" />

        <div className="flex items-center gap-0.5">
          <button type="button" disabled={pageIndex === 0} onClick={() => setPageIndex((c) => Math.max(0, c - 1))} aria-label="Previous page" title="Previous page (PageUp)" className="grid h-9 !w-9 shrink-0 place-items-center rounded-[var(--radius-md)] text-[var(--text-secondary)] transition hover:bg-[var(--text-primary)]/[0.06] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lumeo-gold)] disabled:cursor-not-allowed disabled:opacity-30">
            <ChevronLeftIcon />
          </button>
          <span className="whitespace-nowrap px-0.5 text-xs font-bold tabular-nums text-[var(--text-secondary)]">
            {pageIndex + 1} / {pdf.pageCount}
          </span>
          <button type="button" disabled={pageIndex === pdf.pageCount - 1} onClick={() => setPageIndex((c) => Math.min(pdf.pageCount - 1, c + 1))} aria-label="Next page" title="Next page (PageDown)" className="grid h-9 !w-9 shrink-0 place-items-center rounded-[var(--radius-md)] text-[var(--text-secondary)] transition hover:bg-[var(--text-primary)]/[0.06] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lumeo-gold)] disabled:cursor-not-allowed disabled:opacity-30">
            <ChevronRightIcon />
          </button>
        </div>

        <div className="mx-1 h-6 w-px shrink-0 bg-[var(--text-primary)]/10" />

        <div className="flex items-center gap-0.5">
          <button type="button" onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))} aria-label="Zoom out" title="Zoom out (or Ctrl/Cmd + scroll)" className="grid h-9 !w-9 shrink-0 place-items-center rounded-[var(--radius-md)] text-base font-bold text-[var(--text-secondary)] transition hover:bg-[var(--text-primary)]/[0.06] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lumeo-gold)]">
            −
          </button>
          <span className="w-11 text-center text-xs font-bold tabular-nums text-[var(--text-secondary)]">{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => setZoom((z) => Math.min(2, z + 0.1))} aria-label="Zoom in" title="Zoom in (or Ctrl/Cmd + scroll)" className="grid h-9 !w-9 shrink-0 place-items-center rounded-[var(--radius-md)] text-base font-bold text-[var(--text-secondary)] transition hover:bg-[var(--text-primary)]/[0.06] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lumeo-gold)]">
            +
          </button>
          <L2ToolbarButton onClick={() => setZoom(1)} className="ml-0.5">
            Fit
          </L2ToolbarButton>
        </div>
```
Delete this whole block (both dividers included). The top bar now goes directly from the Undo/Redo cluster's closing divider... actually delete that divider too — leave exactly ONE divider between Undo/Redo and the file-name/Start-new group:
```tsx
        <div className="mx-1 h-6 w-px shrink-0 bg-[var(--text-primary)]/10" />
```
(the first one, immediately after Redo — keep this single one, delete the two that bracketed page-nav/zoom).

Now `ChevronLeftIcon`/`ChevronRightIcon` function definitions (originally lines 343-357) are unused in this file — delete them (they now live in `FloatingIsland.tsx`).

- [ ] **Step 3: Render `FloatingIsland` with mode selection based on `selectedElement`**

Find the closing of the canvas/MicroDock wrapper added in Task 2:
```tsx
        <MicroDock
          activeTool={activeTool}
          onSelectTool={setActiveTool}
          shapeKind={shapeKind}
          onShapeKindChange={setShapeKind}
          inkColor={inkColor}
          onInkColorChange={setInkColor}
          inkStrokeWidth={inkStrokeWidth}
          onInkStrokeWidthChange={setInkStrokeWidth}
          onPrivacyShieldClick={() => {}}
          privacyShieldMatchCount={0}
        />
      </div>
```
Replace with (adds `FloatingIsland` as a sibling to `MicroDock`, both inside the same relative-positioned wrapper):
```tsx
        <MicroDock
          activeTool={activeTool}
          onSelectTool={setActiveTool}
          shapeKind={shapeKind}
          onShapeKindChange={setShapeKind}
          inkColor={inkColor}
          onInkColorChange={setInkColor}
          inkStrokeWidth={inkStrokeWidth}
          onInkStrokeWidthChange={setInkStrokeWidth}
          onPrivacyShieldClick={() => {}}
          privacyShieldMatchCount={0}
        />

        {selectedElement && selectedElement.type === "text" ? (
          <FloatingIsland
            mode="text-inspector"
            element={selectedElement}
            onPatch={(patch) => setElements((current) => patchElement(current, selectedElement.id, patch as Partial<EditElement>))}
          />
        ) : (
          <FloatingIsland
            mode="default"
            pageIndex={pageIndex}
            pageCount={pdf.pageCount}
            onPrevPage={() => setPageIndex((c) => Math.max(0, c - 1))}
            onNextPage={() => setPageIndex((c) => Math.min(pdf.pageCount - 1, c + 1))}
            zoom={zoom}
            onZoomOut={() => setZoom((z) => Math.max(0.5, z - 0.1))}
            onZoomIn={() => setZoom((z) => Math.min(2, z + 0.1))}
            onFit={() => setZoom(1)}
          />
        )}
      </div>
```

- [ ] **Step 4: Typecheck, lint, test, build**

Run: `npm test && npx tsc --noEmit && npx eslint . && npm run build`
Expected: all pass. This task only rearranges JSX and re-wires existing callbacks — no `lib/` logic changes, so the pre-existing 427 tests are unaffected.

- [ ] **Step 5: Manual browser check**

- Page nav (Prev/Next + counter) and zoom (−/+/Fit) now render in the bottom-center island by default.
- Selecting a placed text element switches the island to font-size/color/Bold/Italic controls; changes apply immediately to the canvas.
- Deselecting (click empty canvas) returns the island to default (nav/zoom) mode.
- Selecting a shape or whiteout element does NOT change the island's mode (stays in default/nav-zoom).
- Selecting an existing PDF text run still shows its own separate inline input + Apply/Cancel over the text, untouched, with no interaction with the island.
- Top bar: Undo/Redo, one divider, file name input, Start new — no more page-nav/zoom there.

- [ ] **Step 6: Commit**

```bash
git add components/pdf/EditPdfTool.tsx
git commit -m "feat(workspace): wire FloatingIsland, restore placed-text formatting via inspector mode"
```

---

## Phase 3: Privacy Shield

### Task 5: Create `lib/pdf/edit/privacyShield.ts` + unit tests

**Files:**
- Create: `lib/pdf/edit/privacyShield.ts`
- Create: `tests/edit-pdf-privacy-shield.test.ts`

**Interfaces:**
- Consumes: `DetectedTextRun` type from `lib/pdf/edit/textRuns.ts` (already exists — `{ str, fontName, xPct, yPct, widthPct, heightPct, fontSizePx, rotated }`).
- Produces: `scanForSensitiveInfo(runs: DetectedTextRun[]): PrivacyShieldMatch[]`, where `PrivacyShieldMatch = { run: DetectedTextRun; category: "account-number" | "currency" | "phone" }`. Consumed by Task 6.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/edit-pdf-privacy-shield.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { scanForSensitiveInfo } from "../lib/pdf/edit/privacyShield.ts";
import type { DetectedTextRun } from "../lib/pdf/edit/textRuns.ts";

function makeRun(str: string): DetectedTextRun {
  return { str, fontName: "Helvetica", xPct: 10, yPct: 10, widthPct: 20, heightPct: 4, fontSizePx: 12, rotated: false };
}

test("scanForSensitiveInfo matches a currency amount", () => {
  const matches = scanForSensitiveInfo([makeRun("Total Amount : 1350.00")]);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].category, "currency");
});

test("scanForSensitiveInfo matches a long structured digit sequence (account/service number)", () => {
  const matches = scanForSensitiveInfo([makeRun("6534501001928")]);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].category, "account-number");
});

test("scanForSensitiveInfo matches a 10-digit phone number", () => {
  const matches = scanForSensitiveInfo([makeRun("9876543210")]);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].category, "phone");
});

test("scanForSensitiveInfo does not match ordinary short text", () => {
  const matches = scanForSensitiveInfo([makeRun("Thank You!"), makeRun("Circle Name"), makeRun("TIRUPATI")]);
  assert.equal(matches.length, 0);
});

test("scanForSensitiveInfo does not match a short 2-3 digit number (page numbers, division codes)", () => {
  const matches = scanForSensitiveInfo([makeRun("55"), makeRun("Division Code : 55")]);
  assert.equal(matches.length, 0);
});

test("scanForSensitiveInfo returns one match per matching run, preserving each run's own bounding box", () => {
  const runs = [makeRun("Thank You!"), { ...makeRun("1350.00"), xPct: 40, yPct: 20 }];
  const matches = scanForSensitiveInfo(runs);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].run.xPct, 40);
  assert.equal(matches[0].run.yPct, 20);
});

// Documents a known false-positive risk rather than claiming perfect
// accuracy -- see docs/superpowers/specs/2026-08-10-workspace-redesign-design.md's
// Testing section. A 10-digit number that ISN'T actually an account
// number (e.g. a long invoice line item) still matches "account-number":
// regex can't distinguish intent, only shape.
test("scanForSensitiveInfo known false-positive: any 10+ digit sequence matches, regardless of real meaning", () => {
  const matches = scanForSensitiveInfo([makeRun("Reference 1234567890 for tracking")]);
  assert.equal(matches.length, 1);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx tsx --test tests/edit-pdf-privacy-shield.test.ts`
Expected: FAIL — `Cannot find module '../lib/pdf/edit/privacyShield.ts'`.

(Check `package.json`'s `"test"` script first to confirm the exact test runner invocation this project uses — match that instead of guessing `npx tsx --test` if it differs.)

- [ ] **Step 3: Write the implementation**

```ts
// lib/pdf/edit/privacyShield.ts
//
// Self-contained (no project-file imports), matching every other pure
// logic module in this directory -- see lib/pdf/edit/elements.ts's own
// top comment for why. Deterministic regex pattern matching only, no
// ML/AI -- this module's whole job is to be honestly exactly what it
// says: fixed patterns, explainable matches, zero network calls.
//
// Deliberately conservative on account-number matching (10+ digits) to
// avoid flagging short codes like division codes or page numbers, but
// this is shape-based, not meaning-based -- see this module's own test
// file for the documented false-positive risk (a random 10-digit
// sequence that isn't really an account number still matches).

export type PrivacyShieldMatch<TRun> = {
  run: TRun;
  category: "account-number" | "currency" | "phone";
};

// Order matters: currency and phone patterns are checked first since
// they're more specific (decimal point, or a recognizable phone shape)
// than the broad "10+ digit sequence" account-number fallback -- a
// string matching both only gets counted once, in its most specific
// category.
const CURRENCY_PATTERN = /(?:₹|Rs\.?|INR|\$)?\s?\d{1,3}(?:,\d{2,3})*\.\d{2}\b/;
const PHONE_PATTERN = /\b(?:\+?\d{1,3}[-\s]?)?\d{10}\b/;
const ACCOUNT_NUMBER_PATTERN = /\b\d{10,}\b/;

export function scanForSensitiveInfo<TRun extends { str: string }>(runs: TRun[]): Array<PrivacyShieldMatch<TRun>> {
  const matches: Array<PrivacyShieldMatch<TRun>> = [];
  for (const run of runs) {
    if (CURRENCY_PATTERN.test(run.str)) {
      matches.push({ run, category: "currency" });
    } else if (PHONE_PATTERN.test(run.str) && run.str.replace(/\D/g, "").length === 10) {
      matches.push({ run, category: "phone" });
    } else if (ACCOUNT_NUMBER_PATTERN.test(run.str)) {
      matches.push({ run, category: "account-number" });
    }
  }
  return matches;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx --test tests/edit-pdf-privacy-shield.test.ts` (or this project's actual test command)
Expected: all 7 tests PASS.

- [ ] **Step 5: Run the full suite, typecheck, lint**

Run: `npm test && npx tsc --noEmit && npx eslint lib/pdf/edit/privacyShield.ts tests/edit-pdf-privacy-shield.test.ts`
Expected: 434/434 tests pass (427 existing + 7 new), zero type/lint errors.

- [ ] **Step 6: Commit**

```bash
git add lib/pdf/edit/privacyShield.ts tests/edit-pdf-privacy-shield.test.ts
git commit -m "feat(privacy-shield): add deterministic regex scan engine with unit tests"
```

---

### Task 6: Wire Privacy Shield end-to-end in `EditPdfTool.tsx`

**Files:**
- Modify: `components/pdf/EditPdfTool.tsx`

**Interfaces:**
- Consumes: `scanForSensitiveInfo` from `@/lib/pdf/edit/privacyShield` (Task 5); `createWhiteoutElement` from `@/lib/pdf/edit/elements` (already imported); `detectedTextRuns` (existing state, current page's runs).
- Produces: fully working Privacy Shield feature — this is the last code task before Phase 4 QA.

- [ ] **Step 1: Import `scanForSensitiveInfo` and add match state**

```tsx
import { scanForSensitiveInfo, type PrivacyShieldMatch } from "@/lib/pdf/edit/privacyShield";
```

Add state near the other tool-related state (alongside `whiteoutDraft`/`shapeKind`):
```ts
  const [privacyShieldMatches, setPrivacyShieldMatches] = useState<Array<PrivacyShieldMatch<DetectedTextRun>>>([]);
```

- [ ] **Step 2: Add scan/dismiss/apply handlers**

Add these functions near `resetTool` or another existing handler (same component body):
```ts
  function handlePrivacyShieldScan() {
    setPrivacyShieldMatches(scanForSensitiveInfo(detectedTextRuns));
  }

  function dismissPrivacyShieldMatch(index: number) {
    setPrivacyShieldMatches((current) => current.filter((_, i) => i !== index));
  }

  function applyPrivacyShieldRedactions() {
    setElements((current) => {
      let next = current;
      for (const match of privacyShieldMatches) {
        const id = crypto.randomUUID();
        const element = createWhiteoutElement(id, pageIndex, match.run.xPct, match.run.yPct, "white");
        next = [...next, { ...element, widthPct: match.run.widthPct, heightPct: match.run.heightPct }];
      }
      return next;
    });
    setPrivacyShieldMatches([]);
  }
```

(Check how this file generates ids for other created elements — e.g. search for `createTextElement(` call sites — and match that exact id-generation approach instead of `crypto.randomUUID()` if the codebase already uses a different helper.)

- [ ] **Step 3: Wire the MicroDock trigger and match count**

Find (from Task 4):
```tsx
          onPrivacyShieldClick={() => {}}
          privacyShieldMatchCount={0}
```
Replace with:
```tsx
          onPrivacyShieldClick={handlePrivacyShieldScan}
          privacyShieldMatchCount={privacyShieldMatches.length}
```

- [ ] **Step 4: Render highlight overlays + Apply/dismiss controls**

Find where `TextRunOverlay` elements are rendered (the `detectedTextRuns.map(...)` block) and add a sibling block immediately after its closing, still inside the same page-canvas container:
```tsx
        {privacyShieldMatches.length > 0 ? (
          <>
            {privacyShieldMatches.map((match, index) => (
              <button
                key={`${match.run.xPct}-${match.run.yPct}-${index}`}
                type="button"
                onClick={() => dismissPrivacyShieldMatch(index)}
                title={`${match.category} match -- click to exclude from redaction`}
                className="absolute z-20 rounded-[2px] border-2 border-[var(--lumeo-gold)] bg-[var(--lumeo-gold)]/10"
                style={{
                  left: `${match.run.xPct}%`,
                  top: `${match.run.yPct}%`,
                  width: `${match.run.widthPct}%`,
                  height: `${match.run.heightPct}%`,
                }}
              />
            ))}
            <div className="absolute z-30 bottom-24 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-[var(--text-primary)]/14 bg-[var(--atelier-surface-1)]/96 px-3 py-2 shadow-lg">
              <span className="text-xs font-semibold text-[var(--text-primary)]/70">{privacyShieldMatches.length} match{privacyShieldMatches.length === 1 ? "" : "es"} found</span>
              <button
                type="button"
                onClick={applyPrivacyShieldRedactions}
                className="min-h-9 rounded-full bg-[var(--lumeo-gold)]/90 px-3 text-xs font-bold text-[var(--atelier-surface-0)] transition hover:bg-[var(--lumeo-gold)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lumeo-gold)]"
              >
                Apply redactions
              </button>
            </div>
          </>
        ) : null}
```
(Confirm the exact container this needs to sit inside by finding the JSX comment `{/* Phase 10.2: kept mounted regardless of activeTool... */}` above the `detectedTextRuns.map` block from Task 2's read of the file — the highlight overlays must be inside the same percent-space-positioned page container that `TextRunOverlay`/`EditElementView` already use, not the outer full-bleed wrapper added in Task 2.)

- [ ] **Step 5: Handle the empty-text-layer case**

In `handlePrivacyShieldScan`, if `detectedTextRuns.length === 0`, this already naturally results in `scanForSensitiveInfo([])` returning `[]` — `privacyShieldMatches` stays empty, no overlays render, no "Apply" button appears. Confirm this reuses the existing "No editable text found" messaging already shown elsewhere in the Select-tool sidebar/flyout for a scanned PDF — no new error UI needed, per the spec.

- [ ] **Step 6: Run full test suite, typecheck, lint, build**

Run: `npm test && npx tsc --noEmit && npx eslint . && npm run build`
Expected: 434/434 tests pass, zero type/lint errors, build succeeds.

- [ ] **Step 7: Manual browser check**

- Upload a PDF with real text (e.g. a bill/invoice with an amount and account number).
- Click the Privacy Shield icon in `MicroDock` — gold-outlined highlights appear over matching runs, match-count badge shows on the icon.
- Click one highlight — it disappears (dismissed), count updates.
- Click "Apply redactions" — remaining highlights become real white whiteout boxes; the "Apply" bar and remaining highlight outlines disappear.
- Undo — the applied whiteout elements are removed via the existing undo stack, one at a time.
- Delete an individual applied redaction directly (select it with the Select tool, delete) — works exactly like any other whiteout element, since it IS one.
- Export the PDF — redacted areas are genuinely covered in the downloaded file (reuses existing whiteout export path, already covered by `tests/edit-pdf-export.test.ts`'s whiteout test).
- Try on a scanned/image-only PDF with no text layer — Privacy Shield produces no matches, no crash, no new error UI.

- [ ] **Step 8: Commit**

```bash
git add components/pdf/EditPdfTool.tsx
git commit -m "feat(privacy-shield): wire scan/highlight/dismiss/apply flow into EditPdfTool"
```

---

## Phase 4: Final QA & Regression Verification

### Task 7: Full verification + isolation confirmation

**Files:** none (verification only).

- [ ] **Step 1: Full automated verification**

Run in sequence:
```bash
npm test
npx tsc --noEmit
npx eslint .
npm run build
```
Expected: all four pass cleanly (434/434 tests, zero type errors, zero lint errors/warnings, successful production build).

- [ ] **Step 2: Confirm branch isolation from PR #232**

```bash
git fetch origin
git diff main...feat/edit-pdf-professional-text-formatting --stat
git diff main...feature/workspace-redesign --stat
```
Expected: the two file-change lists share NO overlapping files (`#232` touches `lib/pdf/edit/elements.ts`, `lib/pdf/edit/export.ts`, `components/pdf/EditPdfTool.tsx`, `components/pdf/edit/SelectionFormatToolbar.tsx`, two test files; this branch touches `components/pdf/EditPdfTool.tsx`, `components/pdf/edit/MicroDock.tsx`, `components/pdf/edit/FloatingIsland.tsx`, `lib/pdf/edit/privacyShield.ts`, `tests/edit-pdf-privacy-shield.test.ts`, two docs files). `EditPdfTool.tsx` appears in both — that's expected and fine (each branch independently modifies it from the same `main` base); confirm neither branch's commits were built ON TOP of the other (`git merge-base feature/workspace-redesign feat/edit-pdf-professional-text-formatting` must equal `git merge-base feature/workspace-redesign main`, proving this branch never incorporated #232's commits).

- [ ] **Step 3: Manual regression pass — desktop**

On `/pdf/edit` with a real text PDF (top-edge, bottom-edge, left-edge, right-edge, small-text placements):
- Select/Text/Draw/Shape/Whiteout all function via `MicroDock`, flyout panels show correct per-tool settings.
- Existing-PDF-text-run selection: font/size/color/position/layout all still correct after an edit; Apply/Cancel/Escape/Undo/Redo all work exactly as before.
- Placed text: create, move, resize, delete, and the `FloatingIsland` inspector (size/color/Bold/Italic) all work; deselect/reselect preserves formatting.
- Draw/Shape/Whiteout: create/move/resize/delete all function.
- Privacy Shield: scan → dismiss → apply → undo → export, verified in an independent PDF viewer (not just inside Lumeo).
- Page navigation and zoom via `FloatingIsland`'s default mode.
- Tool switching (Select→Text→Draw→Shape→Whiteout→Select): no stale flyout, no stale island mode, no stale selection.

- [ ] **Step 4: Manual regression pass — mobile**

Resize to 375px and 390px (or real device):
- `MicroDock` renders as a horizontal row (top-pinned), all 6 icons reachable, 44px touch targets, flyout panel doesn't clip off-screen.
- `FloatingIsland` stays usable at the bottom, wraps to a second row if the inspector-mode controls don't fit one line.
- No horizontal page overflow.
- Privacy Shield scan/apply flow works with touch.

- [ ] **Step 5: Report results**

Summarize: full automated verification status (pass/fail with exact output), isolation confirmation (git diff results), desktop manual pass results, mobile manual pass results. Do NOT merge — this branch requires explicit user approval before any merge, per this codebase's established workflow (see git history: every prior PR in this repo was reported and held for explicit merge approval, never auto-merged).

---

## Plan self-review notes

- **Spec coverage:** Layout architecture (Task 2), MicroDock (Task 1-2), FloatingIsland (Task 3-4), Privacy Shield module + tests (Task 5), Privacy Shield UI flow (Task 6), mobile adaptation (Tasks 1/3's responsive classes, verified in Task 7 Step 4), testing (Task 5's unit tests + Task 7's full suite), error handling (Task 6 Step 5) — all spec sections have a corresponding task.
- **Gap resolved beyond the spec:** the spec's Components section didn't say where the old sidebar's per-tool contextual cards (Text hint, Shape-kind picker, Draw color/thickness, Whiteout hint) or the File-name input would live once the sidebar is deleted. Resolved here as: contextual cards → `MicroDock`'s flyout panel (consistent with the original brainstorming request's "smooth expand/collapse flyouts" language); File-name input → top toolbar. Flagged explicitly rather than left as a placeholder.
- **Open items from the spec** ("exact regex patterns," "where Apply/dismiss controls render") are resolved concretely in Task 5 (patterns) and Task 6 (controls render as an overlay bar above the canvas, not inside `FloatingIsland`, since matches are per-run across the whole page, not tied to one selection).
