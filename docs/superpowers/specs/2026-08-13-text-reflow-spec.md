# Context-Aware Multi-Line Text Reflow — Design Spec

**Date:** 2026-08-13
**Status:** Draft, not yet implemented
**Target:** `lib/pdf/edit/multiRunEditPlan.ts`, `lib/pdf/edit/applyEditPlan.ts`, `lib/pdf/edit/fontMetrics.ts`

---

## 1. What multi-line editing does today

Selecting several lines and replacing them does **not** reflow. `buildMultiRunEditPlan` puts the entire replacement string into the first operator and empties every other one:

```ts
replacementText: position === 0 ? replacementText : ""   // multiRunEditPlan.ts:151
```

So three selected lines become one long line at line 1's position, and lines 2–3 vanish. Nothing measures whether that line still fits the column it came from — replacement text wider than the original simply runs past it, over whatever is to the right.

The existing width machinery only ever compensates *horizontally within one line*: `compareAdvance` produces a single trailing `TJ` adjustment so following text on that line doesn't shift. There is no concept of "too wide, break here."

Current constraints, all enforced and all inherited by any reflow work: one content stream, consecutive operator indices, a single shared font resource, and no Form XObjects.

## 2. Why this is the hardest item in the backlog

**A PDF has no paragraphs.** There is no container, no wrap width, no line-break rule — only a sequence of text-showing operators, each positioned by its own `Tm`/`Td`. "These five operators are one paragraph" is an inference, not something the file states. Reflow means *deciding* line breaks the document never encoded, then *repositioning* every line.

Three sub-problems, in increasing difficulty:

1. **Measure a column width.** What width should text wrap to? Derivable from the selected runs' own geometry: the widest run's right edge minus the leftmost left edge. Honest and local; no page-layout analysis required.
2. **Derive leading.** Line spacing must come from the original runs' baseline deltas, not a guessed multiple of font size. Available today — consecutive runs' `yPct` differences give it directly.
3. **Write lines back.** This is the blocker (§3).

## 3. The blocking constraint: the engine cannot insert

`applyEditPlanToBytes` replaces exactly one operator's byte range with new bytes. Every edit so far is a **substitution** — same number of operators in, same number out. Reflow breaks that assumption in one direction:

| Reflowed line count | Feasible today? |
|---|---|
| Fewer than original | **Yes** — blank the surplus operators, exactly what multi-run already does |
| Same as original | **Yes** — rewrite each operator's string, adjust each `Tm` |
| **More than original** | **No** — needs a new operator with its own positioning, inserted into the stream |

Adding a line means emitting new content-stream bytes that no existing operator's range covers — a genuinely new capability, and the one that carries real corruption risk if it lands inside the wrong `BT`/`ET` or `q`/`Q` nesting.

## 4. Proposed scope

**Phase 1 — reflow within the original line budget.** Wrap to the measured column width, emit at most as many lines as were selected, reposition each via its own operator. If the text needs more lines than are available, reject with a specific reason (the honest failure this codebase already prefers) rather than overflowing or silently shrinking the font.

This is genuinely useful on its own: shortening or moderately rewording a paragraph is the common case, and it is pure substitution — no new engine capability, no insertion risk.

**Phase 2 — line insertion.** Only worth designing once Phase 1 is proven, and it should be specified separately.

**Non-goals:** hyphenation, justification, bidi/RTL, vertical writing modes, and reflowing text that wraps around a figure. Each is a large problem, and none is implied by "the replacement text is longer than the original."

## 5. Why not just use Restyle

Restyle (shipped, PR #237) already gives reflow for free: it covers the run with a whiteout and drops a real text box that wraps natively. Any reflow work must justify itself against that, because Restyle is strictly simpler.

The difference is what ends up in the file. Restyle leaves the original glyphs underneath the whiteout — invisible but present, and still extractable. Native reflow rewrites the actual operators, so the output contains only the new text: searchable, selectable, with nothing hidden beneath it. That matters for documents that get parsed downstream, and for anyone who assumes a redaction-adjacent edit removed something.

If that distinction turns out not to matter for real users, **this feature should not be built** — Restyle already covers the need, and this spec should be closed rather than implemented.

## 6. Building blocks that already exist

- `fontMetrics.stringAdvancePt` — measures a candidate line exactly, in the run's real font, including `Tc`/`Tw`/`Th`. This is the whole measurement primitive; greedy wrapping is a loop over it.
- `compareAdvanceAcrossFonts` — already handles two-font measurement, needed if a reflowed paragraph also triggers the substitute-font path (#239).
- `multiRunEditPlan`'s span validation — same font, consecutive, one stream. Reusable unchanged.
- Detected runs now carry `fontSizePt` in point space (#240 step 2), so column width and leading are computable without reference to any raster scale.

## 7. Test plan

**Unit:** greedy wrap against known AFM widths produces expected break points; a paragraph that fits in fewer lines blanks the surplus; a paragraph needing more lines than available is rejected with a reason, never truncated; leading derived from baseline deltas matches the original spacing.

**Round-trip:** rewrite a 3-line paragraph to 2 lines, reload with pdfjs, assert the extracted text and that the third line is gone; assert no operator outside the span moved.

**Real-Chrome:** per the standing rule, since line positions are only observable when rendered.

## 8. Open questions

- **Column width from geometry alone** is a heuristic. A centered or right-aligned paragraph would reflow left-aligned unless alignment is inferred from the runs' left/right edge consistency. Worth deciding before implementation — possibly reject non-left-aligned spans in Phase 1.
- Should a reflowed paragraph that no longer fills its last line adjust following paragraphs? **Recommend no** — that is document-wide layout, far past this scope.
