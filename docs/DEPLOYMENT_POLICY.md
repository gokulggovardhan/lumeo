# Deployment policy

Lumeo uses Vercel when a hosted environment adds value; Vercel is not the normal debugging loop.

## Development

- Research and active implementation stay local first.
- Run targeted tests before broad checks.
- For browser-local features, prefer a production-mode local Next.js build plus Chromium/WebKit tests before pushing.
- Batch related edits into a meaningful logical commit instead of pushing every small correction.

## Research branches

Vercel Preview deployments are disabled for these non-release namespaces:

- `research/**`
- `investigation/**`
- `experiment/**`

These branches are for dependency investigation, security research, feasibility work, fixtures, and other work that does not need a hosted environment. They are not intended to merge directly while the repository's `Protect main` ruleset requires the Vercel status check.

If research produces releasable code, move the completed logical change to a normal release/feature/fix branch, run the required CI, and let that release candidate receive its meaningful Preview.

## Pull requests

The current `Protect main` ruleset requires both:

- `Validate Lumeo PDF Workspace`
- `Vercel`

Therefore ordinary mergeable PRs still need a Vercel Preview. Until that ruleset is deliberately changed, target one meaningful Preview per normal PR by validating locally/CI first and avoiding micro-pushes. A second Preview is appropriate when hosted review finds a real issue.

Do not use Vercel's ignored-build command merely to save deployment quota: a skipped/cancelled Vercel build is still a deployment. Branch deployment suppression is the quota-saving mechanism used here.

## Production

`main` remains the production branch. A completed PR is merged only after required checks pass; the resulting `main` SHA is then deployed once through the existing Vercel Git integration.

For important releases verify:

`GitHub main SHA == Vercel production source SHA`

Do not promote an older Preview as a substitute for the merged source SHA.

## Retry and quota handling

- Never create dummy, whitespace-only, or "trigger deploy" commits.
- If Vercel is rate-limited, keep the exact release SHA and wait for the limit to clear.
- Use Vercel's legitimate redeploy/create-deployment controls when a retry is needed.
- Do not repeatedly retry while a deployment is queued or rate-limited.
- Do not add a second GitHub Actions deployment path; Vercel Git integration is the single deployment mechanism.

## Feature-specific workflow

HEIC/HEIF work should normally use its unit/security tests, deterministic fixtures, JPEG SOF dimension checks, Chromium/WebKit, and the HEIC Release Gate before a hosted Preview.

Admin work should normally use its auth/security/browser tests in Chromium/WebKit before a hosted Preview.

The target lifecycle is:

**Local → targeted tests → production-mode local/CI validation → necessary Preview → merge → one production deployment → verify that deployment.**
