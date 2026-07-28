# Page Numbers — Engineering Specification (pre-development, for review)

Status: **SPEC ONLY — no production code written.** Catalog already has a
stub entry (`lib/tools/catalog.ts`: `{ label: "Page numbers", slug: "page-numbers", live: false }`).

Route: `/pdf/page-numbers` (new `app/pdf/page-numbers/page.tsx`, same
route-shell pattern as every other tool page).

---

## 1. Problem statement

User uploads a PDF and stamps a page-number string (e.g. "3", "Page 3",
"3 of 12", "3/12") into a chosen corner/position of every page (or a
chosen range), with control over starting number, format, font, size,
color, and position. Exported PDF is a new file; original untouched.

## 2. Relationship to Watermark PDF

Page Numbers is **architecturally a specialization of Watermark PDF**,
not a new pattern: it is a text watermark whose text is generated
per-page (`"3"`, `"4"`, ... ) instead of one fixed string, with corner
placement being the *primary* mode (not one option among several — a
page number in the center of the page is not a realistic use case) and
tiling/image-content dropped (not applicable to page numbers).

**This is the central design question for review**: should Page Numbers
be built as its own small module reusing Watermark's `cornerAnchorPct`
and export loop, or should Watermark's `WatermarkConfig` be extended
with a `content.kind: "page-number"` variant? Recommendation below.

### 2.1 Recommendation: separate module, shared math, not a shared config type

Extending `WatermarkConfig.content` with a `"page-number"` kind would
couple two independently-shipped, independently-frozen features (per
`docs/specs/watermark-pdf-v1-freeze.md`, Watermark is frozen and should
only change for bugs/security/perf/a11y/explicit v1.1 asks — adding a
new content kind is exactly the kind of change that freeze exists to
prevent). Instead:

- `lib/pdf/pageNumbers/config.ts` — new, small, pure module. Imports
  **nothing** from `lib/pdf/watermark/` (freeze boundary respected).
- `lib/pdf/pageNumbers/export.ts` — duplicates `cornerAnchorPct` verbatim
  from `lib/pdf/watermark/config.ts` (same "same math, independently
  copied for module-loading constraints" pattern Watermark's own
  `export.ts` already uses for its *own* copy — this is now a
  three-times-duplicated function: `lib/pdf/watermark/config.ts`,
  `lib/pdf/watermark/export.ts`, and now here. That is an accepted,
  intentional cost of the freeze boundary, not an oversight — do not
  "clean this up" by creating a shared import between two independently-
  frozen tools without going through both tools' change-control language
  first.)

This is the only place in this document where "don't duplicate" gives
way to a stronger rule: **don't couple two independently-frozen
features's release cycles together for the sake of DRY.**

## 3. UX

### 3.1 Flow
1. Upload (identical validation chain to every other tool).
2. Preview with a live page-number stamp shown in the selected position
   on the currently-displayed page (same "preview approximates, export
   is the real math" relationship Watermark's `estimateContentSizePct`
   vs. `export.ts`'s real font metrics already established — Page
   Numbers should reuse that *pattern*, not the same estimate function,
   since page numbers are short numeric strings with much more
   predictable width than arbitrary user text).
3. Position: 5 corner presets, reusing `cornerAnchorPct` semantics
   exactly (center is legal but not the default; default position:
   bottom-center — see §3.2, a new alignment this tool needs that
   Watermark's corner set doesn't have).
4. Format string with token substitution: `{n}` (current number),
   `{total}` (total page count), free text around them — e.g.
   `"Page {n} of {total}"`, `"{n}"`, `"- {n} -"`. Live-previewed with
   real numbers for the current page, not a placeholder.
5. Starting number (default 1) and optional "skip first page" (common
   real-world need: don't number a cover page, but still count it in
   `{total}` and in the sequence so page 2 shows "1" or "2" per a
   "count from cover" toggle — **flag as a genuine product decision for
   you to make, not an engineering one**: does skipping the cover page's
   *visible* number also skip it in the *count*? Both conventions exist
   in real documents; needs your call before implementation, not an
   assumed default).
