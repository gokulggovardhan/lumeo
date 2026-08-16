# Aura OS v2 — Complete Visual Design Specification

Status: **Design only. Not committed. Not implemented. Awaiting approval.**
Branch: `feat/aura-os-v2` (uncommitted working file)
Builds on: `docs/AURA_OS_V2_PLAN.md` (Phases 2-7 architectural analysis)
Date: 2026-07-30

## How to read this document

This is a design specification, not a verified audit. Where it references
Lumeo's *current* code (existing tokens, existing components), that's
grounded in files read this session — cited by path. Where it defines
*new* v2 design decisions, those are proposals for you to approve, reject,
or redirect — not facts, not measurements. No number in this document
(a duration, a spacing value, a radius) has been user-tested; they are
starting points chosen for internal consistency with each other and with
Lumeo's existing motion/shadow/typography systems, ready to be tuned
once real implementation and real usage exists.

---

# PHASE 1 — DESIGN LANGUAGE

## Personality

Aura OS should feel like **a quiet, precise instrument** — the emotional
register of a well-made mechanical watch, not a toy. It does exactly what
you ask, immediately, and then gets out of the way. It is confident
enough to use empty space instead of filling it, and restrained enough
that when it does use color or motion, that choice carries meaning.

Concretely, that rules out: playful bounce easing, decorative gradients
without semantic purpose, confetti/celebration animations, mascots or
illustration-heavy empty states, and any affordance that exists to look
impressive rather than to communicate state.

## Emotional feeling, by moment

| Moment | Should feel like |
|---|---|
| Opening a tool | A door opening onto a room that was already ready for you — no loading spinner theater, no "please wait" ceremony beyond what's genuinely necessary |
| Dropping a file | Immediate, physical acknowledgment (the drop zone responds within one frame) — trust established instantly |
| Processing | Calm confidence, not anxious progress-bar micromanagement — a single clear state, not five competing indicators |
| Success | Quiet satisfaction — a checkmark and the result, not a celebration |
| Error | Direct and specific, never alarming for its own sake — red is reserved for this exact moment so it still means something when it appears |
| Admin console | Denser, faster, more utilitarian — this is a cockpit, not a showroom; the calm-and-spacious register of the public tools would actually slow down daily admin work |

## Visual hierarchy

Three-tier hierarchy, established primarily through **spacing and type
weight before color**, matching the research synthesis in the foundation
plan:

1. **Primary** — the one thing the user is doing right now (the upload
   zone, the canvas, the result card). Largest type weight jump in the
   scale, most whitespace around it, first in reading order.
2. **Secondary** — supporting controls and context (settings panel, file
   metadata, breadcrumbs). Present but visually quieter — this is what
   `--text-secondary`/`--surface-raised` already exist for in the current
   token set, and v2 keeps that role division.
3. **Tertiary** — system chrome (nav, footer, timestamps, fine print).
   Should be almost invisible until the user's eye specifically goes
   looking for it.

Color is **never** the primary hierarchy signal — it's reserved for
status (success/warning/danger) and the one accent used for the current
primary action, so that when color appears, it means something.

## Simplicity rules

- One primary action per screen, always. If a screen seems to need two
  primary actions, that's a sign it should be two screens or two steps.
- No control exists "just in case" — every visible element earns its
  place by being needed *now*, not eventually.
- Default to hiding advanced options behind a single, consistent
  disclosure pattern (already partially present as "Advanced settings" in
  the Merge tool, confirmed live this session) rather than surfacing
  everything at once.

## Whitespace philosophy

Whitespace is treated as an active design element, not leftover space.
Rule of thumb: **the more consequential the action, the more space around
it.** The upload zone (highest-consequence first action) gets the most
generous padding in the entire system; a settings toggle gets the least.
This directly extends Lumeo's existing pattern (confirmed live: Merge
PDF's empty state is spacious; its settings panel, once a file is
loaded, is denser) — v2 formalizes it as a rule rather than an emergent
pattern.

## Information density

Two explicit density modes, not a spectrum:

- **Spacious** (public site, tool empty/upload states, homepage) —
  generous spacing, larger type, fewer things visible at once.
- **Compact** (admin console, tool workspace once a file is loaded,
  settings panels) — tighter spacing, smaller type, more visible at
  once, optimized for someone who already knows what they're doing.

A component should declare which density it belongs to; nothing should
silently drift between the two.

## Interaction philosophy

Every interactive element responds **within one frame** of input — no
interaction should ever feel like it's waiting on the network before
providing local feedback (a button press, a hover, a focus ring all
happen instantly; only the *result* of an action, like a PDF actually
processing, has real latency, and that latency gets its own honest
progress state, not a fake instant one).

Direct manipulation is preferred over indirect: dragging a file page to
reorder it (already present in Merge PDF's drag interface, confirmed
live this session) is the model — v2 extends this principle to page
reordering, element placement (Sign/Edit tools), and watermark
positioning wherever it doesn't already apply.

## Motion philosophy

Motion exists to **explain a state change**, never to decorate. Every
animation in the system must answer "what is this motion telling the
user happened?" If the answer is "nothing, it just looks nice," it's cut.
This is a stricter reading of Lumeo's existing `--motion-*`/`--ease-*`
tokens (already well-designed per the foundation plan) — v2 doesn't
replace that system, it disciplines how it gets used.

