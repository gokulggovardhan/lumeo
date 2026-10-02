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


## Shared document runtime

The first connected-workflow foundation is an in-memory provider mounted at the shared `/pdf` layout. It is deliberately invisible to users and does not replace any processing engine.

Properties:
- survives client-side navigation between PDF tool routes while the `/pdf` layout remains mounted;
- keeps one guarded current PDF revision in browser memory;
- carries the existing `DocumentSession` domain state alongside current bytes;
- rejects stale asynchronous publishers with an expected-revision check;
- preserves stable page identity unless an adapter explicitly publishes a new validated page topology;
- does not use localStorage, sessionStorage, IndexedDB, OPFS, network upload, or account storage;
- can materialize the current revision as a normal browser `File` so existing tools can adopt it without a new PDF engine.

This is infrastructure only. Standalone tools remain standalone by default. Later continuation adapters opt into the runtime only after a user chooses to keep working with the same PDF.


## Explicit continuation between proven tools

The connected experience is opt-in and begins only after a tool has produced a verified PDF result. The existing standalone route remains the normal single-task path.

Current continuation contract:
- the primary Download action remains unchanged and visually dominant;
- a secondary “Continue with this PDF” action can stage the verified output for Edit, Pages, or Sign;
- the shared /pdf provider survives the client-side route transition and hands the target tool a normal browser file;
- stable Workspace page identity and source provenance travel separately from the PDF bytes;
- the target tool continues using its existing processing engine and local undo authority;
- completed semantic operations are merged into the shared Workspace journal at continuation boundaries;
- an explicit target token prevents an unrelated tool route from silently adopting a staged document;
- shared bytes stay in memory only and are never placed in URLs, analytics, persistent storage, or account state.

This stage does not yet make the shared journal the mutation authority for Undo/Redo inside every tool. That migration remains separate so Edit, Organize, and Sign cannot lose their already-proven local history behavior while cross-tool continuation is established.
