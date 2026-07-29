# SEO Certification

Release commit: `b4f80e6` (main, post-#116), plus this session's OG/Twitter image fix.
Date: 2026-07-30

## Scope and honesty notice

Verified against the live production site (`https://lumeo.in`) via direct
`fetch()` calls and DOM inspection in the one available headless Chromium
browser, plus reading the metadata-generation source. No third-party SEO
crawler (Screaming Frog, Ahrefs, Google Search Console) was available.

## Fixed this session

**Missing `og:image`/`twitter:image` on all 14 tool pages.** Verified
live: the homepage correctly emits `og:image`/`twitter:image` (via Next's
file-convention `app/opengraph-image.tsx` / `app/twitter-image.tsx`), but
`/pdf/merge` emitted `ogImage: null` and `twitterImage: null` despite
declaring `twitter: { card: "summary_large_image", ... }` — a card type
that requires an image to render correctly on social platforms.

Root cause: every tool page (`app/pdf/*/page.tsx`) defines its own
`generateMetadata()` with a complete `openGraph`/`twitter` object that
omits `images`. Next.js's metadata resolution does not backfill `images`
from a sibling/root file-convention route once a page supplies its own
`openGraph`/`twitter` object — the object is used as given, not deep
merged with the auto-generated image.

Fix: added `images: ["https://lumeo.in/opengraph-image"]` and
`images: ["https://lumeo.in/twitter-image"]` to all 14 tool pages
(compress, crop, edit, extract-text, html-to-pdf, jpg-to-pdf, merge,
organize, pdf-to-jpg, pdf-to-word, sign, split, watermark, word-to-pdf),
pointing at the same branded image the homepage already uses. This is a
mechanical, low-risk change (metadata only, no runtime behavior touched)
— confirmed with a full `npm run build` (succeeds) and `npm test`
(207/207 passing) after the change.

Per-tool custom OG images (rather than reusing the site-wide one) is a
larger content-production task, flagged as a follow-up, not attempted
here.

## Verified, already correct

| Check | Result |
|---|---|
| `robots.txt` | `User-Agent: *` / `Allow: /` / points to sitemap. Correct, no accidental blanket disallow. |
| `sitemap.xml` | 24 URLs, all 14 production tools present (merge, split, compress, jpg-to-pdf, pdf-to-jpg, sign, organize, extract-text, edit, watermark, crop, word-to-pdf, pdf-to-word, html-to-pdf), plus homepage, `/pdf`, `/pdf-tools`, and legal/company pages. `lastmod`/`changefreq`/`priority` present per entry. |
| Canonical tags | Present and route-correct on homepage (`https://lumeo.in`) and Merge PDF (`https://lumeo.in/pdf/merge`); other tool pages follow the same `generateMetadata()` pattern with `alternates.canonical` set per-route. |
| Structured data | Merge PDF page emits both a `SoftwareApplication` and a `BreadcrumbList` JSON-LD block (`lib/public-site/schema.ts`'s `buildSoftwareApplicationSchema`/`buildBreadcrumbSchema`), each tool page builds these with a route-specific `featureList` and breadcrumb trail. |
| Per-page unique titles/descriptions | Each tool page hardcodes its own `title`/`description`/`openGraph`/`twitter` copy (verified merge, split, watermark) — no shared boilerplate string reused verbatim across tools, so no obvious duplicate-metadata risk from a spot check. |
| SEO override system | `lib/public-site/seo.ts`'s `withSeoOverride()` lets an admin override title/description/canonical/robots/OG title+description per route via Supabase, with a fail-safe fallback to the static default on any DB error — additive, doesn't ship the site metadata-blind if the DB is down. |

## Not verified — requires follow-up

- FAQ schema — not found in any tool page's JSON-LD; the "Merge PDF page
  refactored to remove visible FAQ content, keep only schema" note in
  project history suggests FAQ *schema* may still exist somewhere, but it
  was not located in `app/pdf/merge/page.tsx` this session — worth a
  direct check.
- Image alt-text audit across all 14 tool pages (spot-checked none this
  session beyond the OG-image fix above).
- Internal linking / orphan-page audit.
- A full duplicate-metadata sweep across all 14 tool pages plus `/guides`
  content pages (only merge/split/watermark were spot-checked).
- Google Search Console / Bing Webmaster Tools indexing status — no
  credentials available in this environment.
- Core Web Vitals field data (this requires real user data over time, not
  something obtainable from a single session).

## Recommendation

Re-run this audit through Google's Rich Results Test and the
`og:image`/`twitter:image` Facebook/Twitter card debuggers once the fix
above is live in production, to confirm the crawler-facing render (not
just the DOM meta tag) is correct.