## Accessibility philosophy

Accessibility is not a pass performed at the end — every component
defined in Phase 3 below specifies its accessibility behavior as part of
its definition, not as an addendum. The concrete standard: WCAG 2.1 AA
as the floor, with keyboard-equivalence for every mouse interaction
treated as non-negotiable (not "nice to have"), matching the existing
`focus-visible:ring-4` pattern already present on every `AuraButton`
variant (confirmed this session) — v2 extends that discipline to every
new component rather than introducing a new standard.

---

# PHASE 2 — DESIGN TOKENS (design only, not implemented)

All values below are **proposals**, expressed relative to and consistent
with Lumeo's existing token system (documented in
`docs/AURA_OS_V2_PLAN.md` Section 1) — not yet written into `globals.css`.

## Color palette

### Neutral scale (foundation for both themes)

A 12-step neutral scale, replacing the current three-generation naming
with one canonical set. Named by function, not brand era:

```
--neutral-0    (darkest, dark-theme canvas floor)
--neutral-50
--neutral-100
--neutral-200
--neutral-300
--neutral-400
--neutral-500  (midpoint — rarely used directly)
--neutral-600
--neutral-700
--neutral-800
--neutral-900
--neutral-1000 (lightest, light-theme canvas ceiling)
```

Dark theme reads this scale low-to-high (0 = canvas, 1000 = brightest
text); light theme reads it inverted (1000 = canvas, 0 = darkest text).
This single-scale-two-directions approach is what lets a light theme
exist without duplicating every semantic token's logic — only the
mapping direction changes.

### Accent color

One accent, not several. Lumeo's existing sage-green
(`--atelier-sage-500` / `#5c7f6b`, confirmed in `globals.css`) is
proposed to remain the v2 accent — it's already distinctive, already
used for primary actions, and changing it would be a rebrand decision
outside this spec's scope. Reserved for: primary CTAs, active/selected
states, and progress indicators. Never used decoratively.

### Semantic status colors

Keep exactly three, each with a single canonical value per theme —
success, warning, danger. (Info is folded into neutral — a fourth status
color dilutes the "color means something" rule from Phase 1.) Proposed
starting values carried forward from the existing `--atelier-success`/
`--atelier-warning`/`--atelier-danger` (already tuned, already tested
live via the error/success states observed this session) rather than
invented fresh.

### Glass colors (genuinely new — confirmed absent from current tokens)

Three tiers only, per the Phase 1 restraint rule:

```
--glass-thin:    4% neutral tint,  8px blur   — subtle overlays (tooltips)
--glass-regular: 8% neutral tint, 16px blur   — dialogs, sheets, popovers
--glass-thick:  14% neutral tint, 24px blur   — command palette, full-screen overlays
```

Each tier bundles blur radius + tint opacity + a matching border
treatment (a 1px hairline at slightly higher opacity than the fill) as
one token, so a component picks one glass tier, not four separate
properties to coordinate by hand.

### Surface, border, elevation colors

Keep the existing semantic naming pattern
(`--surface-base/raised/elevated/floating/overlay`,
`--border-hairline/subtle/default/strong/focus`) — these names are
already good and already consumed throughout the codebase. v2 changes
what they *resolve to* per theme, not their names, directly following
the "keep the semantic layer" recommendation in the foundation plan.

### Opacity scale

```
--opacity-disabled: 0.4
--opacity-muted:     0.6
--opacity-subtle:    0.8
--opacity-full:      1.0
```

Four steps only — enough to express "this is off," "this is
de-emphasized," "this is present but quiet," and "this is fully here,"
without an opacity value being invented ad hoc per component.

## Spacing scale

4px base unit, 9 steps — matches the "strict 4/8px rhythm" pattern
identified in the design research as common to Stripe/Vercel/Notion/
Figma:

```
--space-1: 4px    --space-2: 8px    --space-3: 12px
--space-4: 16px   --space-5: 20px   --space-6: 24px
--space-8: 32px   --space-10: 40px  --space-12: 48px
```

## Border radius scale

Keep Lumeo's existing 7-step scale as-is
(`--radius-xs` 6px through `--radius-pill`, confirmed in `globals.css`)
— it's already well-proportioned and already used consistently. New
rule (formalized in Phase 7): a component's radius must scale with its
own size, never mixing a small-control radius on a large surface or
vice versa.

## Typography scale

Keep Lumeo's existing fluid `clamp()`-based scale
(`--text-display-xl` through `--text-micro`, confirmed in `globals.css`)
— it already handles responsive sizing without breakpoint-specific
overrides, which is exactly the "typographic scale as hierarchy"
pattern identified in the design research. No new sizes proposed;
v2's job here is discipline (use the scale consistently), not expansion.

## Shadow scale

Keep the existing `--shadow-xs` through `--shadow-xl` scale plus its
semantic aliases (`--shadow-floating`, `--shadow-interactive`,
`--shadow-focus`, confirmed in `globals.css`). New rule (Phase 7):
maximum 3 shadow levels visible in any single view at once (e.g. base
surface, one raised card, one floating dialog) — never stack more,
matching the "never more than X shadow levels" example rule the mission
itself suggested.

