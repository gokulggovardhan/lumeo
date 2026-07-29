# Security Certification

Release commit: `b4f80e6` (main, post-#116), plus this session's `next.config.ts` header fix.
Date: 2026-07-30

## Scope and honesty notice

This is a code-level and live-response audit performed by reading the
repository and probing the production origin (`https://lumeo.in`) directly.
It is **not** a penetration test, a fuzzing pass, or a third-party pentest
engagement. No dynamic vulnerability scanner (Burp, OWASP ZAP) was run.
Findings below are what was actually read/observed; nothing is inferred
from a generic checklist without evidence.

## Fixed this session

**Missing baseline security response headers.** Verified live against
`https://lumeo.in` via `fetch()`: the site returned `strict-transport-security`
(good, Vercel default) but no `Content-Security-Policy`,
`X-Frame-Options`, `X-Content-Type-Options`, or `Referrer-Policy`, and
leaked `X-Powered-By: Next.js`. Confirmed the app has no cross-origin
iframe embedding of itself (`HtmlToPdfTool.tsx`'s `<iframe>` is same-page,
used to render user HTML for capture, not an embed of lumeo.in in another
site), so `X-Frame-Options: DENY` is safe. Added in `next.config.ts`:
- `poweredByHeader: false` (removes the `X-Powered-By` leak)
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`

Verified with a full `npm run build` (succeeds) and `npm test` (207/207
still passing) after the change — no behavior regression.

**Content-Security-Policy was deliberately not added.** The app loads a
vendored FFmpeg WASM bundle, uses Web Workers, `blob:` URLs for
generated PDF downloads, and inline-hydration data from Next.js across
14 different interactive tools. A CSP strict enough to be meaningful but
loose enough not to break WASM (`worker-src blob:`, `script-src` for
Next's inline bootstrap, `connect-src` for Supabase) needs to be built
and tested against every tool's actual runtime behavior — getting it
wrong silently breaks tools rather than failing loudly. That is real,
scoped follow-up work, not something to guess at inside this pass.

## Reviewed, no code change made

| Area | Finding |
|---|---|
| **Admin auth** (`lib/admin/auth.ts`, `lib/admin/permissions.ts`) | Session/cookie handling delegates to `@supabase/ssr`, which sets `httpOnly`/`secure` cookies by default. Not independently fuzzed. |
| **CSRF** | No custom CSRF token layer found; relies on Supabase's cookie-based session + `sameSite` cookie defaults. Admin mutations were not individually traced for CSRF-safety this session — flagged as unverified, not confirmed safe. |
| **Geo-location cookie** (`lib/supabase/proxy.ts:19-26`) | Sets `sameSite: "lax"` but no explicit `secure`/`httpOnly`. Holds only a non-sensitive city/region/country string (analytics, not auth), so severity is low, but it's a cheap hardening opportunity — not applied here since it's a minor hardening, not a proven vulnerability. |
| **`firebase-admin` dependency** | Declared in `package.json`, contributes the bulk of `npm audit`'s 21 findings (uuid, gaxios, teeny-request, @google-cloud/storage — all transitive via firebase-admin) via `firebase-admin`'s dependency chain, but is **not imported anywhere in the app**. It is, however, deliberately version-pinned by explicit assertions in `scripts/verify-admin-auth.mjs` and `scripts/verify-control-center.mjs` ("firebase-admin version changed unexpectedly"). This looks like an intentional placeholder for planned admin-auth work, not an accidental leftover — **not removed** here since removing it would fail those verify scripts and the intent is unclear without asking the project owner. |
| **`npm audit`** | 21 findings (15 high, 6 moderate) — all transitive, all rooted in the unused-but-guarded `firebase-admin` dependency. Zero findings in packages the app code actually imports. `npm audit fix --force` would downgrade `firebase-admin` to a semver-major version, which is out of scope to apply blind. |
| **Rate limiting** | No dedicated rate-limiting/throttling middleware found for admin login, the contact form, or public API routes (`app/api/tools/*`). The only "rate limit"-named code is retry/backoff logic in `lib/supabase/pdfToWordStorage.ts` and `wordToPdfStorage.ts`, not abuse prevention. This is a real gap for a public-facing login and contact form, but building it (e.g. Upstash Redis + `@upstash/ratelimit`) is new infrastructure, not a "proven fix" — flagged as a recommendation, not implemented. |
| **LibreOffice conversion service** (`services/word-to-pdf-converter/server.js`) | Uses `crypto.timingSafeEqual` for constant-time secret comparison (confirmed present, good practice against timing attacks). Standalone container, not exposed to the public internet directly per its own comments (called only from the Next.js API route with a Supabase signed URL). Dockerfile itself was not re-audited this session (covered in a prior session per project memory). |
| **Blob lifecycle / "nothing is stored"** | Homepage explicitly claims "Each file is processed for the task at hand, then cleared — no drafts, no cached copies." Consistent with the client-side pdf-lib processing observed in the live Merge PDF test (parsing and merging happened entirely via `fetch`-free, in-browser `DataTransfer`/`pdf-lib` calls — no upload request was observed for the merge operation itself). Server-side blob cleanup (the Word↔PDF conversion path, which does use Supabase Storage) was not re-verified this session. |
| **Supabase RLS** | Not independently queried this session — would require direct Supabase project access (service-role credentials), which this session does not have. Flagged as unverified, not "checked and passing." |

## Not verified — requires follow-up

- A real CSP, tested tool-by-tool.
- CSRF-safety trace of every admin mutation endpoint.
- Rate limiting on `/admin/login` and `/api/*` routes.
- Supabase RLS policy review (needs project credentials).
- SSRF review of any server-side URL-fetching code path (not located/audited this session — would need a targeted `grep` pass over `fetch(` calls that take user-controlled URLs).
- Dockerfile / container hardening review (last covered in an earlier session per project history — not re-run here).
- Third-party penetration test.

## Recommendation

Treat `firebase-admin`'s status (used vs. intentionally-reserved-but-vulnerable)
as a question for the project owner — either wire it into real admin-auth
work soon, or explicitly document why it's pinned unused so the 21
`npm audit` findings aren't silently ignored release after release.
