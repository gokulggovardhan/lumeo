# Lumeo PDF Workspace

Lumeo PDF Workspace is a premium browser-first PDF workspace designed for private, professional document handling.

Live website: https://lumeo.in

## Product vision

Lumeo PDF is being built as a calm, serious, premium document workspace. The product direction is simple first, powerful when needed, and premium always.

The goal is not to feel like a generic PDF utility grid. Lumeo should feel like a private document console where important files are handled carefully.

## Current tools

Live production tools (browser-only processing, `pdf-lib` + `pdfjs-dist`):

- Merge PDF, Split PDF, Organize PDF (reorder/rotate/remove/duplicate pages) — `/pdf/merge`, `/pdf/split`, `/pdf/organize`
- Compress PDF — `/pdf/compress`
- JPG/PNG/WEBP to PDF — `/pdf/jpg-to-pdf`
- PDF to JPG/PNG/WEBP — `/pdf/pdf-to-jpg`
- Extract Text — `/pdf/extract-text`
- Edit PDF (text, images, shapes, ink) — `/pdf/edit`
- Watermark PDF (preset + advanced manual positioning, v1.1) — `/pdf/watermark`
- Crop PDF — `/pdf/crop`
- Sign PDF — `/pdf/sign`

Live production tools (server-assisted, self-hosted, no third-party processors):

- Word to PDF, PDF to Word — `/pdf/word-to-pdf`, `/pdf/pdf-to-word` (self-hosted LibreOffice conversion service, see `services/word-to-pdf-converter/`; temporary files only, deleted immediately after conversion)
- HTML to PDF — `/pdf/html-to-pdf`

