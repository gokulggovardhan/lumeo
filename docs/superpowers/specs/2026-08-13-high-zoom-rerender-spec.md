# High-Zoom Re-Rendering — Design Spec

**Date:** 2026-08-13
**Status:** Draft, not yet implemented
**Target:** `components/pdf/EditPdfTool.tsx`, `lib/pdf/pdfjs.ts`, `lib/pdf/edit/textRuns.ts`

---

## 1. Current behaviour, measured

Zoom today is **pure CSS upscaling of a fixed-resolution bitmap**. Nothing re-rasterizes.

| Fact | Location | Value |
|---|---|---|
| Raster scale | `EditPdfTool.tsx:232` | `PAGE_RENDER_SCALE = 1.3` |
| Render effect deps | `EditPdfTool.tsx:790` | `[pdf, pageIndex, docReady]` — **`zoom` absent** |
| Zoom applied as | `EditPdfTool.tsx:1831` | `<div className="mx-auto" style={{ width: `${zoom * 100}%` }}>` |
| Zoom clamp | wheel handler + Ctrl `+`/`-` | `0.5 … 2.0` |

So at the current 200% cap the user sees a 1.3× bitmap stretched to 2.6× — already visibly soft on text. Naively raising the cap to 500% would display a 1.3× raster at 6.5× effective, roughly **0.2× native resolution**. The page would be unreadable mush. **Raising the cap without re-rasterizing is not an improvement, it is a regression.**

## 2. Why this isn't a one-line change

The render effect (`EditPdfTool.tsx:669-790`) does three unrelated jobs in one `useEffect`:

1. **Rasterize** — `page.render()` → `canvas.toBlob()` → `setPageImageUrl`
2. **Detect text** — `page.getTextContent()` → `textRunsFromContent()` → `setDetectedTextRuns`
3. **Reset interaction state** — clears selection, anchor, hover, focus, draft text, apply error, substitute-font consent, run matches, page operators, Privacy Shield matches, `textDetectionReady`

Adding `zoom` to that dependency array would re-rasterize correctly **and also wipe the user's selection and half-typed replacement text on every zoom step.** That is why this needs an architectural split, not a dependency tweak.

## 3. Goals / non-goals

**Goals**
- Zoom to at least 400% with text that stays crisp.
- Zooming never disturbs selection, draft text, substitute-font consent, or placed elements.
- No unbounded memory growth; a large page at high zoom must degrade gracefully, not crash the tab.

**Non-goals**
- Tiled/viewport-windowed rendering (rasterizing only the visible region). Correct long-term answer for very high zoom, materially larger project. Out of scope.
- Changing zoom *gestures* or controls. Ctrl+scroll, Ctrl `+`/`-`/`0`, and the `−`/`+`/Fit cluster keep their current behaviour and clamp semantics apart from the new upper bound.

## 4. Architecture: split the effect

### 4a. Effect A — page identity reset
**Deps:** `[pdf, pageIndex]`
Owns *only* job 3. Runs when the page the user is looking at actually changes.

### 4b. Effect B — rasterize
**Deps:** `[pdf, pageIndex, docReady, rasterScale]`
Owns job 1. Sets `pageImageUrl`, `pageDisplaySize`, `pagePointSize`. Must **not** touch selection state.

Cancellation matters more here than today, because zoom can retrigger it rapidly. Keep the existing `renderTask.cancel()` cleanup and add debouncing (§6).

### 4c. Effect C — detect text
**Deps:** `[pdf, pageIndex, docReady]` — deliberately **not** `rasterScale`

`getTextContent()` output is scale-independent; only the viewport transform applied to it is not. Re-running detection on every zoom step would be pure waste and would re-trigger the operator-matching effect downstream.

**This requires decoupling detection from the raster viewport.** Today `textRunsFromContent(items, viewport.transform, canvas.width, canvas.height)` is fed the *raster* viewport. Since its outputs are percentages (§5), feeding it a **fixed scale-1 viewport** yields identical `xPct/yPct/widthPct/heightPct`. That change is a prerequisite and should be verified by test before anything else lands.

## 5. The invariant that makes this tractable

Detected runs and placed elements are stored in **percent space** (`xPct`, `yPct`, `widthPct`, `heightPct`, 0–100). Percent coordinates are resolution-independent, so **changing raster scale does not move anything.** This is the property that makes dynamic re-rasterization safe at all.

`DetectedTextRun.fontSizePx` is the exception — it is explicitly *"font size in device pixels at the viewport's scale"* (`textRuns.ts:94`). It is the one detection output that changes meaning if raster scale changes.

### 5a. Latent bug to fix first

`EditPdfTool.tsx:2044` sizes the inline editor's text as:

