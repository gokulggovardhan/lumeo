# Watermark PDF v1.1 — Manual Position Mode

Status: DRAFT for review. No production code written yet.
Scope: additive enhancement to the frozen Watermark PDF v1.0.0 feature, under the
explicit v1.1-enhancement exception in `docs/specs/watermark-pdf-v1-freeze.md`.
Preset positions (corner + tiled) are unchanged in behavior and code path.

## 1. What already exists (don't rebuild this)

`lib/pdf/watermark/config.ts` already has a discriminated union for single
placement:

```ts
export type WatermarkSinglePlacement =
  | { mode: "corner"; corner: WatermarkPlacementCorner }
  | { mode: "manual"; xPct: number; yPct: number };
```

`"manual"` already stores a raw, page-relative, **percent-of-visual-page**
position (not screen pixels, not raw PDF points) and is already dragged in
`components/pdf/watermark/WatermarkPreview.tsx` and drawn per-page in
`lib/pdf/watermark/export.ts`. So "Preset Position / Manual Position" as two
top-level modes is **not a new concept** — it is `placement.mode === "corner"`
vs. `placement.mode === "manual"`, already wired end-to-end. What's missing is
everything *around* manual mode: numeric inputs, anchors, alignment, snapping,
overflow toggle, rotation-around-center, keyboard, and per-page behavior.

## 2. Coordinate system decision (req. 4) — percent, not raw points

The request says "store coordinates in PDF page space, never screen pixels,"
intending zoom-independence. Two candidates satisfy that:

- **Raw PDF points**, absolute per-document.
- **Percent of each page's own visual size** (current approach).

Raw points is the literal reading, but it reintroduces exactly the bug class
Watermark v1.0.0 shipped to fix: an absolute coordinate computed against one
page's size is wrong the instant it's reused against a differently-sized or
differently-rotated page in the same document (`docs/specs/watermark-pdf-v1-freeze.md`).
Req. 13 ("apply manual position to all pages") makes this a live case, not a
hypothetical.

**Decision: keep storage as percent-of-visual-page.** It is already
zoom-independent (a CSS `%` doesn't care about on-screen zoom) and it is
*also* page-size-independent, which raw points are not. The numeric X/Y
inputs the user asked for are still delivered — displayed in PDF points,
computed on the fly as `(pct / 100) * currentPageVisualSizePt`, converting
back to percent on edit. This satisfies the user-visible requirement
("X Position [120.0]") without regressing the freeze's core lesson.

## 3. Anchor system (req. 7) — display-only, not new storage

Persisted position stays exactly what it is today: the box's **top-left**
corner, in percent (matches how `export.ts` already draws text/images). The
9-point anchor (`WatermarkAnchor`) is a **UI convenience**, not a new source
of truth:

```ts
export type WatermarkAnchor =
  | "top-left" | "top-center" | "top-right"
  | "center-left" | "center" | "center-right"
  | "bottom-left" | "bottom-center" | "bottom-right";
```

- The numeric X/Y fields and the drag handle represent whichever anchor point
  is currently selected, translated to/from the stored top-left using the
  content's known `widthPct`/`heightPct` (already computed today from font
  metrics / image aspect ratio, same values `export.ts` derives).
- Changing the anchor recomputes what the X/Y fields *display*; it does not
  move the box (req. "changing anchor must preserve visual placement" is
  satisfied by construction — the stored top-left never changes on an anchor
  switch, only the read/write projection does).
- Anchor selection is stored on the config (`manualAnchor: WatermarkAnchor`,
  sibling to `placement`, default `"top-left"`) purely so the UI reopens with
  the same numeric-field semantics after undo/reload — it has zero effect on
  export.

## 4. Data model changes (`lib/pdf/watermark/config.ts`)

```ts
export type WatermarkAnchor = /* as above */;

export type WatermarkSinglePlacement =
  | { mode: "corner"; corner: WatermarkPlacementCorner }
  | {
      mode: "manual";
      xPct: number;       // top-left, percent of visual page — unchanged meaning
      yPct: number;
      allowOverflow: boolean; // req. 9, default false
    };

export type WatermarkConfig = {
  // ...unchanged fields...
  manualAnchor: WatermarkAnchor; // UI projection only, default "top-left"
};
```

