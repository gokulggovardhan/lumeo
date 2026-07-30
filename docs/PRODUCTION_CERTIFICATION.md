# Production Certification

Release commit: `a2dea49` (branch `phase-17-22-certification`, based on `main` @ `b4f80e6` / PR #116)
Build: Next.js (Turbopack), Node v24.16.0, npm 11.13.0
Date: 2026-07-30

## Honesty notice (read this first)

This document rolls up Phases 16–21. It is written to state exactly what
was verified, by what method, and what was not — not to declare blanket
"certified" status where the evidence doesn't support it. Several
requested sub-phases (real cross-browser/device testing, a full
Lighthouse/CPU-throttled performance pass, live analytics reconciliation,
a complete WCAG audit) require tooling or credentials this environment
does not have. Those are marked **NOT VERIFIED** below, not silently
assumed passing.

## Functional — PDF tools

**Verified**: Merge PDF, full pipeline, live production
(`https://lumeo.in/pdf/merge`), Chromium: upload two real PDFs → correct
client-side page/byte-count parsing → reorder/remove controls render →
merge action → "Merged PDF ready, 2 pages" → download link rendered,
zero console errors throughout. See [BROWSER_CERTIFICATION.md](./BROWSER_CERTIFICATION.md).

**NOT VERIFIED this session**: Split, Compress, Crop, Edit PDF,
Watermark, Sign PDF, Extract Text, PDF→Word, Word→PDF, HTML→PDF,
JPG→PDF, PDF→JPG, Organize — not individually exercised live. Their
processing logic is covered by the 207/207 passing automated test suite
(unit/integration level, not live-browser), which is real signal but not
the same as a live functional pass.

## Admin

**NOT VERIFIED**: no admin login credentials were available in this
session. Admin pages, permissions, and workflows were reviewed at the
code level only (`lib/admin/auth.ts`, `lib/admin/permissions.ts`,
`lib/admin/data.ts`) as part of the security pass — not exercised live.

## Analytics

**Reconciled.** See [ANALYTICS_CERTIFICATION.md](./ANALYTICS_CERTIFICATION.md).
The project owner ran the raw-table queries themselves (Supabase SQL
editor, own credentials -- no key was shared with this session) and
pasted back the results. All 9 checkable "Today" dashboard metrics
(unique visitors, events, page views, tool opens, processing started/
succeeded/failed, success rate, downloads) matched the raw
`analytics_events` table exactly. RLS was separately confirmed to
correctly block anon access to raw `analytics_events`. Wider-window and
per-widget (trend chart, device/browser breakdowns) reconciliation is
still open -- see that document's "What's still not covered" section.

## SEO

**Verified and fixed**: sitemap (24 URLs, all 14 tools present), robots.txt,
canonical tags, JSON-LD (SoftwareApplication + BreadcrumbList) confirmed
live. Fixed a real bug: all 14 tool pages were missing `og:image`/
`twitter:image` despite declaring `twitter:card=summary_large_image`.
See [SEO_CERTIFICATION.md](./SEO_CERTIFICATION.md).

**NOT VERIFIED**: FAQ schema presence, full image alt-text sweep, Search
Console indexing status, Rich Results Test / social card debugger
re-validation post-deploy.

## Accessibility

**NOT VERIFIED as a complete WCAG review.** Spot-checked only: the Merge
PDF drop-zone and action buttons carry accessible names in the a11y tree
(confirmed via the browser tool's accessibility snapshot), and the
homepage/tool page render without horizontal overflow at a 375px mobile
viewport. No axe-core scan, no screen reader pass (VoiceOver/NVDA/TalkBack),
no keyboard-only full-workflow completion test, no color-contrast audit
were performed. This is the largest gap in this certification — a real
WCAG pass needs a dedicated tool (axe-core / Lighthouse a11y) run per
route, which was not available here.

## Performance

Real numbers, narrow scope: single-sample Chromium page loads (Merge PDF:
DOMContentLoaded 1316ms, TTFB 17ms, uncapped network) and real Node-side
`pdf-lib` processing benchmarks for Merge/Watermark at 100/500/1000 pages
(roughly linear scaling, no quadratic blowup observed). See
[PERFORMANCE.md](./PERFORMANCE.md). **NOT VERIFIED**: Lighthouse score,
throttled-network timing, real in-browser CPU/memory profiling during
large-file processing, per-route bundle analysis, the other 12 tools'
load times.

## Security

**Fixed**: added `X-Frame-Options`, `X-Content-Type-Options`,
`Referrer-Policy`, and `poweredByHeader:false` — verified live via
`fetch()` that these were genuinely absent before, and confirmed the fix
doesn't break the build or test suite. **Documented, not fixed**: no CSP
(deliberately deferred — high risk of silently breaking WASM/workers
without per-tool testing), `firebase-admin`'s unused-but-guarded status
(21 of npm audit's findings trace to it), no rate limiting on
login/contact/API routes. See [SECURITY_CERTIFICATION.md](./SECURITY_CERTIFICATION.md).

## Deployment

**Verified**: PR #115 merged → Vercel auto-deployed → manually triggered
`production-health.yml` workflow → green (`https://lumeo.in` routes
responding). PR #116 (Phase 16) merged the same way, CI green
(CodeQL/Analyze × 3 languages, "Validate Lumeo PDF Workspace", Vercel
deploy) before merge.

**This branch (`phase-17-22-certification`) is not yet merged** — see
"What's still open" below.

## Repository health

- `npm test`: 207/207 passing, 0 skipped, 0 failing (was 182/185 at the
  start of this session).
- `npm run lint`: 0 errors on tracked source (verified by isolating from
  untracked, uncommitted tool-scaffolding noise in `.claude/helpers/`).
- `npm run build`: succeeds cleanly.
- `npx tsc --noEmit`: fails on ~15 pre-existing test files using `.ts`
  import extensions for Node's native test runner — confirmed present on
  `main` before this session's work, not a regression, not fixed here
  (separate tsconfig-scoping issue, flagged as follow-up in the Phase 16
  PR description).
- `npm audit`: 21 findings, all transitively rooted in the unused
  `firebase-admin` dependency (see Security section).

## Known limitations (explicit, not hidden)

1. No real cross-browser (Safari/Firefox/Edge independently) or
   cross-device (iOS/Android) testing — single headless Chromium only.
2. No live analytics reconciliation — blocked on credentials.
3. No complete WCAG audit — spot checks only.
4. No CSP — deliberately deferred pending per-tool testing.
5. No rate limiting on public-facing auth/contact/API endpoints.
6. `npx tsc --noEmit` (as a bare command) does not pass on this repo's
   test files; the app's own `next build` typecheck does.
7. Only 1 of 14 production tools was live functional-tested this
   session; the rest rely on the automated test suite as their evidence.

## Future recommendations

- Wire a device lab (BrowserStack or similar) into CI for real
  cross-browser/device coverage.
- Add `@next/bundle-analyzer` and a scheduled Lighthouse CI job.
- Build and test a CSP incrementally, tool by tool, in a dedicated branch
  with a real regression pass per tool after each tightening.
- Resolve `firebase-admin`'s status with the project owner (use it or
  formally drop the guard and remove it).
- Add rate limiting (e.g. Upstash) to `/admin/login`, `/contact`, and
  the `/api/tools/*` routes.
- Provide a read-only analytics reconciliation path (scoped service-role
  key, or a dedicated read-only reporting role) so Phase 21 can actually
  run.
- Run axe-core against all 14 tool routes and address findings.

## Final certification verdict

**Not fully production-certified across all 22 requested phases.**
Phase 16 (baseline test failures, verify:release lint gate) is complete
and merged (PR #116). Phases 17–20 have real, verified partial coverage
with fixes applied (security headers, SEO images) and honest gap
documentation, sitting on this branch pending review/merge. Phase 21
(analytics reconciliation) is blocked on missing credentials, not
completed. A full WCAG accessibility phase was not attempted at the
rigor requested. This document should be treated as an honest snapshot
of what's actually been checked, not a rubber stamp.
