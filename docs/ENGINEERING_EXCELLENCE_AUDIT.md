# Final Engineering Excellence Audit

Date: 2026-07-30
Base: `main` @ `4c691e9` (post PR #115, #116, #117, #118)

## Honesty notice

This audit builds on, and does not repeat, the evidence already gathered
in [`docs/PLATFORM_HARDENING_AUDIT.md`](./PLATFORM_HARDENING_AUDIT.md),
[`docs/SECURITY_CERTIFICATION.md`](./SECURITY_CERTIFICATION.md),
[`docs/SEO_CERTIFICATION.md`](./SEO_CERTIFICATION.md),
[`docs/PERFORMANCE.md`](./PERFORMANCE.md), and
[`docs/BROWSER_CERTIFICATION.md`](./BROWSER_CERTIFICATION.md) from this
same session. Where this pass re-checked something, it's noted as such.
No finding below is guessed — each has a command or file read behind it.

**Outcome: no new code changes this round.** Every item checked either
came back clean, was already fixed in a prior phase this session, or
needs a depth of manual verification this pass didn't reach (and is
reported as such, not fixed speculatively).

## 1. Repository structure

| Check | Finding |
|---|---|
| Duplicate/obsolete folders, stale scripts, old backups | None found in tracked source. |
| Log/cache/temp files, generated artifacts | **Real finding (MEDIUM, informational, not fixed):** 54 untracked paths sit in the working tree — `.claude-flow/`, `.claude/agents/`, `.claude/commands/`, `.claude/helpers/`, `.mcp.json`, `.swarm/`, `ruvector.db`, `graphify-out/.graphify_*` cache files, `app/graphify-out/`, `supabase/.temp/`, and a root `CLAUDE.md`. These are tool-scaffolding from this environment's setup (ruflo/claude-flow/graphify init), not application code. They are currently untracked, so they pose no risk to the shipped app, but a broad `git add -A` or `git add .` would sweep them into a commit — this almost happened earlier in this same session and was caught before committing. **Not touched here**: whether to `.gitignore` them, delete them, or intentionally commit them is a workflow decision for you, not something to decide unilaterally by editing `.gitignore` for files whose intended fate is ambiguous. |
| Duplicate docs/images | Not found; the `docs/*.md` files created this session are each new and distinct. |

## 2. Code quality