6. Font size, color, bold/italic — same controls as Watermark's text
   mode, same components.
7. Page range — reuse `WatermarkPageRange`-shaped type (`all`/`custom`
   most relevant here; `odd`/`even` numbering is a real, if less common,
   print convention worth keeping for parity).
8. Export, download — same lifecycle as every other tool.

### 3.2 New alignment needs beyond Watermark's 5 corners

Page numbers conventionally sit **bottom-center** or **top-center**, not
just the 4 corners + true-center Watermark supports. This spec proposes
extending the corner-preset concept to a **9-position grid** (top/middle/
bottom × left/center/right) for this tool specifically, implemented as:

```ts
// lib/pdf/pageNumbers/config.ts (draft)
export type PageNumberPosition =
  | "top-left" | "top-center" | "top-right"
  | "bottom-left" | "bottom-center" | "bottom-right";
  // no "middle-*" row -- a page number vertically centered on the page
  // has no real-world use case and would just be confusing; only the
  // Watermark-parity corners plus the two new "-center" positions along
  // the top/bottom edges are in scope.
```

`cornerAnchorPct`'s `xAlign`/`yAlign` internal split (already
`"start" | "end" | "center"` per axis, per `lib/pdf/watermark/config.ts`)
already supports `xAlign: "center"` independent of `yAlign` — the
existing function's *shape* already accommodates this, it just isn't
exposed as a `WatermarkPlacementCorner` value. The duplicated copy in
this new module should expose the two extra positions as first-class
`PageNumberPosition` values mapping to `xAlign: "center"` combined with
`yAlign: "start" | "end"` — a small, mechanical extension of already-
proven, already-tested logic.

## 4. Browser-first architecture

```
components/pdf/PageNumbersTool.tsx           <- state owner
components/pdf/pageNumbers/PageNumberPreview.tsx   <- read-only preview (NO drag -- see §5)
lib/pdf/pageNumbers/config.ts                <- pure config + position math
lib/pdf/pageNumbers/export.ts                <- pdf-lib export pipeline
app/pdf/page-numbers/page.tsx                <- route shell
```

## 5. Why no manual-drag mode (a deliberate, smaller surface than Watermark)

Watermark supports free manual placement because a watermark can
legitimately go anywhere. A page number has a small, closed set of
conventional positions; supporting free-drag would let users produce
page numbers that don't look like page numbers (e.g. dead center) for no
real benefit, and would reintroduce Watermark's `WatermarkSinglePlacement`
manual/corner duality (and its associated per-page-reuse hazard from
§ of the Watermark spec) for a feature where it buys nothing. **v1 scope
deliberately omits drag placement** — position is a preset-only choice.
This also means `PageNumberPreview.tsx` needs no pointer-drag code at
all, a meaningfully smaller component than `WatermarkPreview.tsx`.

## 6. Reusable utilities identified (already exist, use as-is)

Same table as the Crop PDF spec's §3.2, with these substitutions/
additions:

| Utility | File | Reused for |
|---|---|---|
| `openPdfJsDocument`, `isPdfNamedFile`, `checkPdfFileSize`, `hasPdfMagicBytes`, `checkPdfPageCount`, `copyArrayBuffer`, `sanitizeFileStem`, `formatBytes`, `useHistoryState` | (as in Crop spec) | identical reuse, no changes |
| `embedTextFonts`/`pickFont`-equivalent pattern (Helvetica/Bold/Oblique/BoldOblique via `StandardFonts`) | pattern from `lib/pdf/watermark/export.ts` (re-implemented independently per §2.1, not imported) | font embedding — page numbers only ever need text, never image, so this tool needs *less* of Watermark's font logic (no `standardFontFor`-for-a-UI-measurement-helper equivalent needed, since `{n}`/`{total}` substitution makes real-time width measurement cheap and exact using `font.widthOfTextAtSize` directly, no estimate needed even for the live preview) |
| `hexToRgb01` pattern | reimplemented independently (three lines, not worth a shared-module argument across the freeze boundary) | color |
| `resolvePageIndices`-equivalent | reimplemented independently for `PageNumberPageRange` | page-range resolution |
| `cornerAnchorPct` (duplicated per §2.1) | | position math, extended per §3.2 |

