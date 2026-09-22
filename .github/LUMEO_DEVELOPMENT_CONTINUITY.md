# Lumeo Development Continuity

This file is the durable handoff record for ChatGPT-assisted Lumeo development.

## Source-of-truth order

When resuming work, prefer current external state over chat history:

1. GitHub protected `main` and repository contents.
2. Current feature branch and commits.
3. Pull requests and GitHub Actions.
4. Cloudflare production/build information when available.
5. Supabase/infrastructure state when relevant.
6. This continuity record.
7. Chat history as supporting context only.

Never commit passwords, credentials, session data, private customer files, private acceptance documents, or sensitive source material here.

## DEV CONTINUE convention

When the user types exactly `DEV CONTINUE` in a Lumeo development chat:

- recover this file first;
- inspect current protected `main`, open development branches/PRs, CI, deployment state, and relevant Supabase state;
- treat external verified state as authoritative when it differs from older chat text;
- preserve completed work and architectural decisions;
- continue the active objective without repeating completed investigation;
- proceed through implementation, tests, safe fixes, CI, merge, deployment, production verification, smoke tests, and cleanup when those stages are authorized and relevant;
- retry transient errors safely without duplicating side effects;
- stop only for genuine user input/approval or when the overall objective is complete.

## Update policy

Update this file only at meaningful checkpoints, such as:

- implementation checkpoint;
- durable commit/branch creation;
- PR creation or material PR update;
- CI outcome;
- merge;
- deployment;
- production verification;
- blocker change;
- objective completion or handoff.

Do not update it for ordinary conversational progress.

---

## Current development state

**Overall objective:** Continue Premium Edit PDF development from the merged #362 foundation and complete the remaining production-certification/follow-up work without regressing the proven editing engine or unrelated conversion infrastructure.

**Current workstream:** Premium Edit PDF — #362 production certification / follow-up.

**Protected main SHA:** `d81fd383155645779e6e5db10df22215885e8f40`

**Feature branch:** `test/edit-pdf-362-production-certification`

**Latest development commit:** `56e2e0ed579989077a20d12b101f769eb263313b`

**Pull request:** #363 — `test(edit): certify #362 on live production`

**PR intent:** Certification-only test branch. **Do not merge PR #363** unless its scope is deliberately changed and re-reviewed.

**CI/check status:**
- Cloudflare Production Audit run #39: failed overall.
  - `Audit lumeo.in on Cloudflare`: passed.
  - Browser smoke failed because the new certification test calls `textDoc.destroy()`, but the typed/runtime object used by the test does not expose that method.
- Lumeo CI run #1292: failed.
  - Unit tests passed.
  - Type check failed at `e2e/cloudflare-production.spec.ts(123,17)`: `TS2339 Property 'destroy' does not exist on type 'PDFDocumentProxy'`.
  - Admin/browser startup failure is downstream of the same type-check failure.

**Cloudflare production state:** Existing production has already been exact-SHA verified at `d81fd383155645779e6e5db10df22215885e8f40`; the current production routing/header audit also passed. Re-verify exact build information before final production certification.

**Supabase relevance:** No known change is required for this certification-only workstream. Inspect current Supabase state only if a later Edit PDF change actually touches shared data/infrastructure.

### Completed

- PR #362 merged into protected `main`.
- Page → Block → Line → Span document model added.
- `PdfCoordinateMapper` added.
- `PercentSpatialIndex` added.
- `PdfFontRegistry` and font-profile handling added.
- Embedded FontFile2/OpenType extraction and browser `FontFace` preview path added.
- Capability classification and editor integration added.
- Existing low-level in-place content-stream rewrite/export engine preserved.
- Production base routing/header audit passes on Cloudflare.
- PR #363 added live certification coverage only; no intended production-code changes.

### Architectural decisions that must not regress

- Preserve the existing proven content-stream rewrite/export semantics.
- Preserve browser-side Word → PDF and PDF → Word engines.
- Preserve `/office-runtime/...` delivery and Cloudflare runtime behavior.
- Preserve HTML → PDF.
- Preserve Supabase/Admin infrastructure unless a new requirement demonstrably needs changes.
- Keep capability limitations explicit rather than pretending unsupported PDFs are fully editable.
- Do not commit private acceptance/reference documents or their private contents.

### Current blocker

The #363 certification test uses `textDoc.destroy()`. The test object's `PDFDocumentProxy` typing/runtime does not provide that method in this path, causing both TypeScript failure and three-browser runtime failures.

### Exact next action

Fix only the certification-test document cleanup/lifecycle on the existing #363 branch without weakening coverage or changing production behavior; rerun the failed CI/audit jobs; then complete live Edit PDF production certification. Because #363 is certification-only, close it after successful certification rather than merging it unless its intended scope is explicitly changed.

### Remaining work

- Correct the #363 certification test cleanup API.
- Re-run TypeScript/unit/Cloudflare production audit coverage.
- Confirm live native-text detection, edit, write-back, export, reopen, and changed-text extraction on production.
- Confirm no Lumeo JS/MJS/WASM request failures or page errors.
- Record final production verification.
- Close certification-only PR #363 after success.
- Update this continuity record at the next meaningful checkpoint.