No change to `WatermarkPlacementCorner`, `placementMode`, tiling, page range,
opacity, rotation, scale, color, font — every existing field and preset path
is untouched. `createDefaultTextWatermarkConfig`/`createDefaultImageWatermarkConfig`
gain `manualAnchor: "top-left"`; existing saved/undo configs missing the field
default to `"top-left"` at the read site (no migration needed, it's optional
with a fallback).

## 5. Clamping / overflow (req. 9)

New pure function in `config.ts`, mirroring `clampCropRect` from the Crop
feature:

```ts
export function clampManualPosition(
  xPct: number, yPct: number,
  widthPct: number, heightPct: number,
  allowOverflow: boolean,
): { xPct: number; yPct: number } {
  if (allowOverflow) {
    // still finite-bounded so a fat-fingered value can't blow up the export;
    // generous enough that "mostly off-page" watermarks are possible.
    return { xPct: clamp(xPct, -100, 200 - widthPct), yPct: clamp(yPct, -100, 200 - heightPct) };
  }
  return { xPct: clamp(xPct, 0, 100 - widthPct), yPct: clamp(yPct, 0, 100 - heightPct) };
}
```

Applied on every commit path: drag end, numeric input change, keyboard move,
alignment button, anchor switch. `allowOverflow` toggle lives next to the
manual-position controls, off by default per spec.

## 6. Alignment helpers (req. 6)

Pure functions alongside `cornerAnchorPct`, operating on top-left percent
directly (no rotation algebra needed here — these are axis-aligned page
placements, not corner+margin+rotation composites):

```ts
alignLeft(widthPct)              -> xPct = 0
alignRight(widthPct)             -> xPct = 100 - widthPct
alignTop(heightPct)               -> yPct = 0
alignBottom(heightPct)            -> yPct = 100 - heightPct
centerHorizontally(widthPct)      -> xPct = (100 - widthPct) / 2
centerMiddleVertically(heightPct) -> yPct = (100 - heightPct) / 2
resetManualPosition()              -> center-center, same as "center" corner's default position
```

Each is a one-shot commit (like a drag-end), not a live constraint — pressing
"Align Left" again after manually nudging just re-aligns once, it doesn't
lock the edge.

## 7. Rotation around center (req. 10) — the one real export.ts change

**Current behavior (must not regress for corner mode):** `cornerAnchorPct`'s
`"center"` branch already computes a native anchor such that the box is
centered *on the page*, accounting for rotation, by rotating the box's local
corners and solving for the anchor point. This is exactly the primitive
manual mode needs, generalized to an arbitrary center point instead of always
"page center."

**Extract and generalize** (in both `config.ts` and its `export.ts`
duplicate, same duplication pattern already used for every other coordinate
helper there):

```ts
// Returns the native-space draw anchor (pdf-lib's x,y) such that a box of
// (widthPt, heightPt), rotated by rotationDeg around its own center, has
// that center land exactly at (centerXPt, centerYPt) in native space.
function nativeAnchorForCenter(
  centerXPt: number, centerYPt: number,
  widthPt: number, heightPt: number,
  rotationDeg: number,
): { x: number; y: number }
```

`cornerAnchorPct`'s `"center"` alignment becomes a thin call to this with
`centerXPt = pageWidthPt/2, centerYPt = pageHeightPt/2` (behavior-identical,
verified by re-running the existing 450-combination corner sweep — zero
change expected). Manual mode's draw call in `export.ts` computes the box's
fixed visual center from the stored top-left (`xPct + widthPct/2`, same for
Y), converts that single point to native space via the existing
`toNativePoint`, then calls `nativeAnchorForCenter` with the watermark's own
`rotationDeg`. Result: turning the rotation knob spins the watermark in place
around its own center; the stored `xPct/yPct` — and therefore the numeric
X/Y fields and the drag handle position — never move.

This is the highest-risk piece of the whole feature (rotation + anchor
algebra is exactly where Watermark v1.0.0's original bug and a near-miss
during its fix both lived). Test plan below requires dedicated content-stream
decode verification for this, not just percent-math assertions.

## 8. Snap guides (req. 8)

