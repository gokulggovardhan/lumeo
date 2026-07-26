# Workspace Shell — Phase 1 design (pilot: Merge PDF)

## Context

This spec responds to a request to build a large, generic "Workspace Foundation" (persistent app shell + shared state/undo/zoom/command-system infrastructure) intended to support 8 future engines (Annotation, Organize, Image, Font, Text Editing, Validation, Compare, OCR, Repair) that are not individually scoped or requested. Building that much shared infrastructure before there is a second real consumer to validate the abstraction boundaries is a premature-generalization risk — informed by this session's own experience finding and deleting `ToolSeoSection`, a fully-built but never-used component from an earlier phase of this project.

Instead, this spec scopes **Phase 1 only**: prove the persistent-shell architecture works end-to-end with exactly one real tool — **Merge PDF** — migrated into it. The other 10 live tools stay on their current `/pdf/<slug>` pages, completely unchanged, until their own future migration phases. Building Edit PDF and any of the named future engines is explicitly out of scope here; each gets its own brainstorm and spec when it is actually being built, informed by whatever Phase 1 (and later, a page-editing pilot) actually proves works.

**Honest limitation:** Merge PDF operates on a list of whole files (reorder, combine), not per-page canvas editing. It validates the shell's layout persistence, routing, and file-lifecycle architecture well. It does **not** exercise canvas rendering, zoom, per-element selection, or undo/redo in any meaningful way, since Merge doesn't need those. Those parts of a future, more general workspace architecture stay unproven by this phase — informed only by `SignPdfTool.tsx`'s existing (single-tool) pattern — until a page-editing tool becomes a later pilot.

## Goal

Prove that a persistent shell (header/toolbar/left panel/main/right panel/status bar) can host a real, working tool without regressing SEO, without breaking existing admin/catalog wiring, and without over-building shared state infrastructure ahead of a second real use case.

## Routing

```
app/workspace/layout.tsx         ← persistent shell (Next.js layout — survives client-side navigation between sibling routes without remounting; this is a native platform feature, not custom-built)
app/workspace/merge/page.tsx     ← Merge PDF: own generateMetadata() + SoftwareApplication/BreadcrumbList JSON-LD, same shape as today's app/pdf/merge/page.tsx
```

- `next.config.ts` gets a permanent (308) redirect: `/pdf/merge` → `/workspace/merge`. This exists for external/bookmarked/indexed links only.
- Internal links (homepage tile, nav dropdown, `/pdf-tools/compose` category page, `/guides`) are updated to point at `/workspace/merge` directly rather than relying on the redirect.
- The other 10 tools' `/pdf/<slug>` pages, and every link to them, are untouched.

**Why a layout, not a client-side SPA shell:** Next.js App Router layouts already persist across sibling-route navigation without remounting — this delivers the actual desktop-app feel (shell never flickers) natively, while each tool route keeps its own `generateMetadata()`, canonical URL, and JSON-LD exactly like today. This dissolves the SEO-vs-app-feel tradeoff that a single-URL SPA would have forced; there is no reason to accept that tradeoff when the platform gives both for free.

## Shell layout composition

The shell exposes **named regions**, not a fixed rigid layout: `Header`, `Toolbar`, `LeftPanel`, `Main`, `RightPanel`, `StatusBar`. A tool fills only the regions it needs; unfilled regions collapse rather than leaving blank space.

- `app/workspace/layout.tsx` (server component) renders the persistent outer chrome (brand header, nav) and wraps its children in `<WorkspaceShellProvider>` (client-side context, see State architecture below).
- `components/workspace/WorkspaceShell.tsx` is the reusable region-composition component every tool page renders, passing named props: `<WorkspaceShell leftPanel={...} main={...} rightPanel={...} statusBar={...} />`. This component has no tool-specific logic — it only arranges the grid.

**For Merge PDF specifically:**
- `LeftPanel` → the existing file list with drag-reorder (a near-direct port of what `MergePdfTool.tsx` already has, not new UI).
- `Main` → a centered summary/preview area (file count, combined page count) — not a per-page canvas, since Merge doesn't edit page content.
- `RightPanel` → output settings (page size, orientation) — matches Merge's existing settings panel.
- `StatusBar` → omitted (no meaningful per-page status for Merge to show).

A future page-editing tool (Organize, Edit PDF) would fill `Main` with a real pdfjs canvas and `LeftPanel` with page thumbnails instead — the region contract is the actual reusability point; the internals of what fills each region are entirely tool-owned.

## State architecture

Two clearly separate layers — **not** one shared blob:

1. **Shell-level state** (`WorkspaceShellProvider`, `components/workspace/WorkspaceShellProvider.tsx`): genuinely shared across every tool because it's about the chrome, not tool logic — which panel is collapsed/expanded, current zoom level (exposed but a no-op for tools without a zoomable canvas, like Merge), active tool identifier for header/breadcrumb display.
2. **Tool-level state**: stays exactly where it already lives — local to each tool's own component/hooks (Merge's file list, reorder state, output settings). **Not** lifted into a shared context.

This deliberately rejects a "God context" holding every tool's domain data, which is the over-generalization trap the original request risked. The shell only owns state about itself; each tool keeps owning its own data, exactly as it does today. A future tool that needs undo/redo or per-element selection builds that as its own local state/hook — not as a mandatory shared subsystem every tool must plug into whether it needs it or not.

## File lifecycle & error handling

Unchanged from Merge's current implementation: file selected/dropped → held in Merge's own component state (in-memory, never persisted) → processed via `pdf-lib` on "Merge" click → downloaded → state cleared. The shell doesn't intervene in this at all — it's purely a layout/chrome change wrapped around existing, working logic. Error handling (`checkPdfFileSize`, `hasPdfMagicBytes`, per-file validation) is identical to what Merge already does; the shell adds no new error surface in Phase 1 since it holds no domain state of its own.

## Catalog & admin wiring changes

- `lib/tools/catalog.ts`: Merge's action `route` → `/workspace/merge`.
- Admin Tools table / `pdf_tools.route` column for the `merge` row: updated to match (single field edit via the existing admin save flow, or a small migration).
- `getToolBlockedState("merge")`: unchanged — keyed by slug, not route, so admin-driven maintenance blocking keeps working.
- Update the 3 internal link sources (homepage tile, nav dropdown, `/pdf-tools/compose` category page) to the new route.

## Explicitly deferred (not forgotten, not designed here)

- Migrating the other 10 tools into the shell.
- Building Edit PDF (has its own separate, already-approved spec: `2026-07-26-edit-pdf-tool-design.md`) inside or outside the shell.
- Any of the 8 named future engines (Annotation, Organize, Image, Font, Text Editing, Validation, Compare, OCR, Repair) — none are scoped, prioritized, or designed by this document. Each gets its own brainstorm when it's actually being built.
- A full command-system/undo-redo architecture, keyboard shortcut system, or workspace-wide event system — none of these have a second real consumer yet to validate their design against; building them now would be guessing.