## 7. Reusable PDF transformation pipeline

Same shape as `exportWatermarkedPdf`: load once via `PDFDocument.load`,
loop `doc.getPages()` for the resolved range, per-page `try/catch` with
`skippedPages` collection, `page.drawText(...)` with a `rotate` composed
from the page's own `/Rotate` (via the page's own copy of
`composeRotationDegrees`/`toNativePoint`, same duplication rule as §2.1
applies to `pageCoordinates.ts` too — this module gets its own verbatim
copy, does not import Watermark's or Edit's).

The one genuinely new piece of pipeline logic: **the per-page number
string must be computed inside the loop**, not once — `"{n}"` resolves
differently for every page. This is a natural fit for the existing
per-page loop shape (no new architecture needed, just one extra line
per iteration: `const n = startingNumber + sequenceIndex` where
`sequenceIndex` accounts for the skip-first-page toggle from §3.1 item 5).

```ts
// lib/pdf/pageNumbers/export.ts (draft signature, for review)
export async function exportNumberedPdf(
  originalBytes: ArrayBuffer,
  config: PageNumberConfig,
): Promise<{ bytes: Uint8Array; skippedPages: number[] }>
```

## 8. Test strategy

- `tests/page-numbers-config.test.ts` — format-string substitution
  (`{n}`/`{total}` in various combinations, literal-brace edge cases if
  any are allowed, e.g. escaping), position math (reuse the exact
  rotation-sweep test pattern from `tests/watermark-config.test.ts`),
  skip-first-page sequencing logic (unit-testable in isolation, no PDF
  needed — pure arithmetic over an index and a boolean flag).
- `tests/page-numbers-export.test.ts` — real export, real decode, same
  "read back the actual `Tj` text bytes and the actual `Tm` matrix from
  the saved PDF" discipline as `tests/watermark-export.test.ts`. Must
  include: multi-page doc asserting each page's stamped number is
  correct and sequential; mixed-page-size doc with a corner position,
  verifying the same page-local correctness guarantee Crop and Watermark
  both require (this tool has the identical hazard class since it also
  uses corner-anchor math per page); custom/odd/even range tests
  confirming un-selected pages get no stamp and selected pages get the
  *correct* number for their position in the original document (not
  their position within the filtered subset — a real, easy-to-get-wrong
  edge case: page 5 of 10, selected via "odd", must show "5", not "3"
  [its index within the odd subset]).
- Live-browser verification before release, same discipline as
  Watermark/Crop.

## 9. Accessibility requirements

- Position-preset buttons: `aria-label`, `tabIndex=0`, **and
  `aria-pressed`** from day one (same instruction as the Crop spec —
  don't repeat Watermark's known gap in a new tool).
