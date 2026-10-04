# Sitemap maintenance

`lib/public-site/routes.ts` is the canonical public route registry used by the
sitemap and Admin SEO coverage. Keep priorities and change frequencies there.

Set a route's optional `lastModified` to an ISO calendar date (`YYYY-MM-DD`) only
when a meaningful public page change is known. Update that route's date when its
content, metadata, or user-facing functionality meaningfully changes. Do not
update dates for every build, request, deployment, or unrelated code change.

The initial dates for `/`, `/pdf`, and `/pdf-tools` come from the Hybrid entry
release, PR #573, commit `498ef1fffc4d5152a1bd6c3f9f6244571133b54b`
(03-Oct-2026). Routes without reliable change dates intentionally omit `lastmod`;
they remain in the sitemap. Do not invent historical dates to fill the field.

`buildPublicSitemap` reads only this source-controlled registry. The regression
suite advances the clock by one day and verifies identical sitemap output,
including the complete public route inventory. Transient Workspace helper routes
`/pdf/add` and `/pdf/finish` remain excluded.