Interaction-only, no data model impact. While dragging in the preview
(`WatermarkPreview.tsx`'s pointer-move handler, same live-DOM-write pattern
already used there and in Crop's `CropRectView.tsx`):

- Compute the box's live center (`xPct + widthPct/2`, `yPct + heightPct/2`)
  and edges against page center (50%) and page edges (0%, 100%).
- `SNAP_TOLERANCE_PCT = 1.5` (page-relative, so it scales correctly at any
  preview zoom/render size — no magic pixel constant).
- Within tolerance, clamp the live value to the snapped value and render a
  guideline (`<div>` absolutely positioned at 50%/0%/100%, shown only while
  dragging and only for the axis currently within tolerance).
- Snapping only affects the live drag value, never the numeric inputs (typing
  120.0 exactly should never silently jump to a snapped value the user didn't
  ask for).

## 9. Keyboard (req. 5) — reuse Crop's pattern verbatim

`CropRectView.tsx` already has exactly this: focusable body, `ArrowKeys` move
by `MOVE_STEP_PCT`, `Shift+Arrow` by `MOVE_STEP_LARGE_PCT`, `aria-live`
announcement of the resulting position. Same pattern applied to the
watermark's manual-mode anchor node in `WatermarkPreview.tsx`. Step sizes:
`1%` / `5%` of page (matches Crop's constants, keeps the two tools
consistent for users who use both).

## 10. Multi-page behavior (req. 13) — OPEN QUESTION, needs your call before build

Three of the four asks are already free:

- **"Apply manual position to all pages"** — already how it works today:
  `pageRange` picks which pages get watermarked, and the single stored
  percent position is evaluated fresh per page (page-local, not
  precomputed — same fix Watermark v1.0.0 already has). No new code.
- **"Copy current position to all pages"** — a no-op/non-question under a
  single uniform position: there is nothing to copy, one value already
  applies everywhere.

But **"Move current page independently"** requires genuinely new storage —
a per-page override map:

```ts
{ mode: "manual"; xPct; yPct; allowOverflow; perPage?: Record<number, { xPct: number; yPct: number }> }
```

with `export.ts` checking `perPage[pageIndex] ?? { xPct, yPct }`, and the UI
needing a way to show/clear "this page has an override" per page. This is
the single largest chunk of net-new complexity in the whole request — bigger
than the anchor system and rotation fix combined — and it's the one part
current Watermark UI has **zero** prior art for (page range picks *which*
pages, never *different values per page*).

**Recommendation: ship v1.1 without per-page override** (uniform manual
position across the selected range, which is what "apply to all pages" and
"copy to all pages" already give you for free), and treat true per-page
override as a v1.2 candidate if real usage shows people need it. Flagging
this rather than deciding it unilaterally since it changes the data model
and undo semantics non-trivially.

## 11. Component/UI plan

- `components/pdf/watermark/WatermarkTool.tsx`: add the Preset/Manual radio
  bound to `placement.mode`; on switch to manual, snapshot
  `cornerAnchorPct(...)` (current page) into `xPct/yPct`; on switch back to
  corner, restore the last-used corner (component-local state, defaults to
  `"center"`) — mirrors existing `applyCorner`.
- `components/pdf/watermark/WatermarkPreview.tsx`: extend the existing
  single-anchor drag block with keyboard handlers (per §9), snap-guide
  rendering (per §8), and anchor-aware numeric read/write (per §3). Pointer
  logic (`setPointerCapture`, live-DOM-write, commit-on-up) is unchanged,
  just gains the snap clamp and keyboard path alongside it.
- New small presentational block in the settings panel for: anchor picker
  (3×3 grid, `aria-pressed` per cell — learned from Crop PDF's audit finding
  that toggle groups need this from day one), alignment buttons, numeric
  X/Y (in points, per §2), "Allow overflow" checkbox.
- No changes to upload lifecycle, blob lifecycle, undo infrastructure,
  export pipeline invocation, or toolbar — all reused as-is per req. 15.

## 12. Regression surface (req. 17)

Zero changes to: `computeTilePositions`, `resolvePageIndices`/
`parsePageRangeInput`, corner presets' *output values* (only their
implementation is refactored to call the new shared center-anchor helper —
behavior-preserving, verified by re-running the existing corner test sweep
unchanged), opacity/rotation-slider/font-size/scale/color UI, page-range UI,
undo history, or the image/JPEG watermark paths. The only `export.ts` code
path that changes is the one `{ xPct, yPct }` line for manual placement,
replaced with the center-anchor computation from §7.

## 13. Test plan (maps directly to req. 18's list)

New test file `tests/watermark-manual-position.test.ts` (config-level, pure
functions, no DOM):

1. `clampManualPosition` — in-bounds passthrough, out-of-bounds clamp,
   `allowOverflow` widened bounds, degenerate zero-size box.
2. Alignment helpers — each of the 8, against several `widthPct`/`heightPct`
   combinations including a box larger than the page.
