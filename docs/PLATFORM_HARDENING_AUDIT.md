# Final Platform Hardening Audit

Date: 2026-07-30
Base: `main` @ `52d8eb2` (post PR #115, #116, #117), plus `chore/remove-unused-ffmpeg-deps` (PR #118)

## Honesty notice

Evidence-based only. Every PASS below is backed by a command actually run
or a file actually read this session, cited inline. Every WARNING/NEEDS
FUTURE WORK is a real gap, not a guess. Nothing was fixed without
evidence; nothing was left broken silently.

## Fixed this session (own PR each)

| Fix | Evidence | Risk | PR |
|---|---|---|---|
| Missing `X-Frame-Options`/`X-Content-Type-Options`/`Referrer-Policy`, `X-Powered-By` leak | Live `fetch()` against `lumeo.in` showed these absent | Low — additive headers, verified no iframe self-embedding | #117 (merged) |
| 14 tool pages missing `og:image`/`twitter:image` | Live DOM inspection: `ogImage: null` on `/pdf/merge` despite `twitter:card=summary_large_image` | Low — metadata only | #117 (merged) |
| `@ffmpeg/core`/`@ffmpeg/ffmpeg`/`@ffmpeg/util` unused, ~32MB dead weight | Repo-wide grep: zero references outside the postinstall copy script and a cache-header rule | Low — build+test+lint reverified clean after removal | #118 (open, CI pending) |

## Investigated, no change made (evidence + reasoning)

| Area | Finding | Verdict |
|---|---|---|
| Object URL lifecycle (`createObjectURL`/`revokeObjectURL`) | 13 files create, all 13 also revoke in the same file (`grep` cross-check) | **PASS** |
| Web Worker lifecycle | `lib/workers/toolWorkerClient.ts` both creates and `.terminate()`s the worker | **PASS** |
| `firebase-admin` (source of 21 `npm audit` findings) | Unused in app code, but deliberately version-pinned by `verify-admin-auth.mjs`/`verify-control-center.mjs` assertions | **NEEDS FUTURE WORK** — owner decision required, not a blind removal (see `SECURITY_CERTIFICATION.md`) |
| Tailwind CSS (`depcheck` flagged as unused dev dep) | False positive — confirmed real usage via `@import "tailwindcss"` in `app/globals.css` + `postcss.config.mjs` | **PASS**, no action |
| `server-only` (`depcheck` flagged as "missing" from package.json) | Investigated: Next.js aliases this import specifier to its own bundled `node_modules/next/dist/compiled/server-only` internally — intended framework behavior, not a fragile accident. Initially misjudged as a bug; corrected after checking `node_modules` directly before touching anything. | **PASS**, no action (false positive) |
| PWA manifest (`app/manifest.ts`) | Name, short_name, description, start_url, standalone display, theme/background colors, 192/512 icons with `maskable` purpose all present; icon files confirmed to exist in `public/` | **PASS** |
| Dark/light mode | Zero `prefers-color-scheme` or theme-toggle code anywhere in the app | **N/A** — this is a single fixed dark-brand design system ("Aura"/Atelier tokens), not an oversight; there is no light-mode variant to fall back to by design |
| ARIA/accessible labeling (spot check, Merge PDF) | 7 `aria-*`/`role=` usages in `MergePdfTool.tsx`; live a11y-tree inspection earlier this session showed the drop zone and action buttons carry accessible names | **PASS** (spot check only — not a full audit, see gaps below) |
| Root 404 page | No `app/not-found.tsx` at the root (only `app/admin/(protected)/not-found.tsx` exists) — public 404s fall through to Next's generic default page | **WARNING** — real gap, not fixed (branded 404 copy/design is content work, not a mechanical low-risk change) |
| Root error boundary | No `app/error.tsx` at the root (only `app/pdf/error.tsx`, `app/pdf-tools/error.tsx`, `app/global-error.tsx`). An error thrown in, e.g., `/contact` or `/about` bubbles to `global-error.tsx`, which replaces the entire `<html>` document (losing site chrome) rather than a scoped in-layout error UI | **WARNING** — valid Next.js fallback, not broken, but a worse UX than a scoped boundary; not fixed here (same reasoning as 404) |
| AbortController usage | Zero occurrences repo-wide | **UNCERTAIN, not fixed** — could indicate missing fetch-cancellation on unmount for the Word/PDF conversion network calls, but no concrete race condition or bug was observed/reproduced this session. Flagging as unverified rather than fixing speculatively. |
| `useEffect` cleanup correctness across all PDF tools | 61 `useEffect` call sites across `components/pdf/*.tsx` | **NOT AUDITED** — volume too large to individually verify at this session's scope without risking a shallow, false-confidence pass. Flagged as future work, not claimed clean. |
| Bundle splitting / tree shaking / hydration / Suspense boundaries | `next build` output shows dynamic imports already in use per tool page (confirmed reading `app/pdf/merge/page.tsx`'s `dynamic(() => import(...))` pattern) and a mix of static/dynamic route rendering | **PARTIAL PASS** — dynamic-import code-splitting per tool is real and confirmed; a full bundle-analyzer pass (per-route gzip budget) was not run (see `PERFORMANCE.md`) |

## Not investigated this session (explicit gaps)

- Full WCAG accessibility audit (axe-core, screen reader, keyboard-only full workflow, color contrast) — see `docs/BROWSER_CERTIFICATION.md`.
- Race conditions / stale closures across all 14 tools — would require per-tool code review at a depth this session didn't reach.
- React Compiler compatibility — not checked (would need to actually enable it and diff behavior).
- Memory profiling during real large-PDF processing in-browser — see `docs/PERFORMANCE.md`.
- Analytics dashboard reconciliation — blocked, see `docs/ANALYTICS_CERTIFICATION.md`.

## Scored certification

These scores are qualitative judgments grounded in the evidence gathered
across this session and the linked certification docs — not derived from
an automated scoring tool (none was available). Treat them as an honest
estimate, not a precise instrument reading.

| Dimension | Score /100 | Basis |
|---|---|---|
| Production Readiness | 72 | Core pipeline (Merge PDF) verified working end-to-end in production with zero errors; 207/207 automated tests pass; build is clean. Held back by unverified device/browser coverage and an incomplete a11y audit. |
| Maintainability | 78 | Clean dependency tree after ffmpeg removal, no obvious circular architecture issues surfaced, consistent per-tool page pattern (`generateMetadata` + dynamic import) observed across all 14 tools. Held back by 61 unaudited `useEffect` sites and no automated dead-code/unused-export tooling wired into CI. |
| Security | 68 | Baseline headers now present, RLS confirmed enforced on at least one table, timing-safe secret comparison confirmed in the LibreOffice service. Held back by no CSP, no rate limiting, 21 unresolved (if low-priority) `npm audit` findings, and an unverified CSRF/admin-mutation trace. |
| Performance | 65 | Real evidence of roughly-linear PDF processing scaling to 1000 pages, dynamic per-tool code splitting confirmed. Held back by no Lighthouse/throttled-network data and no real in-browser memory/CPU profiling under load. |
| Accessibility | 55 | Spot checks only (one tool, one viewport) were positive, but a full WCAG pass never ran — this is the single largest unverified gap in the whole certification effort. |
| SEO | 82 | Sitemap, robots.txt, canonical tags, structured data, and (after this session's fix) OG/Twitter images all verified correct across all 14 tools. Held back by unverified FAQ schema and no Search Console data. |
| Developer Experience | 75 | `verify:release` pipeline exists and mostly works (Phase 16 fixed its lint gate); `npx tsc --noEmit` doesn't cleanly pass as a bare command due to a tsconfig/test-runner mismatch that predates this session and wasn't fixed (flagged, not silently ignored). |
| Business Readiness | — | Out of this audit's scope (technical, not product/GTM). |
| Technical Debt | 70 | Meaningfully reduced this session (dead ffmpeg deps removed, lint gate false-positive fixed, OG images fixed). `firebase-admin`'s ambiguous status and the missing root error/404 boundaries remain as known, documented debt. |
| Reliability | 74 | Deployment pipeline verified working (auto-deploy + health check green after two consecutive merges), core tool pipeline verified functional. Held back by the same untested-tool-surface-area gap noted throughout. |

## Recommendation — what's next

Per your instruction not to recommend further cleanup without concrete
evidence: the cleanup backlog that *is* evidence-backed (CSP, rate
limiting, root error/404 boundaries, full a11y audit, analytics
reconciliation, `firebase-admin` resolution) is already listed above and
in the per-phase certification docs — it's real, but it's hardening, not
growth. Beyond that, this audit surfaced no further code-level cleanup
with concrete evidence behind it. Business-value-oriented next steps
(new tools, monetization, auth/team features, etc.) are outside what a
code audit can respons­ibly recommend — that's a product decision for
you, not something to infer from `grep` output.
