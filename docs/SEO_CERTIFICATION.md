# SEO Certification

Refreshed: 2026-10-04

## Scope

This document records Lumeo's crawler-facing technical SEO contract. Production
verification is automated where it can be proven from the public site. Google
Search Console account data remains an external account check and is not treated
as verified until a Search Console connection is available.

## Current public-search contract

| Check | Current contract |
|---|---|
| `robots.txt` | Public crawling is allowed and the canonical `https://lumeo.in/sitemap.xml` is advertised. A blanket `Disallow: /` is a production failure. |
| `sitemap.xml` | 27 canonical public URLs are registered: 17 live tool pages, homepage, PDF Workspace, PDF tools directory, Guides, and six company/legal pages. |
| Sitemap `lastmod` | Runtime dates are forbidden. Known meaningful dates are source-controlled; routes without a reliable date intentionally omit `lastmod`. |
| Canonicals | Every sitemap URL must return HTTP 200 and emit a canonical URL matching that exact public route. |
| Indexability | A URL listed in the sitemap must not emit `noindex`. |
| Titles/descriptions | Every sitemap URL must emit a non-empty title and meta description. Titles must be unique across the sitemap. |
| Social previews | Public SEO metadata receives safe site-wide Open Graph and Twitter image fallbacks without replacing route-specific images. |
| Structured data | PDF tool pages use `SoftwareApplication` + `BreadcrumbList`; HEIC to JPEG now follows the same contract. Guides emits `CollectionPage`, breadcrumbs, and visible FAQ-backed `FAQPage` data. |
| Workspace SEO override | `/pdf` participates in the same Admin-controlled SEO override path as the rest of the canonical public registry. |
| Legacy category pages | `/pdf-tools/[category]` remains available for old/navigation links but is forced to `noindex,follow` and is intentionally absent from the sitemap. |
| Transient Workspace routes | `/pdf/add` and `/pdf/finish` remain `noindex` and are intentionally absent from the sitemap. |

## Automated production verification

`scripts/verify-production-seo.mjs` is part of the Production Health workflow.
After the exact protected-main revision is confirmed live, it checks:

- `robots.txt` crawler policy and sitemap discovery.
- Sitemap uniqueness and same-origin URLs.
- HTTP 200 for every sitemap URL.
- Exact canonical URL per page.
- No sitemap/indexability contradictions.
- Required title and description metadata.
- Complete Open Graph and Twitter preview-image metadata.
- Unique page titles across the sitemap.

These checks are additive to the existing production freshness, route health,
Admin boundary, Workspace certification, conversion smoke, and browser gates.

## Google Search Console status

Code-side Search Console readiness is covered by the contracts above. The
following items require access to the site's Google Search Console property and
cannot be inferred from repository or Cloudflare state:

- Confirm property ownership/verification.
- Confirm `https://lumeo.in/sitemap.xml` is submitted and accepted.
- Review Page indexing / Crawled - currently not indexed / Duplicate canonical
  reports.
- Inspect representative URLs: `/`, `/pdf`, `/pdf-tools`,
  `/pdf/edit`, `/pdf/merge`, and `/heic-to-jpeg`.
- Review search queries, impressions, CTR, average position, and enhancement
  reports once enough data exists.

Do not claim those account-level checks are complete without Search Console
access.

## Related follow-up

Core Web Vitals and Lighthouse lab/field performance are handled separately in
the next hardening step rather than being inferred from this SEO certification.