## Icon sizes

```
--icon-sm: 16px   (inline with body text, dense admin rows)
--icon-md: 20px   (default — buttons, list items)
--icon-lg: 24px   (section headers, empty states)
--icon-xl: 32px   (tool identity glyphs, e.g. the icon shown on each
                    tool's empty-state upload zone)
```

## Stroke widths

```
--stroke-thin:    1px  (hairline borders, dividers)
--stroke-regular: 1.5px (icon strokes — matches most icon libraries' default)
--stroke-bold:    2px  (focus rings, active-state emphasis)
```

## Animation durations (extends existing tokens, doesn't replace)

Lumeo's existing 5-step scale (`--motion-instant` 90ms through
`--motion-entrance` 320ms, confirmed in `globals.css`) is kept as the
foundation. v2 adds **purpose names**, not new raw values, per the
"purpose-named transitions" recommendation in the foundation plan:

```
--motion-hover:      var(--motion-instant)    (90ms  — hover/press feedback)
--motion-focus:      var(--motion-instant)    (90ms  — focus ring appearance)
--motion-toggle:     var(--motion-fast)       (140ms — checkbox/switch/tab change)
--motion-card-enter: var(--motion-standard)   (200ms — card/list item entrance)
--motion-sheet:      var(--motion-expressive) (240ms — dialog/sheet open/close)
--motion-page:       var(--motion-entrance)   (320ms — full route transition, used sparingly)
```

## Animation easing

Keep the existing three curves (`--ease-standard`, `--ease-enter`,
`--ease-exit`, confirmed in `globals.css`) — they already cover
"symmetric," "decelerate on entry," and "accelerate on exit," which is
the complete set most systems need. No new curves proposed.

## Hover / focus / loading timings

- **Hover**: `--motion-hover` (90ms), `--ease-standard` — must feel
  instantaneous; anything slower reads as lag, not intentional motion.
- **Focus**: `--motion-focus` (90ms), no easing needed (a ring
  appearing is a binary state, not a value being interpolated toward).
- **Loading**: no fixed duration (loading states run until the real
  operation completes) but the *entrance* of a loading indicator uses
  `--motion-card-enter` (200ms) so it doesn't pop in jarringly if the
  operation is fast enough that the loading state barely shows.

---

# PHASE 3 — COMPONENT INVENTORY

For each component: Purpose, Behavior, Variants, States, Accessibility,
Responsive behavior, Animation. Components already fully correct in the
current system (confirmed this session) are marked **[carry forward]**
— described for completeness, not proposed for rework.

## Button **[carry forward, mostly]**

- **Purpose**: trigger a single action.
- **Behavior**: press-and-release model; `loading` state disables further
  presses and shows a spinner in place of/alongside the label.
- **Variants**: primary, secondary, ghost, premium, danger, success, icon
  — all 7 already exist and are correctly implemented (`components/ui/Aura.tsx`,
  confirmed this session). v2 keeps this exact variant set.
- **States**: default, hover, focus-visible, active/pressed, disabled,
  loading — all already implemented with a complete `focus-visible:ring-4`,
  `active:scale-[0.985]`, `disabled:opacity-60` pattern. No change
  proposed to the state model itself.
- **Accessibility**: real `<button>` element, disabled state removes it
  from tab order correctly via native `disabled` attribute, loading
  state should additionally set `aria-busy="true"` (verify this is
  present during implementation — not confirmed either way this
  session).
- **Responsive**: fixed min-height per size (already `min-h-10/11/12`),
  full-width variant needed for mobile primary actions (verify existing
  usage pattern during implementation).
- **Animation**: `--motion-hover` for hover/active transitions (already
  matches).

## Input (text field)

- **Purpose**: single-line text entry (filenames, search, form fields).
- **Behavior**: label always visible (never placeholder-as-label — a
  known accessibility anti-pattern), inline validation message appears
  below the field, not as a tooltip.
- **Variants**: default, with leading icon, with trailing action (e.g.
  clear button).
- **States**: default, hover, focus, filled, error, disabled.
- **Accessibility**: `<label>` with `for` attribute (or wrapping label),
  error state sets `aria-invalid="true"` and `aria-describedby` pointing
  to the error message.
- **Responsive**: full-width on mobile by default; fixed max-width on
  desktop where the content doesn't benefit from stretching (e.g.
  filename field).
- **Animation**: border-color transition on focus, `--motion-hover`.

## Dropdown / Select

- **Purpose**: choose one value from a closed set.
- **Behavior**: opens a `--glass-regular` panel anchored to the trigger;
  closes on selection, outside click, or Escape.
- **Variants**: single-select, with search/filter (for long lists).
- **States**: closed, open, selected-value-shown, disabled.
- **Accessibility**: full `role="listbox"`/`role="option"` pattern with
  arrow-key navigation and type-ahead; trigger has `aria-haspopup` and
  `aria-expanded`.
- **Responsive**: on mobile, consider converting to a bottom sheet
  (Phase 4/6) rather than a small anchored popover, since anchored
  popovers are harder to hit accurately on touch.
- **Animation**: `--motion-sheet` (240ms) open/close, `--ease-enter`/`--ease-exit`.