| Check | Finding |
|---|---|
| `TODO`/`FIXME`/`HACK`/`XXX` | **Zero** in tracked `app/`, `components/`, `lib/`, `services/`, `scripts/`. |
| `console.log`/`console.warn`/`console.error` | 9 files, all `console.error` in server-side API routes and admin data-layer `catch` blocks (e.g. `app/api/tools/pdf-to-word/route.ts:108`, `lib/admin/data.ts:790`), each with a descriptive message. This is legitimate server-side error logging (visible in Vercel function logs), not debug leftovers. **No fix.** |
| `eslint-disable` | 27 occurrences. 22 are `@next/next/no-img-element` on PDF thumbnail/preview `<img>` tags (deliberate — these render from `blob:`/canvas-derived sources where Next's `<Image>` optimization pipeline doesn't apply). 5 are `react-hooks/exhaustive-deps`, spot-checked at `MergePdfTool.tsx:454`, `PdfToJpgTool.tsx:460`, `SplitPdfTool.tsx:1092` — each wraps a scoped cleanup pattern (`cancelled` flag guard, explicit narrow dep arrays, or a documented mount-only reset), not a bare blanket suppression hiding an obvious bug. **No fix** — flagging the exhaustive-deps disables as the one area worth a deeper look in a dedicated React-hooks review session, since suppressing this rule is exactly where stale-closure bugs like to hide, but nothing here showed concrete evidence of an actual bug. |
| `@ts-ignore`/`@ts-expect-error` | **Zero** in tracked source. |
| `dangerouslySetInnerHTML` | 27 occurrences, **all** feeding `JSON.stringify(...)` of statically-built schema objects (`buildSoftwareApplicationSchema`/`buildBreadcrumbSchema`, confirmed reading their signatures earlier this session — inputs are hardcoded strings, not user data) into `<script type="application/ld+json">` tags. This is the standard, safe Next.js JSON-LD pattern; `JSON.stringify` escapes the content and none of it is user-controlled. **PASS, no XSS risk identified.** |
| Unused exports/utilities/hooks/types | Ran `ts-prune`. Output is dominated by Next.js file-convention exports (`default`, `metadata`, `generateMetadata`, `viewport`, `config`, `alt`, `contentType` — all called implicitly by the framework, not truly unused) and shared `components/ui/Aura.tsx` exports that ts-prune's static analysis likely under-counts real usage for (JSX/dynamic-import patterns). Per your own instruction not to trust `depcheck` blindly, the same caution applies here — **ts-prune's raw output is not trustworthy enough to act on without per-symbol manual verification, which this pass's time budget did not cover.** Reporting as NOT FULLY AUDITED, not as a clean bill of health and not as a dead-code list to act on. |
| Duplicate PDF helpers/upload/validation logic | Not exhaustively diffed function-by-function this session; a shallow pass found no obviously duplicated implementations (e.g. `lib/pdf/uploadValidation.ts`'s `checkPdfFileSize`/`hasPdfMagicBytes`/`isPdfNamedFile` are referenced from multiple tools, consistent with intentional shared helpers, not copy-paste). **NOT FULLY AUDITED at function-body level.** |

## 3. Dependency audit

Already done this session with manual verification (not blind trust) in
[`PLATFORM_HARDENING_AUDIT.md`](./PLATFORM_HARDENING_AUDIT.md#investigated-no-change-made-evidence--reasoning):
`@ffmpeg/*` confirmed dead and removed (PR #118), `tailwindcss`/`@tailwindcss/postcss`
confirmed real usage (depcheck false positive), `server-only` confirmed
intended Next.js framework aliasing (depcheck false positive, corrected
after an initial misjudgment), `firebase-admin` confirmed unused-but-
deliberately-guarded (owner decision needed, not touched).

## 4. Bundle audit

Already covered in [`PERFORMANCE.md`](./PERFORMANCE.md): per-tool dynamic
`import()` code-splitting confirmed via reading `app/pdf/merge/page.tsx`'s
`dynamic(() => import("@/components/pdf/MergePdfTool"))` pattern, real
(if narrow) transfer-size numbers captured. No `@next/bundle-analyzer`
wired in — real per-route gzip budgets remain unmeasured, as already
flagged.

## 5. Memory leak audit

Already covered in `PLATFORM_HARDENING_AUDIT.md`: object-URL create/revoke
pairing confirmed balanced (13/13 files), Worker creation/termination
confirmed paired in `lib/workers/toolWorkerClient.ts`. `AbortController`
usage confirmed at **zero** occurrences repo-wide — flagged as uncertain,
not fixed, no concrete leak/race reproduced. `ResizeObserver`/
`MutationObserver` usage and unmounted-state-update patterns were **not**
checked this round — genuine gap, not claimed clean.

## 6. React audit

Not independently re-run this round beyond the `eslint-disable`
exhaustive-deps spot-check in section 2. A full stale-closure/
over-rendering/memoization review across 61 `useEffect` sites (noted in
`PLATFORM_HARDENING_AUDIT.md`) remains **NOT AUDITED** — this session did
not reach that depth, and it should not be assumed clean.

## 7. PDF engine audit — browser-only privacy

**Verified, not just assumed**: the live Merge PDF test earlier this
session (`BROWSER_CERTIFICATION.md`) showed the entire upload→parse→merge→
download flow happen with **zero network requests** for the file content
itself — file parsing and merging both ran via in-browser `pdf-lib` calls
triggered by a local `DataTransfer`, no `fetch` to any endpoint carrying
the PDF bytes. This matches the homepage's stated claim ("processed for
the task at hand, then cleared"). The Word↔PDF conversion path is a
documented, intentional exception (uses a Supabase signed URL to a
dedicated LibreOffice container, per `services/word-to-pdf-converter/`'s
own comments) — not a violation of the privacy model, a different,
explicitly necessary architecture for a format LibreOffice alone can
convert. No server-side PDF processing was found for any of the
client-side tools. **PASS**, for what was directly observed; the other
12 tools' network behavior was not individually re-traced this session.

## 8, 9, 10, 11, 12. Accessibility, SEO, Analytics, Admin, Security

All already covered this session with real evidence in
`BROWSER_CERTIFICATION.md`, `SEO_CERTIFICATION.md`,
`ANALYTICS_CERTIFICATION.md` (blocked), and `SECURITY_CERTIFICATION.md`.
Not re-run here to avoid duplicating identical evidence — see those docs
for the actual findings, fixes, and explicit gaps.

## 13. Production audit

`npm test` (207/207), `npm run lint` (0 errors on tracked source),
`npm run build` (clean) re-verified as part of the PR #118 merge this
session. `npx tsc --noEmit` still fails on the pre-existing test-file
`.ts`-import-extension mismatch (confirmed present on `main` before this
session, documented in the Phase 16 PR, not fixed — separate scoping
issue, not a regression).

## Findings summary by severity

| Severity | Count | Items |
|---|---|---|
| CRITICAL | 0 | — |
| HIGH | 0 | — |
| MEDIUM | 1 | 54 untracked tool-scaffolding files risk accidental commit via broad `git add` (informational — workflow decision, not fixed) |
| LOW | 1 | 5 `react-hooks/exhaustive-deps` suppressions worth a dedicated deeper review (no concrete bug found, just an area with higher bug-density risk by nature) |
| INFO | 3 | `ts-prune` output unreliable without per-symbol verification (not performed); `AbortController` absence unconfirmed as a real issue; PDF-helper duplication not audited at function-body depth |

## Scores

Reusing and not re-deriving the scores already produced in
`PLATFORM_HARDENING_AUDIT.md` this same session (Production Readiness 72,
Maintainability 78, Security 68, Performance 65, Accessibility 55, SEO
82, Developer Experience 75, Technical Debt 70, Reliability 74) — this
round's findings don't move any of them materially: no new defect was
found, and no new fix was applied. See that document for the evidence
behind each score.

## Release readiness

**Ready to continue operating in production as-is.** Nothing found this
round rises to a severity that blocks release. The known gaps (no CSP,
no rate limiting, incomplete WCAG audit, blocked analytics
reconciliation, `firebase-admin`'s ambiguous status, untracked
tool-scaffolding hygiene) are documented, not hidden, and none of them
are regressions introduced this session.

## Future recommendations (evidence-backed only)

- Resolve the 54 untracked tool-scaffolding files' intended fate
  (`.gitignore` them, or deliberately commit and document them) before
  they're accidentally swept into a real commit.
- A dedicated session to manually verify `ts-prune`'s ~50 candidate
  unused exports one by one (most are almost certainly Next.js
  convention false positives, but that needs confirming, not assuming).
- A dedicated React-hooks review of the 5 `exhaustive-deps` suppressions
  and the 61 total `useEffect` sites in `components/pdf/*.tsx`.
- Everything else already listed in `PLATFORM_HARDENING_AUDIT.md`'s
  recommendation section (CSP, rate limiting, root 404/error page, full
  WCAG audit, analytics reconciliation).

No new cleanup work beyond what's listed above is recommended — nothing
else in this pass turned up concrete, evidence-backed findings worth
acting on.