```ts
fontSize: `${Math.max(10, (singleSelectedRun.fontSizePx / PAGE_RENDER_SCALE) * pixelsPerPoint)}px`
```

This divides by the **constant** `PAGE_RENDER_SCALE` while multiplying by `pixelsPerPoint`, which is derived from the **actual** scale used (`pageDisplaySize.width / pagePointSize.width`, `EditPdfTool.tsx:1614`). Those agree only when the actual scale equals the constant.

They already disagree today for an oversized MediaBox, where `clampRenderScaleToMaxDimension` / `clampRenderScaleToPixelBudget` reduce the scale below `PAGE_RENDER_SCALE`. Under a dynamic raster scale they would disagree constantly.

Separately, both terms are **bitmap**-space, while the editor is rendered inside a percent-positioned box within a stage whose CSS width is independent of the bitmap width. Whether the on-screen editor text currently matches the rendered glyph size at zoom ≠ 1 **must be measured in a real browser before changing it** — do not assume either way.

**Action:** fix the scale mismatch and add a regression test *before* introducing dynamic raster scale, so the two changes can be attributed independently.

## 6. Raster scale policy

`lib/pdf/pdfjs.ts` already ships `computeAdaptiveRenderScale()` — fully implemented, unit-tested, and **deliberately unwired**, with a doc comment (`pdfjs.ts:145-182`) explaining it was parked because verifying it needed a real device and a compositing browser.

That blocker is now gone: this session established a working real-Chrome verification path. **This spec should wire that existing function rather than write a new one.** Its contract already matches what is needed here:

- Falls back to exactly today's scale when `cssDisplayWidthPx` is unknown — byte-identical current behaviour.
- Caps `devicePixelRatio` at `MAX_EFFECTIVE_DPR = 2`.
- Never returns *below* `baseScale`, so it cannot regress sharpness.
- Enforces a hard total-pixel budget.

**Proposed derivation:**

```
rasterScale = computeAdaptiveRenderScale({
  pageWidthPt, pageHeightPt,
  cssDisplayWidthPx: <measured stage width> * zoom,
  devicePixelRatio,
  baseScale: PAGE_RENDER_SCALE,
  maxDimensionPx: MAX_CANVAS_DIMENSION_PX,
  maxTotalPixels: MAX_CANVAS_TOTAL_PIXELS,
})
```

**Quantise before use.** Feeding a continuous zoom value straight in would re-rasterize on every wheel tick. Snap to discrete steps (e.g. `1.3, 2, 3, 4, 6`) and only re-render when the *quantised* value changes. Combine with a trailing debounce (~150 ms) so a zoom gesture produces one render, not thirty.

**Memory:** the existing `MAX_CANVAS_TOTAL_PIXELS` budget is the backstop. A US-Letter page at scale 6 is ~3670×4750 ≈ 17.4M px ≈ 70 MB RGBA before JPEG encoding — over budget, so the clamp will engage and the page will be softer than requested rather than crashing. That is the correct trade and should be stated in the UI only if it proves visible.

## 7. Test plan

**Unit (`node --test`, no DOM):**
- `textRunsFromContent` returns identical percentages for the same page at scales 1, 1.3, and 4 — the decoupling in §4c.
- Scale quantisation: monotonic, never exceeds the pixel budget, never below `baseScale`.
- `computeAdaptiveRenderScale` already has coverage; extend for the zoom-multiplied width path.

**Real-Chrome verification** (per the standing rule that the in-app pane cannot be trusted for render or layout checks):
- At 400%, page text is legibly sharper than the same view produced by CSS upscaling alone.
- Select a run, type a partial replacement, zoom in and out, confirm selection **and** draft text survive.
- Confirm Privacy Shield matches and substitute-font consent survive a zoom change.
- Confirm run overlays stay aligned to glyphs at 100%, 200%, and 400%.

**Gates:** `npx tsc --noEmit`, `npx eslint`, full suite green, `next build` clean.

## 8. Rollout

1. Fix §5a scale mismatch + regression test. *Independently shippable.*
2. Decouple detection from the raster viewport (§4c) + test. *No user-visible change.*
3. Split the effect three ways (§4). *No user-visible change; the risky refactor, landed alone.*
4. Wire `computeAdaptiveRenderScale` with quantisation and debounce (§6).
5. Raise the zoom cap from 2.0 to 4.0 in all four clamp sites. *One line each, last.*

Steps 1–3 carry the real regression risk and are individually verifiable. Step 5 is the only user-visible change and lands only once the rest is proven.

## 9. Open questions

- **Cap value:** 400% or 500%? 500% at the pixel budget means the clamp engages on most pages, delivering a soft image at the top of the range. 400% is honest about what can actually be delivered sharp. **Recommend 400%.**
- Should Fit account for the new cap, or stay fit-to-width? (Assume unchanged.)
