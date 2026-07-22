# Public PDF Tool Catalog

Phase 4 connects the public Lumeo PDF experience to the Supabase tool catalog
without exposing administrative tables directly.

## Architecture

- Public pages call `lib/public-catalog/data.ts`.
- The data layer calls Supabase RPC functions only.
- Results are normalized into public-only types.
- If Supabase is unavailable, local registry fallback keeps the site usable.
- Public data is cached for 300 seconds.

## RPC Security Model

Migration `20260712003_public_tool_catalog.sql` creates:

- `public.get_public_pdf_catalog()`
- `public.get_public_homepage_tools()`

Both return only safe public fields and are granted to `anon` and
`authenticated`. No anonymous table SELECT, INSERT, UPDATE, or DELETE grant is
added.

## Why Direct Table SELECT Is Avoided

The Control Center tables contain administrative fields such as UUIDs,
timestamps, status controls, homepage eligibility, and editor metadata. Public
RPC functions intentionally project only the safe public catalog fields needed
for navigation and rendering.

## Homepage Five-Slot Rule

The homepage shows exactly five configurable tools from
`homepage_tool_slots`.

## Permanent Sixth Card

The sixth homepage card is always:

```text
All PDF Tools
```

It links to `/pdf-tools`, is never stored as slot 6, and cannot be removed or
replaced.

## PDF Tools Menu

The top navigation label is `PDF Tools`.

- Desktop opens a categorized menu.
- Mobile opens a touch-friendly drawer.
- Escape closes the menu.
- Outside click closes the menu.
- Focus returns to the trigger.
- No popularity, recommendation, or marketing badges are used.

## `/pdf-tools` Directory

The directory groups available tools by category, shows available tools only,
and does not expose admin controls or write paths.

## Supabase Fallback

Fallback uses the existing local PDF tool registry. It preserves this order:

1. Merge PDF
2. Split PDF
3. Compress PDF
4. JPG to PDF
5. PDF to JPG

The fallback does not expose raw database errors to public visitors.

## Cache Duration

Public catalog data is cached server-side for 300 seconds. In this phase,
Control Center changes may take up to five minutes to appear publicly.

## Accessibility

The menu uses semantic navigation, `aria-expanded`, `aria-controls`,
`aria-haspopup`, Escape handling, focus-visible states, and mobile scroll
locking while the drawer is open.

## Manual Migration Procedure

Do not execute SQL from the application task.

1. Review `supabase/migrations/20260712003_public_tool_catalog.sql`.
2. Open Supabase SQL Editor.
3. Paste migration 003.
4. Run it.
5. Verify both RPC functions exist.
6. Verify execute grants for `anon` and `authenticated`.
7. Verify `anon` still lacks direct table access.
8. Test the homepage.
9. Test the PDF Tools menu.
10. Test `/pdf-tools`.
11. Test fallback behavior locally by removing Supabase environment variables.

## Testing Checklist

- `npm.cmd run verify:supabase`
- `npm.cmd run verify:admin-auth`
- `npm.cmd run verify:control-center`
- `npm.cmd run verify:public-catalog`
- `npm.cmd run build`
- `npm.cmd run verify:public`
- `git diff --check`

## Rollback Considerations

Removing migration 003 removes only public RPC functions. It does not alter PDF
processing engines, admin authentication, Firebase, upload/export routes, or the
Control Center tables.

## Next Phase

The next phase is privacy-preserving analytics event collection. It should add
event emission only after collection limits, field constraints, and retention
rules are finalized.
