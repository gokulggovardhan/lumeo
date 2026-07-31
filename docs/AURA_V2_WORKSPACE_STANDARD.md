# Aura OS v2 — Workspace Standard

Reference implementation: `components/pdf/MergePdfTool.tsx`, `components/pdf/SplitPdfTool.tsx`.
Shared components: `components/pdf/workspace/ToolWorkspace.tsx`.

This is the standard for tools built on `L2WorkspaceGrid` (a three-panel
"queue / main / inspector" desktop workspace with a sticky header and
toolbar). It is a distinct, taller-chrome family from the simpler
two-column tools that use `L2ToolWorkspace` + `L2ToolSettingsPanel` — don't
mix the two families' inspector/panel components.

## Component hierarchy

```
<section className="l2-workspace-deep ...">
  <L2WorkspaceHeader title description />
  <L2WorkspaceToolbar>
    <L2ToolbarButton variant="primary|secondary" />   {/* repeat as needed */}
    <span className="ml-auto ...">status text</span>
  </L2WorkspaceToolbar>

  <L2WorkspaceGrid
    queue={ <L2WorkspacePanel variant="flat">...</L2WorkspacePanel> }   {/* optional */}
    main={  <L2WorkspacePanel>...</L2WorkspacePanel> }
    inspector={ <L2WorkspaceInspector title description>...</L2WorkspaceInspector> }
  />

  <ToolActionBar>...</ToolActionBar>
</section>
```

`L2PanelLabel` (title + one-line description, `aura-text-label` +
`text-xs leading-5`) is the standard header for any panel/inspector that
just needs a static label — use it instead of hand-rolled `<p>` pairs.

## Layout rules

- `queue` is optional. Pass it only when the tool has a genuine second
  list/tray (Merge's document tray). Omit it (Split) and `L2WorkspaceGrid`
  automatically collapses to a 2-column `[main | inspector]` grid — don't
  pass an empty/placeholder queue to force 3 columns.
- `main` gets `variant="flex"` (default) when its content needs to fill
  remaining height (a scrollable list/grid) — `variant="flat"` when it's
  static content with no fill requirement.
- Column widths and breakpoints live in `L2WorkspaceGrid` only. Don't
  override with per-tool grid-template-columns.

## Spacing rules

- Panel chrome padding is `p-4` (`L2WorkspacePanel`), inspector padding is
  `p-5` (`L2WorkspaceInspector`) — don't hand-tune either.
- Panel-label description uses `leading-5`. A dynamic single-line status
  string next to its own control cluster (Split's page-selection summary)
  is the one legitimate exception — write it inline, don't force it
  through `L2PanelLabel`.

## Responsive rules

- Single column below `lg`, in this order: File/queue bar → main → toolbar
  actions → inspector. `L2WorkspaceGrid` and `L2WorkspaceToolbar`/`L2WorkspaceHeader`
  already handle the stacking and sticky-offset math — don't add
  tool-specific media queries for it.
- `ToolActionBar` is safe-area aware (`env(safe-area-inset-bottom)`) —
  don't add extra bottom padding for notched devices elsewhere; add
  `pb-28 lg:pb-6` on the outer `<section>` instead so content clears it.
- All text inputs must resolve to ≥16px on ≤768px viewports (global rule
  in `app/globals.css`) to avoid iOS Safari's zoom-on-focus. Don't set a
  smaller explicit `font-size` on an input that would fight this rule.

## Accessibility rules

- `L2ToolbarButton` always renders `type="button"` and forwards `disabled`
  — never re-implement a toolbar button with raw `<button>` markup in a
  tool file.
- Keep `role="grid"`/`role="gridcell"`/`aria-label`/`aria-selected` on any
  tool-specific interactive grid (e.g. Split's page thumbnails) — these
  live in the tool, not the shared layer, because their semantics are
  tool-specific.

## When to reuse

- Any new L2WorkspaceGrid-based tool: use every component in the hierarchy
  above as-is.
- A duplicate wrapper `className` string appearing in 2+ tools is a
  reuse candidate — extract only once a second real consumer exists.

## When NOT to reuse

- Don't force a single-tool pattern into a shared component (e.g. Split's
  page-density toggle row, Merge's drag-reorder file list — both stay
  tool-local).
- Don't reuse `L2WorkspaceInspector`/`L2WorkspacePanel` for the simpler
  two-column tools — use `L2ToolSettingsPanel`/`L2ToolWorkspace` instead;
  the two families have different sticky-offset math and aren't
  interchangeable.