## Checkbox / Switch

- **Purpose**: toggle a binary state (checkbox: part of a form/list;
  switch: an immediate-effect setting).
- **Behavior**: switch changes take effect immediately; checkbox changes
  are typically part of a larger form that's submitted separately —
  this distinction should be preserved, not blurred into one component.
- **States**: unchecked, checked, indeterminate (checkbox only), hover,
  focus, disabled.
- **Accessibility**: real `<input type="checkbox">`/native switch
  pattern with `role="switch"` and `aria-checked`, never a styled `<div>`
  with only a click handler.
- **Animation**: `--motion-toggle` (140ms) for the thumb/check
  transition.

## Dialog (modal)

- **Purpose**: interrupt the current flow for a decision that must be
  made before continuing (confirmation, destructive-action warning).
- **Behavior**: traps focus inside while open, returns focus to the
  triggering element on close, closes on Escape and backdrop click
  (unless the action is destructive-confirmation, where accidental
  backdrop-dismiss could be worse than requiring an explicit choice —
  judgment call per dialog, not a blanket rule).
- **Variants**: standard (title + body + actions), destructive
  (danger-colored primary action).
- **States**: entering, open, exiting.
- **Accessibility**: `role="dialog"`, `aria-modal="true"`,
  `aria-labelledby` pointing to the title, full focus trap.
- **Responsive**: full-screen on mobile, centered fixed-max-width on
  desktop.
- **Animation**: `--motion-sheet` scale+fade entrance from 96% to 100%
  scale, `--glass-regular` backdrop.

## Sheet (bottom sheet / side sheet)

- **Purpose**: present a secondary, dismissible surface without fully
  leaving the current context — the mobile-first equivalent of a
  dropdown/popover, and the proposed mobile pattern for Dropdown above.
- **Behavior**: slides in from an edge (bottom on mobile, side on
  desktop where used), draggable-to-dismiss on touch.
- **Accessibility**: same `role="dialog"` pattern as Dialog when it's
  modal; if non-modal (e.g. a persistent inspector panel), it should not
  trap focus.
- **Animation**: `--motion-sheet`, slide + fade, direction matches
  entry edge.

## Card

- **Purpose**: group related content as one visual unit (a tool tile, a
  file card, a result summary).
- **Variants**: static (no interaction), interactive (hover/press,
  navigates or triggers an action).
- **States**: default, hover (interactive only), focus-visible
  (interactive only), selected.
- **Accessibility**: interactive cards are real `<button>` or `<a>`
  elements, never a `<div onClick>`.
- **Animation**: `--motion-card-enter` for appearance, `--motion-hover`
  for hover elevation change (shadow step up by exactly one level, per
  the "max 3 shadow levels visible" rule).

## Table

- **Purpose**: dense, scannable rows of structured data (admin console:
  audit logs, member lists).
- **Behavior**: sortable columns where relevant, sticky header on
  scroll.
- **Accessibility**: real `<table>` markup (`<thead>`, `<th scope="col">`),
  not a div-grid pretending to be a table — screen readers rely on real
  table semantics for row/column announcement.
- **Responsive**: below a width threshold, converts to a stacked
  card-per-row layout rather than horizontal-scrolling a table (a known
  poor mobile pattern).

## Navigation (top nav, sidebar)

- **Purpose**: primary wayfinding.
- **Variants**: public top nav (spacious density), admin sidebar
  (compact density) — deliberately different per the Phase 1 density
  split, not the same component reskinned.
- **States**: default, active-route (current page indicated, not just
  hover-colored), collapsed (sidebar, on narrow viewports).
- **Accessibility**: `<nav>` landmark, current page indicated via
  `aria-current="page"`.
- **Animation**: sidebar collapse/expand uses `--motion-sheet`.

## Toolbar

