# Lumeo Production Release Certification

The permanent quality gate every future release should pass before
deployment. This document is the reference; `npm run verify:release`
(`scripts/verify-release.mjs`) is the automated entry point that runs as
much of it as can be automated.

## How to certify a release

```bash
npm run verify:release
```

This runs, in order, and stops at the first fatal failure:

1. `npm run test`
2. `npm run lint`
3. `npx tsc --noEmit`
4. `npm run build`
5. Every `verify:*` script in `package.json`

Two scripts (`verify:aura-rollout`, `verify:lumeo2-public-experience`) are
documented as deprecated in their own files — they check a since-completed
rollout milestone's hardcoded content markers, not current production
behavior. `verify:release` reports their failure but does not fail the
overall gate on it.

If `verify:release` exits non-zero for any other reason, **do not deploy**
until the cause is understood and fixed.

## Part 1 — Test assets

`tests/fixtures/pdfFixtures.ts` generates every regression asset in-memory
via pdf-lib rather than committing binary PDF files to the repo (consistent
with the per-test helpers already used throughout `tests/*.test.ts`, and it
keeps the repo free of binaries git can't diff meaningfully).
`tests/fixtures/pdfFixtures.smoke.test.ts` exercises every generator to
prove each one actually produces a loadable (or, for the two negative
cases, correctly-rejected) PDF.

| Asset | Generator | Notes |
|---|---|---|
| Single page | `makeSinglePagePdf` | Smallest realistic case |
| Medium (10 pages, default) | `makeMediumPdf(n)` | Everyday multi-page case |
| Large (150 pages, default) | `makeLargePdf(n)` | "100+ page" stress case |
| Landscape | `makeLandscapePdf` | Swapped dimensions, not `/Rotate` |
| Mixed page sizes | `makeMixedPageSizesPdf` | One page per size in `PAGE_SIZES` |
| Mixed rotations | `makeMixedRotationsPdf` | One page per `/Rotate` value (0/90/180/270) |
| Text-heavy | `makeTextHeavyPdf` | Dense multi-line text per page |
| Unicode metadata | `makeUnicodeMetadataPdf` | Non-Latin title/author strings |
| Full metadata | `makeMetadataPdf` | Title/author/subject/keywords/producer/creator |
| Transparency | `makeTransparencyPdf` | Overlapping semi-transparent rectangles |
| Vector-only | `makeVectorPdf` | Lines/ellipse/rectangle, no text or images |
| Image-only | `makeImageOnlyPdf` | Single embedded PNG, no text layer |
| Form field | `makeFormFieldPdf` | One AcroForm text field |
| Zero-page | `makeZeroPagePdf` | Degenerate empty-scope case |
| Corrupted (truncated) | `makeCorruptedPdfBytes` | First 40% of a valid PDF |
| Non-PDF | `makeNonPdfBytes` | Plain text, no `%PDF` header at all |
| Odd page sizes | `PAGE_SIZES` (A3/A4/Letter/Legal/Square/long receipt) | Used by the size-based generators above |

### Known limitations (not synthesizable here)

- **Encrypted / password-protected PDF** — pdf-lib has no encryption-creation
  API at all (only an `EncryptedPDFError` for detecting one it can't open).
  Testing this path needs either a third-party encryption library (a new
  dependency, out of scope for this phase) or a real hand-sourced sample
  file. Not fabricated.
- **True Unicode/RTL glyph rendering** — pdf-lib's built-in `StandardFonts`
  are WinAnsi-only; real Unicode/RTL text rendering needs a bundled font
  file + `fontkit` registration, which this repo doesn't ship.
  `makeUnicodeMetadataPdf` covers the Info-dictionary-string case (which
  doesn't depend on any font), not glyph rendering.
- **Bookmarks/outline entries** — pdf-lib has no first-class outline API.
- **Real annotation objects** (as opposed to form fields) — would need raw
  `PDFDict` manipulation; not attempted here.
- **Scanned-document fidelity** — `makeImageOnlyPdf` covers the structural
  "image, no text layer" case with a flat 1x1 PNG, not real scan-quality
  visual entropy.
- **`lib/pdf/uploadValidation.ts`'s `hasPdfMagicBytes`** currently has no
  dedicated unit test — it transitively imports via the `@/` path alias,
  which the bare Node test runner can't resolve (same constraint documented
  in `lib/pdf/watermark/export.ts`/`lib/pdf/crop/export.ts`). A real
  regression test for it would need either a path-alias-free copy or a
  Next.js-aware test runner.

## Part 2 — Tool regression matrix

`lib/tools/catalog.ts` is the single source of truth for which tools are
live and their routes — this table's tool list must match its `live: true`
entries. For each tool: input, expected output, failure cases, and edge
cases to check before release. Performance/memory expectations are
qualitative (no automated profiler is wired up yet — see "Remaining gaps").

| Tool | Input | Expected output | Failure cases | Edge cases |
|---|---|---|---|---|
| Merge PDF | 2+ PDFs | One combined PDF, page order as arranged | Non-PDF file, single file only | Mixed page sizes, mixed rotations, very large page counts |
| Split PDF | 1 PDF | Multiple PDFs or a ZIP, per split mode | Single-page PDF with range split | Extract-pages subset, split-by-range boundaries |
| Compress PDF | 1 PDF | Smaller PDF at target quality/size | Already-minimal PDF (no further gain) | Target-size studio thresholds (100/200/400 KB), grayscale, flatten |
| Organize PDF | 1 PDF | Reordered/rotated/pruned PDF | Removing all pages | Duplicate page, rotate + reorder combined |
| Crop PDF | 1 PDF | PDF with new MediaBox/CropBox per page | Crop rect outside page bounds | Mixed page sizes, mixed rotations, aspect-ratio lock |
| Watermark PDF | 1 PDF + text/image | PDF with watermark drawn per selected page | Empty text watermark (no-op, verified in `exportWatermarkedPdf`) | Manual position + rotation-around-center, overflow/clamp, 9-point anchors |
| Edit PDF | 1 PDF + elements | PDF with elements drawn/flattened | Element referencing a missing page | Rotated pages, ink strokes, image elements |
| Extract Text | 1 PDF | Extracted text (or "no extractable text" state) | Image-only PDF (no text layer) | Very large page counts |
| Sign PDF | 1 PDF + signature | PDF with signature/initials placed | No signature created yet | Signature library reuse, placement rotation |
| JPG/PNG/WEBP to PDF | 1+ images | One PDF, one page per image | Corrupted image bytes | Very large images, mixed formats in one batch |
| PDF to JPG/PNG/WEBP | 1 PDF | One image per page | Password-protected PDF (see limitations) | Very large page counts, rotated pages |
| PDF to Word | 1 PDF (≤150MB) | .docx via server conversion | File over the size cap | LibreOffice service unavailable |
| Word to PDF | 1 .docx (≤1.5MB, Render free-tier cap) | PDF via server conversion | File over the size cap | Default-font (Calibri/Cambria) documents |
| HTML to PDF | HTML/text content | PDF snapshot | Extremely long content | Custom margins/orientation |

## Part 3 — Automated release verification

Covered by `scripts/verify-release.mjs` (orchestrates existing scripts, adds
no duplicated logic) plus the new `tests/pdf-output-validation.test.ts`
(Part 4 below). No new `verify:pdf`/`verify:tools`/`verify:admin`/`verify:seo`/
`verify:security`/`verify:performance` scripts were created as separate
commands — the existing `verify:*` scripts already cover admin,
public-catalog, analytics, and Supabase; `verify:release` is the single
composed entry point rather than a further-fragmented set of near-duplicate
scripts.

## Part 4 — PDF output validation (automated)

`tests/pdf-output-validation.test.ts` decodes generated PDFs and asserts on
MediaBox/rotation/page-count math directly — never a screenshot comparison,
per this document's own rule. It reuses the real export functions
(`exportCroppedPdf`, `exportWatermarkedPdf`) already covered in detail by
`tests/crop-export.test.ts` and `tests/watermark-export.test.ts`, adding
cross-cutting structural checks instead of duplicating their per-feature
math assertions:

- Page count preserved through export
- Mixed-page-size documents keep each page's own independent geometry
  (never reuse one page's dimensions for another)
- `/Rotate` values survive untouched when no rotation is added
- Zero-page and single-page edge cases don't crash the export loop
- Corrupted/non-PDF input is rejected by the loader, not silently accepted

Two real behavioral discoveries came out of writing these tests (documented
inline in the test file itself, not hidden):

- `createDefaultCropConfig()`'s default rect is a centered 80%×80% crop, not
  a full-page no-op.
- pdf-lib itself materializes one default A4 page when a genuinely
  zero-page document is saved and reloaded — a pdf-lib library behavior,
  independent of any Lumeo export code.

## Part 5 — Browser regression (manual)

No headless cross-browser automation exists in this repo. Before a release
that touches PDF tool UI, manually verify in each of Chrome, Edge, Firefox,
and Safari (desktop), plus at least one mobile and one tablet viewport:

- [ ] Upload via drag-and-drop AND via the file-input fallback
- [ ] Preview renders correctly (correct page count, correct orientation)
- [ ] Edit/annotate interactions work (where applicable)
- [ ] Export completes and the download starts
- [ ] Undo (where the tool has it) reverts the last action
- [ ] No memory growth after repeated upload/export cycles (check DevTools
      Memory tab across 5+ cycles)
- [ ] Keyboard-only navigation reaches every control
- [ ] Screen reader announces upload state changes, errors, and completion

## Part 6 — Admin regression (manual + partially automated)

Automated via `verify:admin-auth` and `verify:control-center`. Manually
re-verify after any admin change:

- [ ] `/admin/login` accepts only valid Supabase credentials; generic error
      message reveals nothing about account existence
- [ ] `/admin` redirects unauthenticated users to `/admin/login`
- [ ] Role enforcement: analyst is read-only, admin/owner can edit,
      owner-only actions reject admin/analyst
- [ ] Feature flags: create/edit/schedule/rollout-percentage all save
- [ ] Announcements, SEO settings, member management: CRUD round-trips
- [ ] Audit log records the action and shows the correct actor
- [ ] `loading.tsx`/`error.tsx`/`not-found.tsx` render correctly (trigger an
      error deliberately in a dev build to confirm the boundary catches it)

## Part 7 — Analytics regression (manual + partially automated)

Automated via `verify:analytics`. Manually re-verify after any analytics
change:

- [ ] Every live route in `lib/tools/catalog.ts` is present in both
      `PUBLIC_ANALYTICS_ROUTES` (`AnalyticsProvider.tsx`) and
      `PUBLIC_PAGE_ROUTES` (`AnalyticsPageView.tsx`) — a route missing from
      either allowlist silently disables its analytics
- [ ] `page_view` fires once per route per session (check Network tab, not
      just the UI)
- [ ] `tool_opened` fires once per tool workspace mount
- [ ] Operation lifecycle events (`processing_started/succeeded/failed`,
      `download_started`) fire for the tool under test
- [ ] Admin dashboard totals match the events actually generated during the
      test session (no inflation, no double-counting)
- [ ] Do Not Track and `NEXT_PUBLIC_ANALYTICS_DEBUG` both behave as
      documented in `docs/PRIVACY_ANALYTICS.md`

## Part 8 — SEO regression (manual + partially automated)

Automated via `verify:public`. Manually re-verify after any routing/metadata
change:

- [ ] `app/sitemap.ts` lists every live tool route (cross-check against
      `lib/tools/catalog.ts` — this exact gap was found and fixed in an
      earlier audit phase)
- [ ] Every tool page has `generateMetadata()` with title, description,
      canonical, Open Graph, and Twitter card data
- [ ] `/admin/*` is excluded from indexing (verified via per-page
      `robots: { index: false, follow: false }` metadata, not just
      `robots.txt`)
- [ ] A genuinely nonexistent route returns a real 404, not a silent
      fallback

## Part 9 — Security regression (manual + partially automated)

Automated via `verify:admin-auth`, `verify:supabase`, and `npm audit`.
Manually re-verify after any auth/infra change:

- [ ] `requireAdmin()` still uses `supabase.auth.getClaims()`, never trusts
      `getSession()` for authorization
- [ ] No `service_role` key or other secret appears in any client-bundled
      file
- [ ] `.env`/`.env.local` remain gitignored; no committed secrets
- [ ] The LibreOffice conversion service still requires `CONVERT_SECRET`
      and fails closed if it's unset
- [ ] `npm audit` shows no new HIGH/CRITICAL vulnerabilities beyond the
      already-documented, already-triaged set

## Part 10 — Performance baseline (measured, not optimized)

Captured on 2026-07-29 via `rm -rf .next && npm run build` (Next.js 16.2.12,
Turbopack), Windows, cold cache. These are a baseline to compare *future*
builds against, not a target — no optimization was performed to produce
them.

| Metric | Observed value |
|---|---|
| Full production build (cold) | ~35s wall clock |
| `.next` total output size | 55 MB |
| `.next/static/chunks` size | 4.0 MB |
| Static pages generated | 47 |
| Test suite (185 tests) | ~1s |

Next.js 16 + Turbopack's build output does not print a per-route
"First Load JS" table the way older webpack builds did, so per-route JS
size is not captured here. If that granularity is needed later,
`next build --profile` or a bundle analyzer would need to be wired in as a
dedicated follow-up (not attempted in this phase, to avoid a speculative
tooling addition with no immediate consumer).

## Part 11 — Release checklist

- [ ] `npm run verify:release` passes (or every non-deprecated failure is
      understood and accepted)
- [ ] Manual browser regression (Part 5) done for any UI-touching change
- [ ] Manual admin regression (Part 6) done for any admin-touching change
- [ ] Manual analytics regression (Part 7) done for any analytics-touching
      change
- [ ] Manual SEO regression (Part 8) done for any routing/metadata change
- [ ] Manual security regression (Part 9) done for any auth/infra change
- [ ] Deployment verification: confirm the Vercel preview deploy succeeded
      and matches the branch under test
- [ ] Production smoke test: after merge, load the live site and exercise
      at least one browser-only tool and one server-assisted tool
      end-to-end with a real file
- [ ] Rollback verification: confirm the previous production deployment can
      be re-promoted in Vercel if the new release needs to be reverted

## Part 12 — Documentation, troubleshooting, future contributors

- **Release process**: this document + `scripts/verify-release.mjs`.
- **Regression suite**: `tests/fixtures/pdfFixtures.ts`,
  `tests/pdf-output-validation.test.ts`, and the existing per-tool test
  files under `tests/`.
- **Verification scripts**: every `verify:*` npm script (see
  `package.json`); `verify:release` composes them.
- **Test assets**: see Part 1 above.
- **Troubleshooting a `verify:release` failure**:
  1. Read which step failed from the console output — the script stops at
     the first fatal failure in the core sequence (test/lint/typecheck/
     build) and reports (but doesn't stop on) the two known-deprecated
     scripts.
  2. For a `verify:*` script failure, read that script's own assertion
     message — they're written to name the specific file/behavior expected.
  3. If a script fails because a file was intentionally renamed/removed,
     that script itself needs updating (see the Phase 6 commit history for
     the pattern: update the assertion to match reality, or mark the whole
     script deprecated if its premise no longer applies).

### Remaining gaps (for future contributors)

- No automated cross-browser or mobile testing exists; Part 5 is a manual
  checklist only.
- No automated bundle-size/performance regression tracking exists; Part 10
  is a one-time baseline snapshot, not a CI-enforced budget.
- `verify-lumeo-aura-rollout.mjs` and `verify-lumeo-2-public-experience.mjs`
  remain deprecated rather than rewritten — a full rewrite needs a dedicated
  investigation into which of their many hardcoded content-marker checks
  still have a meaningful current-architecture equivalent.
- `hasPdfMagicBytes` (and other small validation helpers behind the `@/`
  path alias) have no dedicated unit test, for the path-alias reason
  documented in Part 1.
- Encrypted/password-protected PDF handling has no regression coverage at
  all (input or output side) — pdf-lib cannot create test fixtures for this
  case, and no evidence was found that any Lumeo tool has ever been tested
  against a real password-protected PDF.