- Format-string input needs a visible, associated `<label>` plus a short
  inline example/hint (e.g. "Use {n} for page number, {total} for total
  pages") — this is a genuinely new input shape Watermark never needed
  (Watermark's text input is literal, no token syntax), so it needs its
  own accessible-hint treatment, not just a copy of Watermark's text
  field.
- No drag interaction (per §5) means this tool has an inherently smaller
  a11y surface than Watermark or Crop — no keyboard-drag-equivalent
  problem to solve at all.

## 10. Performance targets

Same as Watermark: sub-1-2s export for typical documents. Page Numbers
should be *faster* than Watermark in the worst case (500-page document)
since it embeds one small set of standard fonts once (no image
decode/embed path exists at all) and does less per-page work (one short
string vs. arbitrary user text/image). No new performance risk
identified; if the 500-page case proves slow in practice, the standard-
font embedding (`doc.embedFont(StandardFonts.X)`) should be hoisted
outside the per-page loop exactly as `embedTextFonts` already does in
`lib/pdf/watermark/export.ts` — verify this is actually done during
implementation, it's an easy thing to accidentally re-embed per iteration.

## 11. Edge cases

- `{total}` with a `scope: "custom"` selection — must show the
  **document's real total page count**, not the count of selected pages
  (a real, plausible bug class: "3 of 12" on a 12-page document where
  only 5 pages were selected should still say "of 12", not "of 5").
  Needs an explicit test (§8).
- Format string with no `{n}` token at all (e.g. static text like
  "CONFIDENTIAL" with no number) — degrades to a plain repeated-text
  stamp; should work, not error, since it's a legal (if unusual) input.
- Format string that would produce identical text on every page (no
  token used) — not an error case, just means the user built a
  watermark-shaped page-numbers config; allowed, not blocked.
- Starting number that would make some page's number negative or absurd
  (e.g. starting number `-5` on page 1) — should this be rejected client-
  side or allowed (some print shops legitimately want negative/roman-
  numeral front matter)? **Flag as a product decision, not assumed** —
  recommend allowing any integer (including negative) and treating
  format purely as string interpolation, simplest and most flexible,
  but confirm before implementation.
- Mixed page sizes/orientations with a corner position and `scope: "all"`
  — identical hazard class to Watermark's v1.0.0 bug and Crop's §5;
  must be solved the same way from day one (position computed fresh
  per page from that page's own real dimensions, never precomputed
  once), with the identical style of regression test.
- Roman numerals / letter sequences (`i, ii, iii` or `a, b, c`) instead
  of arabic numerals — common real-world need for front-matter pages,
  **not in this spec's v1 scope**, flag explicitly as a candidate v1.1
  enhancement request rather than silently omitting it without mention.

## 12. Implementation roadmap

1. `lib/pdf/pageNumbers/config.ts` + `tests/page-numbers-config.test.ts`
   (format-string substitution, position math, sequencing) — pure logic
   first, no UI, same TDD discipline as Watermark/Crop.
2. `lib/pdf/pageNumbers/export.ts` + `tests/page-numbers-export.test.ts`,
   including the mixed-page-size and custom-range-`{total}` regression
   tests from §11 written before any UI exists.
3. `components/pdf/pageNumbers/PageNumberPreview.tsx` (read-only, no
   drag — smallest new component of the three planned tools).
4. `components/pdf/PageNumbersTool.tsx` (state owner).
5. `app/pdf/page-numbers/page.tsx` route + catalog flip
   (`page-numbers.live` → `true`) + Supabase seed migration.
6. Accessibility pass per §9 (built in from step 3).
7. Full manual + automated verification pass before flipping `live: true`.
8. Product decisions needed **before step 1 starts** (blocking, not
   engineering): skip-first-page counting convention (§3.1.5), negative/
   unusual starting numbers (§11), whether roman-numeral/letter sequences
   should actually be in v1 despite the recommendation above.
9. Freeze, tag `page-numbers-v1.0.0`, same closing ritual as Watermark.

Estimated complexity: **smallest of the three planned tools** — no
drag/resize UI at all, reuses proven corner-anchor math almost verbatim,
its only genuinely new logic is string-token substitution and page-
sequence arithmetic, both pure and trivially unit-testable.

---

## Cross-cutting note for both specs

Both Crop PDF and Page Numbers depend on `toNativeBox`/`toNativePoint`/
`composeRotationDegrees` (`lib/pdf/pageCoordinates.ts`) or a duplicated
copy of the same math. This is now the **third and fourth** consumer of
this exact rotation-composition logic (Edit PDF, Watermark PDF, and now
two more). If a fifth PDF-placement tool is ever planned after these
two, that is the point to seriously reconsider the "duplicate for
module-loading reasons" rule project-wide — e.g. a build-time codegen
step that copies the canonical `pageCoordinates.ts` into each tool's
`export.ts` automatically, rather than a human copying it by hand each
time. Not proposed for implementation now (two more duplicates is still
manageable by hand, per the existing precedent), but flagged here so the
next engineer planning tool #3 in this family sees the pattern coming.
