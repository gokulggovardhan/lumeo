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