- **Purpose**: grouped set of frequently-used actions for the current
  context (e.g. a tool's page-manipulation controls).
- **Behavior**: overflow into a "more" menu when horizontal space runs
  out, rather than wrapping to a second row (wrapping breaks the
  "toolbar" mental model).
- **Accessibility**: `role="toolbar"` with arrow-key navigation between
  items.

## Search

- **Purpose**: filter a list or jump to a destination.
- **Behavior**: instant filter-as-you-type for in-page search; debounced
  for anything hitting the network.
- **Accessibility**: results announced via `aria-live="polite"` region
  for screen reader users, not a silent visual-only update.

## Command Palette (genuinely new pattern for Lumeo)

- **Purpose**: keyboard-first access to any action/tool/page without
  navigating menus — directly inspired by Linear/Raycast per the design
  research.
- **Behavior**: opens via a global keyboard shortcut (e.g. Cmd/Ctrl+K),
  fuzzy-searches tools/pages/recent actions, closes on selection or
  Escape.
- **Accessibility**: `role="dialog"` + `role="listbox"` combination,
  full keyboard operability is the component's entire purpose — if it's
  not keyboard-perfect, it has failed at its one job.
- **Animation**: `--glass-thick` backdrop, `--motion-sheet` entrance.
- **Scope note**: this is new surface area, not present in Lumeo today
  — flagged in the foundation plan's roadmap as part of V2-5/V2-6, not
  assumed to already partially exist.

## Tool Panels / Inspector (see Phase 4 for full workspace detail)

- **Purpose**: contextual settings/properties for the current tool
  operation (e.g. watermark position controls, crop dimensions).
- **Density**: compact, per Phase 1.

## File Upload / Drop Zone **[carry forward, extend]**

- **Purpose**: get a file into the tool.
- **Behavior**: already well-implemented (`L2UploadStage`, confirmed
  live this session across all 14 tools) — click-to-browse and native
  drag-and-drop both work, with the trust badge (`L2PrivacyNote`, fixed
  earlier this session) present consistently. v2 keeps this component's
  behavior, restyles it to the new token set.
- **Animation**: drag-over state should highlight within one frame
  (Phase 1's "responds within one frame" rule applies directly here).

## Workspace (see Phase 4)

## Progress / Loading **[carry forward, restyle]**

- Existing `L2ProgressState` (confirmed in `ToolWorkspace.tsx`) already
  implements a clear single-indicator pattern — v2 restyles, doesn't
  redesign the interaction model.

## Toast **[exists, currently unused by tools — see Phase 1's density note]**

- `AuraToast` already exists (`components/ui/Aura.tsx:445`, confirmed
  this session) and is demoed on the admin design-system page but
  deliberately not used by tools, which favor persistent inline result
  cards instead (confirmed as the correct choice, not a gap, earlier
  this session). v2 keeps this division: Toast is reserved for
  transient, non-blocking system messages (e.g. admin console actions
  like "Feature flag updated"), never for "your file is ready" (which
  stays a persistent result card, since a toast that can be missed or
  auto-dismissed is the wrong pattern for something the user needs to
  act on).

## Tooltip

- **Purpose**: supplementary information on hover/focus, never required
  to understand or operate the interface (if it's required, it should be
  visible text, not a tooltip).
- **Accessibility**: `role="tooltip"`, shown on both hover *and* focus
  (not hover-only, which excludes keyboard users).
- **Animation**: `--glass-thin`, `--motion-hover` fade in with a short
  delay (~400ms) before appearing, no delay before disappearing.

## Popover

- Same interaction model as Dropdown but for arbitrary content, not a
  closed choice set.

## Status Badge / Pill

- **Purpose**: compact status indicator (e.g. "Live" vs "Coming soon" in
  the tool catalog, confirmed this pattern exists via `lib/tools/catalog.ts`'s
  `live` flag).
- **Variants**: neutral, success, warning, danger, accent.
- **Accessibility**: color is never the only signal — always paired with
  text, per Phase 1's "color means something" rule and standard WCAG
  guidance (color alone must never convey status).

## Tabs **[carry forward]**

- `AuraTabsRoot`/`AuraTabsList` already exist (confirmed in `Aura.tsx`)
  with `role="radio"`/`aria-checked` pattern for the tab-select
  interaction. v2 restyles, keeps the interaction model.

## Accordion (disclosure)

- **Purpose**: hide secondary content behind an explicit expand action
  — this is the formal version of the "Advanced settings" pattern
  already present in Merge PDF (confirmed live this session).
- **Accessibility**: trigger is a real `<button>` with `aria-expanded`,
  content region has `aria-hidden` synced to the expanded state.

## Empty / Error / Success states **[carry forward]**

- Already well-established patterns across all 14 tools (`L2UploadStage`
  for empty, inline `role="alert"` error blocks, `L2ResultState` for
  success — all confirmed live this session). v2 restyles these to the
  new token set without changing the underlying state machine each tool
  already implements correctly.

---

# PHASE 4 — WORKSPACE EXPERIENCE

The ideal PDF workspace, designed as desktop-class software rather than
a web form:

## Layout

```
+----------------------------------------------------------+
| Toolbar (compact density, contextual to current tool)     |
+---------------------------------+------------------------+
|                                 |                          |
|                                 |  Inspector / Settings    |
|          Canvas                |  Panel (compact,          |
|     (the file, at the          |  collapsible on           |
|      user's actual zoom)       |  narrower viewports)      |
|                                 |                          |
+---------------------------------+------------------------+
| Status bar: page count, zoom %, processing state           |
+----------------------------------------------------------+
```

This is a generalization of the pattern already partially present in
Lumeo's more complex tools (Edit, Sign, Crop — confirmed to have
canvas + settings panel structure this session) extended into a
consistent shell every tool with a "canvas" concept (i.e. anything that
renders the PDF visually, not just Merge's file-list model) should share.

## Toolbar

Contextual to the active tool — Merge's toolbar shows reorder/remove;
Edit's shows text/draw/shape/whiteout tool selection (already exists,
confirmed via `ActiveTool` type in `EditPdfTool.tsx`). Overflow rule from
Phase 3's Toolbar component applies: never wrap, overflow into "more."

## Inspector

The settings panel for the current operation (watermark position,
crop dimensions, output format). Compact density. Collapsible on
narrower viewports (becomes a bottom sheet on mobile, per Phase 6).

## Canvas

The file itself, rendered at a real, user-controlled zoom level — not
scaled to fit an arbitrary container. Selection (of a page, an element)
is indicated with the accent color border + a subtle `--glass-thin`
overlay, never a jarring full-opacity color fill.

## Zoom controls

Persistent, in the status bar: zoom percentage shown as a real number
(not just +/- buttons with no feedback), keyboard shortcuts (Cmd/Ctrl +
Plus/Minus/0-for-reset) as the primary interaction, buttons as the
discoverable fallback.

## Context menus

Right-click (desktop) / long-press (touch) on canvas elements for
contextual actions (duplicate, delete, rotate) — `--glass-regular`
surface, `--motion-hover` timing since it needs to feel instant to not
break the direct-manipulation flow.

## Selection

Single-select by click/tap, multi-select via Shift-click or drag-marquee
(desktop) — already partially present via Merge's multi-file reorder,
generalized here to page-level and element-level selection wherever
applicable.

## Drag interactions

Direct manipulation per Phase 1 — dragging always shows a real-time
preview of the result position, not just a ghost outline, wherever
technically feasible (already the case for Merge's page reorder,
confirmed live this session).

## Drop zones

Already well-designed (Phase 3's File Upload note) — v2 extends the
same one-frame-response rule to in-canvas drop targets (e.g. dropping an
image onto a specific page for Watermark) if/when that interaction is
added.

## File handling

Client-side only — this is a hard architectural constraint already
verified this session (Merge PDF's full pipeline runs with zero network
requests carrying file content) and the v2 workspace design does not
change this in any way; it's explicitly out of scope per this
mission's rules.

## Loading

A single, honest indicator per operation (`L2ProgressState`, carried
forward from Phase 3) — never multiple competing spinners for one
logical operation.

## Undo / Redo

Where already implemented (`useHistoryState`, confirmed used by Crop,
Edit, Sign tools this session), the interaction is: Cmd/Ctrl+Z / Shift+Z,
plus visible, always-present undo/redo buttons in the toolbar (not
hidden behind a menu) so the capability is discoverable without knowing
the shortcut.

## Status indicators

Status bar (bottom of workspace) shows page count and current
operation state at a glance — this is new structure, not present today
as a persistent bar (today, status is shown inline per-tool); proposed
as a shared pattern across tools with a canvas.

## Progress

Same `L2ProgressState` pattern, restyled.

## Keyboard shortcuts

A minimum shared set across every tool with a canvas:
- `Cmd/Ctrl+Z` / `Cmd/Ctrl+Shift+Z` — undo/redo (where applicable)
- `Delete`/`Backspace` — remove selected element/page
- `Escape` — deselect / close current panel
- `Cmd/Ctrl+0` — reset zoom
- `Cmd/Ctrl+K` — open command palette (Phase 3)

Tool-specific shortcuts layer on top (already partially present —
6 of 14 tools have `keydown` handling, confirmed in the foundation
plan) but this minimum set should be consistent everywhere it applies,
not tool-specific trivia to relearn each time.

---

# PHASE 5 — MOTION SYSTEM

All durations/easings reference the Phase 2 token proposal.

| Interaction | Duration | Easing | Notes |
|---|---|---|---|
| Hover | `--motion-hover` (90ms) | `--ease-standard` | Color/shadow shift only, no movement |
| Pressed/active | `--motion-hover` (90ms) | `--ease-standard` | Scale to 98.5% (matches existing `AuraButton` `active:scale-[0.985]`) |
| Focus | `--motion-focus` (90ms) | none (binary) | Ring appears, no interpolation needed |
| Loading entrance | `--motion-card-enter` (200ms) | `--ease-enter` | Delayed by ~150ms so fast operations never show a flash of loading state |
| Page transition | `--motion-page` (320ms) | `--ease-standard` | Used sparingly — most navigation in an SPA-feeling tool workspace shouldn't do a full page transition at all |
| Dialog open | `--motion-sheet` (240ms) | `--ease-enter` | Scale 96% → 100% + fade, backdrop fades in parallel |
| Dialog close | `--motion-fast` (140ms) | `--ease-exit` | Faster than open — exits should never feel like they're making the user wait |
| Sheet open | `--motion-sheet` (240ms) | `--ease-enter` | Slide from edge + fade |
| Sheet close | `--motion-fast` (140ms) | `--ease-exit` | |
| Dropdown/popover open | `--motion-fast` (140ms) | `--ease-enter` | Faster than dialogs — these are lighter-weight, shouldn't feel as ceremonial |
| Context menu open | `--motion-hover` (90ms) | `--ease-standard` | Must feel instant to preserve direct-manipulation flow |
| Card entrance (list population) | `--motion-card-enter` (200ms) | `--ease-enter` | Staggered by ~30ms per item if more than one enters at once, capped at 5 staggered items to avoid a long cascade |
| List reorder | `--motion-standard` (200ms) | `--ease-standard` | Items smoothly move to new position, not jump-cut |
| Upload progress bar | continuous, no fixed duration | linear | The one place linear easing is correct — it's representing real elapsed progress, not a designed motion |
| Completion / success | `--motion-card-enter` (200ms) | `--ease-enter` | Checkmark/result card enters once, no repeat/pulse animation — Phase 1's "quiet satisfaction," not celebration |
| Error | `--motion-hover` (90ms) | `--ease-standard` | Error message enters quickly (this is information the user needs fast) but with no shake/attention-grabbing motion — Phase 1's "direct and specific, never alarming" |

## Reduced motion

Every animation above must have a `prefers-reduced-motion: reduce`
fallback that either removes the transition entirely (opacity/scale
animations) or reduces to an instant state change — this is a hard
requirement, not optional polish, consistent with the Phase 1
accessibility philosophy. Concretely: motion that *communicates* a
state change (e.g. a dialog appearing) can reduce to a simple fade;
motion that's purely decorative (staggered list entrance) should be
removed entirely under reduced motion.

---

# PHASE 6 — RESPONSIVE SYSTEM

## Breakpoints (proposed, consistent with Lumeo's existing fluid-type
approach rather than rigid pixel snapping wherever possible)

```
Mobile:     < 640px
Tablet:     640px - 1024px
Laptop:     1024px - 1440px
Desktop:    1440px - 1920px
Ultra-wide: > 1920px
```

## Per-breakpoint behavior

- **Mobile**: single column, bottom-sheet pattern for anything that
  would be a dropdown/dialog on desktop, toolbar becomes a bottom bar,
  inspector panel becomes a full-screen sheet triggered by a button
  rather than always-visible.
- **Tablet**: workspace becomes two-column (canvas + collapsible
  inspector) once there's room; touch remains the primary input
  assumption.
- **Laptop/Desktop**: full three-zone workspace layout (Phase 4),
  keyboard shortcuts fully available, hover states meaningful (a
  trackpad/mouse is assumed present).
- **Ultra-wide**: canvas area gets the extra width (never the inspector
  panel, which should stay a fixed comfortable reading width) — an
  ultra-wide monitor should make the PDF bigger, not make the settings
  panel absurdly wide.
- **Landscape/portrait** (mobile/tablet specifically): the workspace
  layout should not fight orientation — portrait favors the current
  single-column/bottom-sheet model; landscape on tablet can promote to
  the two-column tablet layout early, since landscape tablet width often
  exceeds the 1024px laptop threshold's *effective* usable space even if
  not the raw pixel count.

## Input method adaptation

- **Touch**: minimum 44×44px hit targets (already the case for
  `AuraIconButton`'s `min-h-11 min-w-11`, confirmed in `Aura.tsx` — v2
  keeps this minimum as a hard floor for every interactive element),
  drag interactions use touch-native gesture recognition, context menus
  trigger via long-press.
- **Mouse**: hover states meaningful and used for progressive disclosure
  (e.g. showing a delete button only on row hover), right-click for
  context menus, precise pointer allows smaller optional affordances
  (e.g. a resize handle) than touch would tolerate.
- **Trackpad**: two-finger scroll/zoom on canvas treated as a first-class
  zoom gesture, not just a scroll — pinch-to-zoom equivalent.
- **Keyboard**: every interaction in this entire specification must be
  reachable without a mouse — this isn't a mobile/desktop distinction,
  it's a floor for all of them, per Phase 1's accessibility philosophy.

---

# PHASE 7 — DESIGN CONSISTENCY RULES

Concrete, checkable rules — each one enforceable in code review, not
just aspirational:

1. **Never more than 3 shadow levels visible in a single view at once**
   (e.g. base surface + one raised card + one floating dialog — not
   four nested elevation steps simultaneously).
2. **Never more than 1 accent color per screen.** Status colors
   (success/warning/danger) are allowed alongside it when genuinely
   representing status, but there is exactly one "this is the important
   action" color at a time.
3. **Never animate layout unexpectedly** — any animation that shifts
   other content's position (not just the animating element itself)
   must be intentional and documented, never an accidental side effect
   of a transition.
4. **Never stack more than 2 glass layers.** A `--glass-regular` dialog
   over a `--glass-thin` tooltip is fine; a glass dialog containing a
   glass popover containing a glass tooltip is not — visual clarity
   degrades fast past two layers.
5. **Never mix border-radius scale steps within one component.** A card
   uses one radius value for its own corners; it does not use a
   different radius for an inner element unless that inner element is
   itself a nested, independently-scaled component (e.g. a button inside
   a card correctly uses the button's own radius, not the card's).
6. **Never invent a spacing value outside the 9-step scale.** If a gap
   needs to be "a little more than `--space-4`," the answer is
   `--space-5`, not a one-off `18px`.
7. **Never create a new button variant when an existing one of the 7
   already expresses the needed meaning** (primary/secondary/ghost/
   premium/danger/success/icon) — a proliferation of near-identical
   variants is exactly the "duplicate buttons" failure mode.
8. **Never duplicate a token under a new name.** If a value already
   exists as `--surface-raised`, a new component does not introduce
   `--panel-background` that resolves to the same thing — this is the
   rule that directly prevents rebuilding the three-generation naming
   sprawl documented in the foundation plan.
9. **Every color pairing (text on surface) must meet WCAG AA contrast**
   (4.5:1 for body text, 3:1 for large text/UI components) — checked
   per pairing when the token values are finalized during
   implementation, not assumed.
10. **Every new component ships with its keyboard interaction model
    defined before its visual design is finalized** — accessibility is
    not retrofitted, per Phase 1.

---

# PHASE 8 — IMPLEMENTATION ORDER

Extremely small, independently releasable PRs. This refines (doesn't
replace) the 13-phase roadmap already in `docs/AURA_OS_V2_PLAN.md`,
breaking the largest phases down further:

| PR | Scope | Depends on |
|---|---|---|
| 1 | Design tokens: neutral scale, resolve 3-generation aliasing, glass tokens, opacity scale (no component changes yet — tokens exist but nothing consumes the new ones until PR 2+) | None |
| 2 | Theme provider / `[data-theme]` infrastructure + light theme token values | PR 1 |
| 3 | Buttons (verify against Phase 3 spec — likely near-zero change needed, confirmed already correct) | PR 1 |
| 4 | Inputs (text field, checkbox, switch) | PR 1 |
| 5 | Cards, badges/pills | PR 1 |
| 6 | Dialogs + Sheets (shared glass/motion foundation) | PR 1, 3 |
| 7 | Dropdown, Popover, Tooltip | PR 6 |
| 8 | Navigation (public top nav) | PR 1, 3 |
| 9 | Homepage | PR 8 |
| 10 | Workspace shell (toolbar, status bar, inspector container — structure only, no tool-specific logic) | PR 1, 3, 4, 6 |
| 11 | Tool pages, one at a time (14 sub-PRs, each independently shippable) | PR 10 |
| 12 | Admin navigation (sidebar) — after the Section-5 admin-vs-public decision is made | PR 1, 3 |
| 13 | Admin console pages | PR 12 |
| 14 | Command Palette (new pattern) | PR 6, 7 |
| 15 | Motion polish pass — apply Phase 5's full table everywhere it wasn't already covered by earlier PRs | All above |
| 16 | Accessibility audit pass (real axe-core scan + keyboard-only walkthrough, not spot checks) | All above |
| 17 | Performance pass (bundle size, animation jank on real devices) | All above |
| 18 | Final QA — full live-browser walkthrough of all 14 tools + admin | All above |

Each PR ships behind `verify:release`'s existing gate; PR 11's 14
sub-PRs can run in parallel across the tools once PR 10 lands, since
each tool is independent once the shared workspace shell exists.

---

# PHASE 9 — RISK ANALYSIS

| Risk | Level | Detail | Mitigation |
|---|---|---|---|
| PR 1 (token resolution) breaks something transitively across every component | **High** | Every component consumes the semantic token layer; a mistake here is invisible until real components render | Full 207-test suite + live-browser visual pass on every route as PR 1's acceptance bar, before PR 2 starts |
| PR 11 (tool pages) regresses a live, revenue-critical PDF tool | **High** | These are the highest-traffic surfaces; a broken Merge/Split/Watermark directly costs users a working product | Ship one tool per sub-PR, live-verify in browser (upload→process→download, zero console errors — same discipline used this session) before merge, never batch multiple tools in one PR |
| Light theme (PR 2) undertested contrast ratios | **Medium** | New surface area, easy to ship a WCAG-failing color pairing without checking | Explicit contrast-ratio check (Phase 7, rule 9) per token pairing before PR 2 merges, not assumed correct |
| Command Palette (PR 14) is entirely new interaction, no existing pattern to extend | **Medium** | Higher chance of an accessibility gap since there's no working precedent in this codebase to copy correctness from | Build keyboard interaction model first per Phase 7 rule 10, visual design second |
| Admin/public primitive divergence decided implicitly during PR 12 instead of explicitly beforehand | **Medium** | Could result in admin either awkwardly adopting spacious-density components or duplicating effort building parallel compact ones without a stated reason | Make the decision explicitly before PR 12 starts, as already flagged in the foundation plan |
| Motion polish pass (PR 15) introduces layout thrash or jank on lower-end devices | **Low-Medium** | Animations are cheap to write, expensive to get right performance-wise | Test on a throttled-CPU profile (not just this session's uncapped-network browser check) before merging PR 15 |
| Reduced-motion fallback forgotten on a new animation | **Low-Medium** | Easy to miss per-component if not systematized | Bake the reduced-motion check into the same PR that introduces any new animation, not deferred to PR 16 |
| Scope creep — "while I'm touching this component, let me also improve X" | **Low, but high-frequency risk** | The single most common way a "small independent PR" plan turns into a tangled one | Explicit rule carried from this session's discipline: one logical objective per PR, no bundling |

## Testing requirements (per PR)

- `npm test`, `npm run lint`, `npm run build` — the existing gate, every
  PR, no exceptions (already Lumeo's standing practice this session).
- Live-browser verification for any PR that changes rendered output —
  not just automated tests, matching this session's standing practice.
- For PR 11 specifically: the full upload→process→download flow,
  live, per tool, before that tool's sub-PR merges.

## Rollback strategy

Every PR is small and independently revertable by design (Phase 8's
whole point) — a bad PR can be reverted on its own without unwinding
unrelated work, since no PR is allowed to bundle unrelated changes.
Additionally: the `v1.0.0-production-stable` tag (created this session)
remains a full, verified restore point for the entire pre-v2 codebase if
something catastrophic happened that a single-PR revert couldn't cleanly
fix — that's exactly what it was created for.

---

**This specification is complete. No code has been changed. No commit
has been made. Awaiting approval before any implementation (PR 1)
begins.**