Planned / not yet live (see `lib/tools/catalog.ts` for the authoritative, current list — every action's `live` flag there is the source of truth, not this README):

- Protect/Unlock/Redact PDF, PDF/A, Repair, OCR (searchable scans via Tesseract), and several other actions grouped under in-progress tool categories.

A tool is only "live" once its `live: true` flag is set in `lib/tools/catalog.ts` **and** its Supabase `pdf_tools` catalog row is seeded — both are required for it to appear as available in production.

## Core principles

- Browser-first by default; a tool only uses server processing when the task genuinely requires it (e.g. Office document conversion via LibreOffice), and that is always disclosed here.
- Document contents stay on the user's device for all browser-processed tools — no upload, no server-side PDF manipulation.
- For the two server-assisted conversion tools, uploaded files are stored only in a short-lived Supabase scratch bucket and deleted immediately after conversion — never retained, never analyzed.
- Calm, professional Midnight Notary visual design.
- Dual-named tool catalog: a small set of deep "Lumeo" tools (Compose, Distill, Capture, Render, Inscribe, Seal, Secure, Convert, Recognize), each bundling multiple concrete actions — see `lib/tools/catalog.ts`.

## Processing architecture

Most PDF processing happens entirely in the browser via `pdf-lib` (manipulation) and `pdfjs-dist` (preview/decode). No file upload, no server-side PDF manipulation, no Firebase, no Cloudinary, no Google Drive.

The Office-conversion tools (Word to PDF, PDF to Word, HTML to PDF) are the deliberate exception: they call a self-hosted LibreOffice conversion service (`services/word-to-pdf-converter/`, deployed separately) through a Supabase storage bucket for the temporary file hop. This is disclosed here precisely because it's the one place document bytes leave the browser.

Document contents must not be stored in `localStorage`. UI preferences (e.g. thumbnail density) may be stored locally when they contain no document data.

Any future feature that adds new backend processing, accounts, cloud history, or sync must be explicitly approved and disclosed before release, following the same pattern as the Office-conversion tools above.

## Design system

Theme: Midnight Notary

Core tokens:

- Notary Dark: `#0C1220`
- Parchment: `#F0EAD6`
- Aged Cream: `#E8DFC8`
- Deep Slate: `#1A2840`
- Seal Green: `#1E6B4A`
- Gold Ink: `#C9A84C`

Typography direction:

- DM Sans
- DM Serif Display

Visual rules:

- Deep navy premium surfaces.
- Parchment-inspired document styling.
- Gold only for restrained premium accents.
- Seal Green for primary actions and selected states.
- No red PDF branding, neon, generic dashboard styling, or iLovePDF-style tool grids.

## Local development

Install dependencies:

```bash
npm.cmd install
```

Run the local development server:

```bash
npm.cmd run dev
```

Build for production:

```bash
npm.cmd run build
```

## Testing and verification

Run the test suite (bare Node test runner, no framework dependency):

```bash
npm.cmd run test
```

Run lint and a production typecheck:

```bash
npm.cmd run lint
npx tsc --noEmit
```

Run a production build:

```bash
npm.cmd run build
```

Before committing changes: run `git diff --check`, the commands above, and any relevant `npm run verify:*` scripts (see `package.json` for the full list — e.g. `verify:supabase`, `verify:admin-auth`, `verify:analytics`, `verify:public`). These are manual developer-verification scripts, not part of CI; several check that specific historical rollout milestones haven't regressed and a few currently fail against files that were renamed since they were written — treat a `verify:*` failure as a signal to investigate, not an automatic blocker.

## Project structure

- `app/page.tsx` — public Lumeo PDF homepage.
- `app/pdf/*` — PDF tool routes (one folder per live tool, e.g. `app/pdf/watermark`).
- `app/admin/(protected)/*` — Control Center admin console (auth-gated via `requireAdmin()` in the route group's `layout.tsx`).
- `app/admin/login`, `app/admin/logout` — public admin auth routes, intentionally outside the protected route group.
- `components/pdf/*` — one tool component per live PDF tool (e.g. `WatermarkTool.tsx`, `CropPdfTool.tsx`).
- `components/admin/*` — shared Control Center UI primitives (`AdminSectionCard`, `AdminDataTable`, `AdminFormField`, etc.).
- `components/analytics/*` — `AnalyticsProvider` (route-gated event tracking) and `AnalyticsPageView` (page-view firing).
- `lib/pdf/<tool>/` — per-tool config types and export logic (e.g. `lib/pdf/watermark/config.ts`, `lib/pdf/watermark/export.ts`).
- `lib/tools/catalog.ts` — the single source of truth for which tools/actions are live, their routes, and their processing model.
- `lib/admin/*` — admin auth, permissions, validation, and data-access helpers.
- `lib/analytics/*` — client-side analytics state/dedup helpers.
- `lib/supabase/*` — browser/server Supabase clients and the temp-storage helper for Office conversion.
- `services/word-to-pdf-converter/` — the separately-deployed LibreOffice conversion microservice (Docker).
- `supabase/migrations/` — SQL migrations, applied manually through the Supabase SQL editor (see `docs/SUPABASE_FOUNDATION.md`).
- `scripts/*.mjs` — manual developer-verification scripts, invoked via the `verify:*` npm scripts.
- `docs/specs/` — frozen, shipped feature specifications (e.g. `watermark-pdf-v1-freeze.md`) — historical record, not aspirational.
- `tests/*.test.ts` — Node's built-in test runner, run via `npm run test`.

## How to add a new tool

1. Add the action to `lib/tools/catalog.ts` with `live: false` and no `route` until it's ready.
2. Build `lib/pdf/<tool>/config.ts` (config types + pure helpers) and `lib/pdf/<tool>/export.ts` (pdf-lib export logic).
3. Build `components/pdf/<Tool>Tool.tsx` and its route under `app/pdf/<tool>/page.tsx`.
4. Add the route to both `PUBLIC_ANALYTICS_ROUTES` (`components/analytics/AnalyticsProvider.tsx`) and `PUBLIC_PAGE_ROUTES` (`components/analytics/AnalyticsPageView.tsx`) — both allowlists must be kept in sync with `lib/tools/catalog.ts`'s live routes, or analytics silently won't fire for the new tool.
5. Flip `live: true` and set `route` in `lib/tools/catalog.ts`, and seed a matching row in the Supabase `pdf_tools` table via a new migration (mirror an existing seed migration, e.g. `20260729001_seed_crop_pdf_tool.sql`).
6. Write tests under `tests/`, verify with the full test/lint/typecheck/build sequence above, and confirm the exported PDF by decoding it (don't just trust the preview).

## How analytics work

See `docs/PRIVACY_ANALYTICS.md` for the full model. In short: first-party only, no third-party analytics provider, anonymous per-tab session ID via `crypto.randomUUID()` in `sessionStorage`, an explicit event allowlist (`page_view`, `tool_opened`, `processing_started/succeeded/failed`, `download_started`), and a route allowlist that gates whether analytics is enabled at all for a given page.

## How the admin console works

See `docs/ADMIN_AUTH.md` for the auth model. In short: Supabase email/password sign-in, verified via `supabase.auth.getClaims()` (never trust `getSession()` for authorization), cross-checked against an `admin_members` table with three roles (`owner`, `admin`, `analyst`). Every protected page lives under `app/admin/(protected)/` so the route group's `layout.tsx` enforces `requireAdmin()` before rendering.

## Privacy model

- Browser-processed tools: files never leave the device, nothing is uploaded, nothing is stored in `localStorage`.
- The two Office-conversion tools (Word↔PDF, HTML to PDF): files pass through a short-lived Supabase scratch bucket and a self-hosted LibreOffice service, then are deleted immediately after conversion.
- Temporary object URLs and active workspace state should be cleared by cleanup or reset flows.
- Browser downloads remain under the user's control.

## Locked feature policy

Merge PDF is permanently locked except for bug, security, and compatibility fixes.

Split PDF is protected after Premium v2. Do not redesign or alter Split PDF without explicit approval.

## Development workflow

The current workflow is:

1. Work directly on `main` for small fixes, or use a feature branch + PR for larger changes (`main` has branch protection requiring passing status checks).
2. Inspect relevant files before editing.
3. Preserve locked tools and protected SEO content.
4. Run the test/lint/typecheck/build sequence above.
5. Commit focused changes — one purpose per commit.
6. Push after validation; open a PR if `main` requires one.

## Deployment

The public domain is https://lumeo.in, deployed on Vercel. The Word/PDF-to-Word/HTML-to-PDF conversion service (`services/word-to-pdf-converter/`) is deployed separately (currently Render's free tier — see the file-size comments in `lib/supabase/pdfToWordStorage.ts` for the memory constraint that drives its upload cap). Deployment configuration should not expose secrets, credentials, private keys, or service tokens.

## Contributing expectations

- Do not expose secrets.
- Do not invent legal, security, privacy, certification, or compliance claims.
- Do not modify locked PDF tools without explicit approval.
- Keep public copy calm, accurate, and premium.

## License

No public open-source license has been declared.

## Contact

See the public contact page at https://lumeo.in/contact. A verified public mailbox is not declared in this repository.
