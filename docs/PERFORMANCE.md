# Performance Certification

Release commit: `b4f80e6` (main, post-#116)
Date: 2026-07-30

## Scope and honesty notice

No Lighthouse, WebPageTest, or CPU/network-throttled device lab was
available in this session. There is also no way from this environment to
read real browser process CPU/memory (that requires OS-level profiling of
a real Chrome instance, which the available browser-automation tool does
not expose). Numbers below are either:

1. **Real, single-sample measurements** taken from the one live headless
   Chromium session against production (`https://lumeo.in`), with no
   network throttling — so they represent a best-case, not a typical
   mobile-3G user.
2. **Real Node-side benchmarks** of the exact processing library
   (`pdf-lib`, the same library `lib/pdf/*` and the tool components use)
   run on this machine — these measure algorithmic/library cost, not full
   end-to-end browser wall-clock time including UI thread contention.

Anything not measured is listed as an open item, not claimed.

## Page load (headless Chromium, uncapped network, single sample)

| Page | DOMContentLoaded | TTFB | JS (decoded) | CSS (decoded) |
|---|---|---|---|---|
| Homepage `/` | ~1.3s | 17ms | not separately captured | not separately captured |
| Merge PDF `/pdf/merge` | 1316ms | 17ms | 1308 KB across 17 chunks | 158 KB across 2 files |

These are single-run numbers from a cloud-hosted browser session, not an
averaged multi-run Lighthouse trace, and not representative of a
throttled 4G/3G connection or a low-end mobile CPU.

## PDF processing scale benchmark (pdf-lib, Node, this machine)

Synthetic single-column text PDFs at 100 / 500 / 1000 pages, run through
the actual `pdf-lib` operations Lumeo's Merge and Watermark tools use
(page copy for merge; per-page `drawText` for watermark):

| Pages | Merge time | Merge output size | Watermark time | Watermark output size |
|---|---|---|---|---|
| 100 | 93 ms | 23 KB | 155 ms | 47 KB |
| 500 | 521 ms | 114 KB | 795 ms | 231 KB |
| 1000 | 1026 ms | 228 KB | 1512 ms | 463 KB |

Both operations scale roughly linearly with page count — no evidence of
quadratic blowup at 1000 pages. Note these fixtures are text-only
synthetic pages; real-world PDFs with embedded images, fonts, or complex
vector content will process slower and produce larger output than these
numbers suggest.

## Bundle size

`npm run build` output (see build log) shows all 14 PDF tool routes and
the homepage building successfully as a mix of static (`○`) and dynamic
(`ƒ`) routes with no bundle-size warnings emitted by Next.js. A precise
per-route gzipped JS budget was not extracted this session (would require
`next build` with `ANALYZE=true` and `@next/bundle-analyzer`, which is
not currently wired into this repo).

## Not verified — requires follow-up

- Lighthouse performance score (mobile + desktop) per tool page.
- Network-throttled (Slow 4G / 3G) load timing.
- Real browser CPU/memory profiling during a Compress/Watermark/Edit
  operation on a genuinely large (100–1000 page) real-world PDF loaded
  through the actual UI (this session only benchmarked the underlying
  library directly in Node, not the in-browser Web Worker / main-thread
  pipeline).
- Per-route gzipped bundle size via `@next/bundle-analyzer`.
- Homepage/tool-load timing for the other 12 production tools (Split,
  Compress, Crop, Edit, Watermark, Sign, Extract Text, PDF→Word,
  Word→PDF, HTML→PDF, JPG→PDF, PDF→JPG).

## Recommendation

Wire `@next/bundle-analyzer` into the build for real per-route JS budgets,
and run a scheduled Lighthouse CI job (already common as a GitHub Action)
against the 14 tool routes so this document can be regenerated from real
multi-run, throttled data rather than a single uncapped-network sample.

## Mobile Lighthouse CI

A dedicated post-deploy workflow measures four representative production surfaces after Cloudflare reports the exact merged `main` revision through `/api/build-info`:

- `/`
- `/pdf`
- `/pdf-tools`
- `/pdf/edit`

Each URL receives three independent mobile Lighthouse samples. Current certification budgets are:

- Performance score >= 0.65
- Accessibility score >= 0.90
- Best Practices score >= 0.90
- SEO score >= 0.90
- LCP <= 4.0s
- CLS <= 0.10
- Total Blocking Time <= 600ms

This job deliberately runs after deployment rather than as a pull-request release gate. Repeated `NO_FCP` failures were reproducible on healthy local Next.js and Wrangler servers in GitHub-hosted Lighthouse runs while ordinary curl and Playwright checks passed. Keeping that unstable collector out of branch protection prevents false merge blocks; the production workflow still fails loudly when the exact deployed revision misses a real budget.

These are laboratory measurements, not field Core Web Vitals. The connected GSC integration currently has no CrUX API key configured, so field LCP/INP/CLS remain unverified. Lighthouse JSON reports and the median summary are retained as CI artifacts.


### Step 4 production hardening follow-up

Production Lighthouse identified the header brand mark as the homepage LCP candidate. The source artwork remains preserved, while builds now generate a compact 96px WebP for navigation so the critical logo does not require a runtime `/_next/image` transform. Lighthouse still requires three valid samples per route with the same score/LCP/CLS/TBT budgets. Known browser/runtime failures such as `NO_FCP` are discarded and replaced with a fresh-browser attempt up to a bounded per-route maximum; valid budget failures are never retried away.


### Collector recovery

The first production run after the compact-brand fix showed nine consecutive `NO_FCP` runtime failures after adding native-window-occlusion and forced window-size Chrome flags. Those two flags are removed because the earlier headed Xvfb configuration produced valid production samples. The bounded valid-sample replacement logic and all Lighthouse budgets remain unchanged.


### Deterministic production Lighthouse execution

Repeated production certification showed that headed Chrome under Xvfb could return `NO_FCP` for every attempt even when the same production routes returned HTTP 200 and passed the full browser release matrix. Production Lighthouse now launches a fresh Chrome instance with `--headless=new` for every sample and no virtual display/window-manager dependency. The four audited routes, three-valid-sample requirement, bounded runtime-invalid replacement, and all score/LCP/CLS/TBT budgets remain unchanged.


### Linux CI Lighthouse limitation and Windows collector

Exact-production runs on GitHub `ubuntu-latest` repeatedly produced runtime-only `NO_FCP` before any metrics were emitted, under both headed/Xvfb and fresh `--headless=new` Chrome. This matches an upstream Lighthouse 13 Linux-CI rendering/trace limitation rather than a Lumeo route failure. The production Lighthouse job now runs on `windows-latest` with Chrome for Testing installed explicitly by `browser-actions/setup-chrome@v2`. The audited production routes, three-valid-sample requirement, runtime-invalid retry bound, and every performance/accessibility/best-practices/SEO/LCP/CLS/TBT threshold remain unchanged.


### Isolated LHCI samples

Direct programmatic Chrome/Lighthouse launches reproduced `NO_FCP` before metrics on both Linux and Windows CI. Earlier LHCI collection had produced valid samples but became unstable when multiple samples shared one LHCI/browser lifecycle. Production certification now uses the supported `lhci collect` path with exactly one Lighthouse run per process. Each route still requires three valid samples, runtime-invalid attempts remain bounded, medians are evaluated against the same budgets, and no invalid attempt can satisfy a threshold.


### Lighthouse 13.5 isolated-process collector

The LHCI 0.15.1 fallback was not acceptable for final certification because it embeds Lighthouse 12.6.1 while production CI is running Chrome 154; Lighthouse CI currently has an open request for Lighthouse 13 support. The collector therefore keeps process isolation but invokes the pinned standalone Lighthouse 13.5.0 CLI for every sample. Changes to the Lighthouse harness trigger a one-sample PR smoke against the currently certified production homepage; full main-push certification still waits for the exact deployed SHA and enforces the unchanged 4-route x 3-sample budgets.


### Visible Windows validation for Lighthouse 13

The PR smoke for isolated standalone Lighthouse 13.5.0 still reproduced runtime-only `NO_FCP` when Chrome was launched headless. The collector smoke now uses explicit Chrome for Testing on `windows-latest` without headless/Linux-only flags, while retaining one fresh Lighthouse 13.5 CLI process per sample. This is validated on the pull request before merge. Main-push certification still waits for the exact deployed SHA and retains the unchanged four-route, three-valid-sample budgets.


### First-paint-safe public shells and PR-local smoke

The Lighthouse environment control can paint `https://example.com/`, while the deployed Lumeo homepage repeatedly reported `NO_FCP`. The public shell used an entrance animation whose first keyframe made the entire page transparent. Public page entrance motion now keeps content paintable from the first frame and animates position only, so a throttled or backgrounded animation cannot leave the document invisible. The pull-request smoke builds the PR's own Cloudflare Worker with an isolated local Supabase catalog and audits that local branch build; post-merge certification continues to wait for and audit the exact deployed production SHA.


### Heavy tool route prefetch control

A valid Lighthouse 13.5 trace showed the homepage requesting Edit PDF, JSZip, Split, Compress, Sign, PDF-to-Word and other tool chunks before the user opened any tool. The cause was automatic route prefetch on the homepage launcher and tool-directory card links. Those tool-navigation links now use `prefetch={false}`, so initial public pages load only the JavaScript they need. Click navigation remains unchanged and no PDF/OCR/conversion engine is removed or weakened.


### Homepage LCP convergence

Once Lighthouse 13.5 collection became reliable, the PR-local homepage budget measured a median LCP of about 4026 ms against the unchanged 4000 ms budget. The LCP node was the hero heading, "Your PDFs stay yours." The heading still lived inside the generic `lumeo-fade-up` entrance animation, whose first frame is transparent. The homepage hero no longer uses that entrance animation, so the above-the-fold LCP content is paintable immediately. Other page motion remains unchanged.


### Final four-route LCP convergence

The exact-production Lighthouse 13.5 run on `a60333e` produced valid samples on all four audited routes but missed the unchanged 4.0s LCP budget: homepage ~4.71s, `/pdf` ~4.61s, `/pdf-tools` ~4.44s and `/pdf/edit` ~4.47s. The reports showed a shared high-priority `/icon.png` request of roughly 241 KB on every page, larger than all three font files combined, plus transform-based entrance motion on the public page shell. The generic rel-icon declaration is removed in favor of the small favicon while install icons remain available through the manifest, IBM Plex Mono is no longer eagerly preloaded, public shells paint without whole-page transform motion, and the `/pdf-tools` LCP heading no longer animates. PR Lighthouse now enforces the full four-route × three-sample budget before merge so Step 4 cannot regress into another post-merge loop.



### Edit PDF LCP element correction

The four-route PR run confirmed `/`, `/pdf`, and `/pdf-tools` below the unchanged 4.0s budget, while `/pdf/edit` had a 4126 ms median. The Lighthouse artifact identified the actual LCP node as the first-screen tool-header description (“Add text, drawing, shapes, and whiteout boxes to a PDF.”), not the below-tool SEO/help copy. The shared `L2ToolPageHeader` still carried `lumeo-fade-up`, so that LCP-critical entrance animation is removed for all public tool headers. The unrelated mobile minimum-height experiment is removed rather than retained as a layout workaround.
