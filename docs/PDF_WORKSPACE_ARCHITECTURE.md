# Lumeo PDF Workspace architecture

Continuity issue: #399.

## Baseline

Stage 0 audited protected main at `0fa66681cc271fbb825e8ceaf2777dda8805dde6`. The public redesign remains the discovery layer. Existing tool routes remain indexable and purpose-specific before file selection.

## Migration boundary

The Workspace is a domain/session layer above proven processing engines, not a replacement PDF engine.

Preserve:
- `lib/pdf/edit/*`, including its structured text model, coordinate mapper, spatial index, font registry, capability classification and content-stream rewrite/export path.
- per-tool PDF algorithms under `lib/pdf/*`.
- browser conversion engines under `lib/conversion/browser/*`.
- current Cloudflare/vinext deployment.
- current analytics and public catalog architecture.

Migrate incrementally:
- tool-local file-open state into a shared document session;
- page-index references into stable page IDs at Workspace adapter boundaries;
- tool-local undo stacks into one operation journal;
- per-tool completion/download surfaces into Finish/export;
- repeated parse/render/export orchestration into shared adapters only where doing so does not duplicate or weaken proven engines.

## Core invariants

1. Original source bytes are logically immutable.
2. A page ID is stable and independent of display index.
3. Every page retains source-document and original-page provenance.
4. Operations target explicit scope semantics.
5. Undo/Redo is ordered across Workspace areas.
6. Applying an operation after Undo discards the obsolete redo branch.
7. Compression is modeled as an output transformation unless an existing engine proves another boundary necessary.
8. Local document bytes/content never enter analytics or URLs.
9. No persistent document recovery is introduced in the initial foundation.
10. Existing SEO routes remain the entry points; the common Workspace mounts after selection with an initial intent.

## Scope semantics

`pages` and `selection` target stable page IDs. `all-current-pages` and `page-range` capture the resolved IDs at operation time. `all-final-pages` intentionally applies to pages present at final materialization. This distinction prevents inserted pages from accidentally inheriting or missing an operation.

## Sign migration note

The current Sign model stores `pageIndex`. During Workspace migration, adapters must translate placement ownership to stable Workspace page IDs. Existing Sign behavior remains unchanged until that adapter is integrated and covered by regressions.

## Stage 1

The first code slice adds dependency-free Workspace domain types and operation history. It deliberately does not replace any public post-selection UI yet. This keeps PR 1 reviewable and gives Stage 2 a tested contract for Organize → Watermark → Sign → Compress → Export.
