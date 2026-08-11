# Edit PDF Workspace Redesign + Privacy Shield — Design Spec

**Branch:** `feature/workspace-redesign` (off `main`, isolated from PR #232)
**Date:** 2026-08-10
**Status:** Approved, pending implementation plan

## Goal

Replace Edit PDF's current chunky sidebar/toolbar layout with an immersive, minimalist full-canvas workspace (left micro-dock + bottom floating pill), and add a new "Privacy Shield" regex-based auto-redaction feature. Two independent subsystems, built and reasoned about separately, but shipped on one branch/PR since they share the same UI shell.

## Non-goals

- Does not touch or depend on PR #232 (contextual formatting toolbar for placed text / existing-text font info / italic+underline export fix). This branch starts from `main`, without those changes.
- Does not restyle the existing-PDF-text-run inline editor (input + Apply/Cancel over a selected text run) — stays exactly as-is, visually and logically.
- Does not add property-inspector controls for shapes/whiteout elements in v1 — they keep their current sidebar-style controls.
- No real AI/ML — Privacy Shield is deterministic regex matching, labeled honestly as such.
- No Fabric.js or other new canvas library — placed elements stay plain positioned DOM (matching today's `EditElementView.tsx` approach).

## Architecture

**Approach: view swap, logic untouched.** All existing state and hooks in `EditPdfTool.tsx` (tool selection, elements array, selection state, zoom, undo/redo, page navigation, edit-plan preview) are preserved exactly as they are today. Only the presentational shell changes: today's side-by-side "canvas + permanent right sidebar" grid is replaced by a full-bleed canvas with two new components absolutely positioned on top of it.

This keeps the redesign a pure UI-layer change — no risk to the drag/resize/keyboard/undo logic that's already built and tested.

## Components

### Layout shell

- Canvas fills the full viewport (minus the existing slim top bar for filename/Start New/Export — unchanged, not part of this redesign).
- Background: neutral dark/gray using existing design tokens (no new color system).
- The permanent right sidebar is removed entirely; nothing replaces it in normal document flow — `MicroDock` and `FloatingIsland` float on top of the canvas instead.

### `MicroDock.tsx`

- Desktop (≥640px): vertical slim icon strip, `absolute left-4 top-1/2 -translate-y-1/2`.
- Mobile (<640px): horizontal icon row pinned to an edge (top or bottom), full width.
- Icons: Select, Text, Draw, Shape, Whiteout, Privacy Shield.
- Active tool: subtle background highlight/border glow using existing design tokens.
- Clicking a tool updates `activeTool` state in the parent (`EditPdfTool.tsx`) via a passed-down callback — no local state, no layout shift.
- One component, two visual arrangements via Tailwind breakpoints — no separate mobile component, no logic duplication.

### `FloatingIsland.tsx`

- `absolute bottom-6 left-1/2 -translate-x-1/2`, glassmorphism pill styling.
- **Default mode:** page navigation (Prev/Next + page counter) and zoom controls (−/+/Fit). Shown whenever nothing relevant is selected.
- **Selected-placed-text mode:** when a *placed text element* is selected, morphs into a contextual inspector: font size, color, bold, italic. This is the ONLY selection state that changes the island's mode in v1.
  - Selecting a shape or whiteout element: island stays in default mode; those elements keep their current sidebar-style controls (out of scope for v1's inspector).
  - Selecting an existing PDF text run: island is entirely uninvolved — that flow keeps its own separate, untouched inline input + Apply/Cancel editor positioned over the text run itself.
- Mobile: shrinks padding/gaps; inspector-mode controls wrap to a second row if they don't fit at 375px.
- All controls meet the project's existing 44px minimum touch target (per PR #230's established convention).

## Privacy Shield

**Module:** `lib/pdf/edit/privacyShield.ts` — pure functions, no UI or React state dependency, self-contained like every other `lib/pdf/edit/*.ts` module in this codebase (importable/testable under `node --experimental-strip-types`).

- **Input:** the current page's `detectedTextRuns` (existing type from `lib/pdf/edit/textRuns.ts` — already carries `str` plus percent-space bounding box per run; this is the same data the existing-text editor already uses, no new extraction pipeline).
- **Matching:** fixed set of deterministic regex patterns for v1 — account/service numbers (structured digit sequences), currency/amount values, phone numbers. Function returns the subset of runs that matched, with their existing bounding boxes.
- **Scope:** current page only for v1 (matches how `detectedTextRuns` is already scoped per-page-navigation; whole-document scanning is out of scope, would need new cross-page data plumbing).
- **UI copy:** "Privacy Shield," "Scan for sensitive info," "Apply redactions" — no AI/ML language anywhere, since this is deterministic pattern matching, not a model.

**Interaction flow (highlight-then-confirm, not one-click-immediate):**

1. User clicks the Privacy Shield icon in `MicroDock`.
2. Engine scans current page's `detectedTextRuns`, returns matches.
3. Matches render as gold-outlined highlight overlays (visually consistent with existing `TextRunOverlay` styling) — no whiteout placed yet.
4. User can click an individual highlight to dismiss it (exclude a false positive) before applying.
5. An "Apply" control (appears once matches exist) converts each remaining confirmed highlight into a real `WhiteoutEditElement`, via the existing `createWhiteoutElement` + `setElements` path.
6. From that point on, each redaction is a normal whiteout element — same undo/redo, same individual delete, same export path as a manually-drawn whiteout box. No new element type, no new export logic, no new undo mechanism.

**Error/edge handling:** if `detectedTextRuns` is empty (e.g., a scanned/image-only PDF with no text layer), Privacy Shield surfaces the same "No editable text found" pattern already used elsewhere in this tool — not a new error UI.

## Mobile adaptation

- `MicroDock.tsx`: below 640px, switches from vertical left strip to horizontal icon row pinned to an edge (top or bottom), full width. Same component, Tailwind breakpoint controls the arrangement — no separate mobile component, no logic duplication.
- `FloatingIsland.tsx`: shrinks horizontal padding/gaps at narrow widths; inspector-mode controls wrap to a second row if they overflow at 375px.
- Touch targets: 44px minimum throughout, matching the project's existing convention (established in PR #230).

## Testing

- `privacyShield.ts`: pure-function unit tests in `tests/`, following this codebase's existing pattern (e.g. `tests/edit-pdf-elements.test.ts`) — synthetic `detectedTextRuns` arrays as input, asserting which runs match/don't match each pattern. Tests should explicitly document known false-positive risk (regex can't fully distinguish intent — e.g., a random 10-digit number in body text vs. an actual account number) rather than claim perfect accuracy.
- `MicroDock.tsx` / `FloatingIsland.tsx`: presentational only, no new error states — they render whatever the parent (`EditPdfTool.tsx`) passes them, consistent with the view-swap approach (no logic duplicated into these components).
- Full existing test suite, typecheck, lint, and build must stay green — same verification bar as every other change in this codebase.
- Browser QA: desktop widths, 375px/390px mobile, all 5+1 tools (Select/Text/Draw/Shape/Whiteout/Privacy Shield), placed-text inspector morph, Privacy Shield scan→dismiss→apply→undo flow, existing-text-run editor unaffected.

## Open items for the implementation plan

- Exact Tailwind breakpoint and DOM structure for `MicroDock`'s mobile horizontal-row transform.
- Exact regex patterns for account numbers / currency / phone numbers (need to be scoped precisely — "account number" varies by document type; v1 patterns should be documented with examples in the module's own comments).
- Where "Apply"/dismiss controls for Privacy Shield highlights render (part of `FloatingIsland`, or a separate small control cluster near the highlights themselves) — not yet decided, needs a plan-time decision.