3. Anchor projection (top-left ⇄ each of the 9 anchors) — round-trips
   exactly; changing anchor then reading back the same anchor returns the
   original numeric value.
4. `nativeAnchorForCenter` / rotation-around-center — for 0°, 45°, 90°, 180°,
   270°, a fixed center point's box corners (computed independently in the
   test, not via the function under test) all remain equidistant from that
   center before and after rotation; **decode a real exported PDF's content
   stream** (same method `cornerAnchorPct`'s original bug was caught with) at
   two different `rotationDeg` values with identical `xPct/yPct`, asserting
   the drawn box's computed center point is bit-for-bit identical while its
   corners differ — this is the test that would have caught Watermark
   v1.0.0's original class of bug if it existed for rotation instead of
   page-size.
5. Corner-preset regression — re-run existing corner sweep unchanged after
   the `nativeAnchorForCenter` extraction refactor; must still be 0%
   overflow across all 450 combinations.
6. Mixed page sizes / rotated pages (90°/180°/270°) with a single manual
   `xPct/yPct` and `pageRange: "all"` — each page's exported box lands at the
   same *relative* position on its own visual page, matching the page-local
   principle (same shape of test as Crop's mixed-size regression test).
7. Zoom consistency — assert the exported `xPct/yPct` (and therefore
   exported PDF bytes) are identical regardless of what preview render scale
   produced them; percent storage makes this trivially true, but the test
   exists to lock the invariant against a future regression that starts
   storing pixels.
8. Blob cleanup — export twice with different manual positions, assert the
   first blob URL is revoked before the second is created (same pattern
   already covered for Crop; extend the existing Watermark blob-lifecycle
   test rather than duplicating it).

Drag/keyboard/snap/anchor-picker interaction tests are DOM-level and get the
same treatment Crop PDF's did: written and reviewed, verified live in a real
browser where possible, with the already-diagnosed automation-canvas hang
(pdf.worker fetch never resolving in this environment) documented as a
known verification-method limitation rather than blocking the audit.

## 14. Accessibility (req. 12)

Directly reuses Crop's now-audited pattern: keyboard-operable anchor node,
visible focus ring (`:focus-visible` outline, matching Crop/Edit PDF's
existing style tokens), `aria-label` describing current position on the
anchor node, `aria-live="polite"` region announcing position after keyboard
moves, `aria-pressed` on every toggle button (anchor grid, alignment
buttons, Preset/Manual radio, allow-overflow checkbox) — this last point is
called out explicitly because it's the exact gap Crop PDF's Phase 3 audit
just found and fixed, so it must not repeat here.

## 15. Implementation roadmap

- **Phase 1** — data model + pure functions: `WatermarkAnchor`, `manualAnchor`
  field, `clampManualPosition`, alignment helpers, `nativeAnchorForCenter`
  extraction (with the corner-preset regression re-run), anchor projection
  math. Full unit test coverage per §13 items 1–5 before any UI work.
- **Phase 2** — `export.ts` integration: manual-mode draw path uses
  `nativeAnchorForCenter`; mixed-page-size and rotation regression tests
  (§13 items 6–7) passing against real decoded PDFs.
- **Phase 3** — UI: Preset/Manual toggle, anchor picker, alignment buttons,
  numeric X/Y (point-displayed), allow-overflow toggle, snap guides,
  keyboard support, `aria-live` wiring.
- **Phase 4** — full audit (same 10-point checklist just run for Crop PDF):
  code review, tests, lint, typecheck, build, browser verification,
  accessibility, performance, regression (explicit re-check that all preset
  positions/opacity/rotation/font/scale/color/page-selection/undo/exports
  are byte-identical to pre-change output for every existing config shape),
  security.
- **Phase 5** — commit, push, PR, CI, merge, deploy, live verification, tag
  `watermark-pdf-v1.1.0`.

## Open questions for you before Phase 1 starts

1. Per-page override (§10) — ship without it in v1.1 (recommended) or
   include it now?
2. Numeric X/Y display unit — points (as literally requested) computed
   against the *currently viewed* page, or would percent displayed as
   `0–100` be acceptable instead (simpler, no per-page reinterpretation when
   navigating pages of different sizes)? Recommendation is points, per the
   literal request, but flagging that navigating to a differently-sized page
   will change what number is shown for the *same* stored position — that's
   correct behavior (the position is genuinely relative), not a bug, but
   worth confirming that's the intended UX.
