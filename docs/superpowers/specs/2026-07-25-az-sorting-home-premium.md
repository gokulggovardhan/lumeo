# Design: Automatic A-Z Tool Sorting + Home Screen Polish

Date: 2026-07-25
Status: Approved

## Context

Tool ordering today is driven by a manual, admin-edited `sort_order` number
per tool row in the `pdf_tools` table, plus a static declaration order in
`lib/tools/catalog.ts`. Nothing is alphabetically sorted anywhere. The user
wants automatic, permanent A-Z ordering across every surface, with zero
manual maintenance going forward, plus a visually premium home screen that
scales gracefully as more tools are added.

Traced the actual data flow (not guessed):

- **Home Screen grid** and **"PDF Tools" nav dropdown** both render from the
  exact same function: `buildTiles()` in `lib/tools/tiles.ts` (its own doc
  comment confirms this — "Shared between the homepage tile grid ... and the
  'PDF Tools' nav dropdown"). One fix point covers both surfaces.
- The **`/pdf-tools` full catalog page** (category-grouped view) gets its
  order from `groupPublicTools()` in `lib/public-catalog/fallback.ts`, which
  currently sorts categories by `sortOrder` (tools within a category aren't
  sorted at all — insertion order).
- The **admin console tools table** (`app/admin/(protected)/tools/page.tsx`)
  queries via `getPdfTools()` in `lib/admin/data.ts`, which orders by
  `sort_order` then `name`.

The existing home-screen tile visual design (`.lumeo-tile` in
`app/globals.css`) is already a considered, premium frosted-glass system
(spring-eased hover lift, two-tone sage/brass accent glow, restrained by
design). This work does not redesign that visual language — "theme should
be the same." It fixes ordering and makes modest, additive layout
adjustments (wider-screen column scaling) so it keeps looking good as more
tools are added.

## Scope

1. Automatic A-Z sorting on: Home Screen tile grid, "PDF Tools" nav
   dropdown, `/pdf-tools` full catalog page (categories, and tools within
   each category), admin console tools table.
2. Remove the manual `sort_order` admin UI control (column + input) and
   stop writing to it. The database column itself is left in place — no
   migration, no risk, simply unused going forward.
3. Modest home-screen grid enhancement: add a wider-screen column step
   (5 columns at `xl`, up from capping at 4) so the grid keeps a balanced,
   premium density as the tool count grows, using the exact same tile
   component and CSS token system already in place.
4. No visual/theme redesign. No new dependencies. No pagination/search
   infrastructure — the grid is a responsive CSS grid that already wraps
   cleanly at any tile count; that scales structurally without added
   complexity until the catalog is meaningfully larger than it is today
   (9 tool groups / ~49 actions, most not yet live).

## Implementation

- `lib/tools/tiles.ts` (`buildTiles`): sort the final flat tile array by
  `label.localeCompare()` before returning.
- `lib/public-catalog/fallback.ts` (`groupPublicTools`): category sort
  becomes pure `name.localeCompare()` (drop the `sortOrder`-first
  comparator); tools within each category are also sorted by
  `toolName.localeCompare()` before being returned.
- `lib/admin/data.ts` (`getPdfTools`): Supabase query order changes from
  `.order("sort_order").order("name")` to `.order("name")` only.
- `app/admin/(protected)/tools/page.tsx`: remove the "Sort" column header
  and the `sort_order` number input from both the read-only and editable
  row renderers.
- `app/admin/(protected)/tools/actions.ts` (`updateTool`): stop reading/
  validating/writing `sort_order` from the submitted form.
- `components/pdf/PdfToolLauncher.tsx`: the tile grid's `<ul>` gains an
  `xl:grid-cols-5` step (currently caps at `md:grid-cols-4`). Everything
  else — tile markup, `.lumeo-tile` CSS, spacing, hover/focus treatment —
  is unchanged.

## Testing

- No existing automated test touches tile ordering or the admin tools
  table; this is UI/data-ordering behavior best verified by direct
  inspection (reading the rendered order) rather than a new unit test
  suite for a five-line sort change. Verify manually in a running dev
  server: home screen tiles read A-Z, nav dropdown reads A-Z, `/pdf-tools`
  category and tool order reads A-Z, admin tools table reads A-Z with no
  Sort column.
- `npm run build` and `npm run lint` after the change, as the standing bar
  for every change in this codebase.

## Out of scope

- Dropping the `sort_order` database column (no migration in this pass).
- Renaming/feature-expanding "Reorder pages" or "Extract text" (separate,
  already-identified follow-up workstreams from the same conversation).
- Admin console wiring audit (separate follow-up workstream).
- Any change to `.lumeo-tile` visual styling, colors, motion, or the
  sage/brass accent system.
