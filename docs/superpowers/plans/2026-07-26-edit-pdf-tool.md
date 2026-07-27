# Edit PDF Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a new `/pdf/edit` tool that lets a user place text boxes, freehand ink, shapes (rectangle/ellipse/line/highlight), and whiteout/redaction boxes on any page of an uploaded PDF, then flatten and download the result — matching the design in `docs/superpowers/specs/2026-07-26-edit-pdf-tool-design.md`.

**Architecture:** Generalizes the existing `SignPdfTool.tsx` pattern (pdfjs-dist page render → absolutely-positioned percent-based HTML overlay for placed elements → `pdf-lib` flatten on export) to four element types instead of one signature image. Reuses `lib/sign/useHistoryState.ts` for undo/redo verbatim (it's already generic). Freehand ink reuses the canvas-stroke-capture mechanism from `SignatureCreator.tsx`'s `DrawTab`, adapted to draw directly on the page stage instead of a separate modal.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, `pdfjs-dist` (page rendering), `pdf-lib` (flattening/export), Tailwind (styling via existing CSS custom properties), Node's built-in test runner (`node --experimental-strip-types`).

## Global Constraints

- Every file this plan modifies or creates must pass `npm exec eslint -- <file>` with zero output before being considered done.
- Pure logic modules that need direct `node --test` coverage (no React) must have **zero value-level imports of other project files** — only `import type` (erased at compile time, so it never hits Node's path-alias-resolution gap) or npm-package imports (`pdf-lib`) are safe. This exact constraint is why `lib/pdf/pageOrganizer.ts` duplicates a tiny helper instead of importing `lib/pdf/rotation.ts` — see that file's top comment for the full explanation.
- Coordinates for every placed element are stored as **percent of the rendered page** (`xPct`, `yPct`, `widthPct`, `heightPct`), matching `lib/sign/types.ts`'s `PlacedElementBase` exactly — this achieves the same zoom/resolution independence the design spec's "PDF point space" language calls for, via an already-proven, already-tested representation, rather than a new one.
- No signature placement, no page management (rotate/reorder/delete/duplicate/merge/split), no watermarking, no multi-select, no true content-stripping redaction, no vector-path ink — all explicitly out of scope per the approved spec.
- Whiteout must carry the exact disclosure copy from the spec: *"Whiteout hides content visually in the exported PDF. For documents with legal or compliance requirements, verify the underlying content is also removed before sharing."*
- No visible FAQ content on the tool's own page — FAQ copy lives only on `/guides`, per this session's established rule.

---

### Task 1: Element data model & pure array operations

**Files:**
- Create: `lib/pdf/edit/elements.ts`
- Test: `tests/edit-pdf-elements.test.ts`

**Interfaces:**
- Produces: `EditElement` (discriminated union type), `EditElementType` (`"text" | "shape" | "whiteout" | "ink"`), `ShapeKind` (`"rect" | "ellipse" | "line" | "highlight"`), `createTextElement(id, pageIndex, xPct, yPct): EditElement`, `createShapeElement(id, pageIndex, xPct, yPct, shapeKind): EditElement`, `createWhiteoutElement(id, pageIndex, xPct, yPct, color): EditElement`, `createInkElement(id, pageIndex, xPct, yPct, widthPct, heightPct, pngDataUrl): EditElement`, `patchElement(elements, id, patch): EditElement[]`, `deleteElement(elements, id): EditElement[]`, `canResizeElement(element): boolean`, `isLineShape(element): boolean`, `elementsForPage(elements, pageIndex): EditElement[]`.

- [ ] **Step 1: Write the failing test**

Create `tests/edit-pdf-elements.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  canResizeElement,
  createInkElement,
  createShapeElement,
  createTextElement,
  createWhiteoutElement,
  deleteElement,
  elementsForPage,
  isLineShape,
  patchElement,
} from "../lib/pdf/edit/elements.ts";

test("createTextElement produces sensible defaults", () => {
  const el = createTextElement("el-1", 0, 40, 45);
  assert.equal(el.type, "text");
  assert.equal(el.id, "el-1");
  assert.equal(el.pageIndex, 0);
  assert.equal(el.xPct, 40);
  assert.equal(el.yPct, 45);
  assert.ok(el.widthPct > 0);
  assert.ok(el.heightPct > 0);
  if (el.type === "text") {
    assert.equal(el.text, "");
    assert.equal(el.bold, false);
    assert.equal(el.italic, false);
  }
});

test("createShapeElement carries the requested shapeKind", () => {
  const rect = createShapeElement("el-2", 0, 10, 10, "rect");
  const highlight = createShapeElement("el-3", 0, 10, 10, "highlight");
  if (rect.type === "shape") assert.equal(rect.shapeKind, "rect");
  if (highlight.type === "shape") {
    assert.equal(highlight.shapeKind, "highlight");
    assert.ok(highlight.opacity < 1, "highlight preset should default to partial opacity");
  }
});

test("createWhiteoutElement defaults to white", () => {
  const el = createWhiteoutElement("el-4", 0, 10, 10);
  assert.equal(el.type, "whiteout");
  if (el.type === "whiteout") assert.equal(el.color, "white");
});

test("createInkElement stores the given bounding box and PNG data URL", () => {
  const el = createInkElement("el-5", 0, 5, 5, 30, 10, "data:image/png;base64,abc");
  assert.equal(el.type, "ink");
  assert.equal(el.widthPct, 30);
  assert.equal(el.heightPct, 10);
  if (el.type === "ink") assert.equal(el.pngDataUrl, "data:image/png;base64,abc");
});

test("canResizeElement is false only for ink", () => {
  assert.equal(canResizeElement(createTextElement("a", 0, 0, 0)), true);
  assert.equal(canResizeElement(createShapeElement("b", 0, 0, 0, "rect")), true);
  assert.equal(canResizeElement(createWhiteoutElement("c", 0, 0, 0)), true);
  assert.equal(canResizeElement(createInkElement("d", 0, 0, 0, 10, 10, "data:x")), false);
});

test("isLineShape is true only for shape elements with shapeKind line", () => {
  assert.equal(isLineShape(createShapeElement("a", 0, 0, 0, "line")), true);
  assert.equal(isLineShape(createShapeElement("b", 0, 0, 0, "rect")), false);
  assert.equal(isLineShape(createTextElement("c", 0, 0, 0)), false);
});

test("patchElement updates only the matching id, leaving others untouched", () => {
  const elements = [createTextElement("a", 0, 10, 10), createTextElement("b", 0, 20, 20)];
  const patched = patchElement(elements, "a", { xPct: 99 });
  assert.equal(patched[0].xPct, 99);
  assert.equal(patched[1].xPct, 20);
  assert.notEqual(patched, elements, "should return a new array");
});

test("deleteElement removes only the matching id", () => {
  const elements = [createTextElement("a", 0, 0, 0), createTextElement("b", 0, 0, 0)];
  const next = deleteElement(elements, "a");
  assert.equal(next.length, 1);
  assert.equal(next[0].id, "b");
});

test("elementsForPage filters by pageIndex", () => {
  const elements = [createTextElement("a", 0, 0, 0), createTextElement("b", 1, 0, 0), createTextElement("c", 0, 0, 0)];
  const page0 = elementsForPage(elements, 0);
  assert.equal(page0.length, 2);
  assert.deepEqual(page0.map((e) => e.id), ["a", "c"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --no-warnings --test --experimental-strip-types tests/edit-pdf-elements.test.ts`
Expected: FAIL — `Cannot find module '../lib/pdf/edit/elements.ts'`

- [ ] **Step 3: Write the implementation**

Create `lib/pdf/edit/elements.ts`:

```ts
// lib/pdf/edit/elements.ts
//
// Self-contained (no project-file imports) so this module can run directly
// under `node --experimental-strip-types` for tests, exactly like
// lib/pdf/pageOrganizer.ts and lib/pdf/textExtraction.ts do -- see those
// files' top comments for why a pure logic module in this codebase avoids
// importing other project files.
//
// Coordinates are percent of the rendered page (0-100), matching
// lib/sign/types.ts's PlacedElementBase -- zoom/resolution independent,
// converted to PDF points only at export time (lib/pdf/edit/export.ts).

export type ShapeKind = "rect" | "ellipse" | "line" | "highlight";

export type EditElementBase = {
  id: string;
  pageIndex: number;
  xPct: number;
  yPct: number;
  widthPct: number;
  heightPct: number;
};

export type TextEditElement = EditElementBase & {
  type: "text";
  text: string;
  fontSizePt: number;
  color: string;
  bold: boolean;
  italic: boolean;
};

export type ShapeEditElement = EditElementBase & {
  type: "shape";
  shapeKind: ShapeKind;
  color: string;
  opacity: number;
};

export type WhiteoutEditElement = EditElementBase & {
  type: "whiteout";
  color: "white" | "black";
};

export type InkEditElement = EditElementBase & {
  type: "ink";
  pngDataUrl: string;
};

export type EditElement = TextEditElement | ShapeEditElement | WhiteoutEditElement | InkEditElement;

const DEFAULT_TEXT_WIDTH_PCT = 20;
const DEFAULT_TEXT_HEIGHT_PCT = 4;
const DEFAULT_FONT_SIZE_PT = 14;
const DEFAULT_SHAPE_WIDTH_PCT = 18;
const DEFAULT_SHAPE_HEIGHT_PCT = 10;
const DEFAULT_WHITEOUT_WIDTH_PCT = 20;
const DEFAULT_WHITEOUT_HEIGHT_PCT = 6;
const HIGHLIGHT_OPACITY = 0.35;
const SHAPE_OPAQUE = 1;

export function createTextElement(id: string, pageIndex: number, xPct: number, yPct: number): TextEditElement {
  return {
    id,
    type: "text",
    pageIndex,
    xPct,
    yPct,
    widthPct: DEFAULT_TEXT_WIDTH_PCT,
    heightPct: DEFAULT_TEXT_HEIGHT_PCT,
    text: "",
    fontSizePt: DEFAULT_FONT_SIZE_PT,
    color: "#12141a",
    bold: false,
    italic: false,
  };
}

export function createShapeElement(
  id: string,
  pageIndex: number,
  xPct: number,
  yPct: number,
  shapeKind: ShapeKind,
): ShapeEditElement {
  return {
    id,
    type: "shape",
    pageIndex,
    xPct,
    yPct,
    widthPct: DEFAULT_SHAPE_WIDTH_PCT,
    heightPct: shapeKind === "line" ? 0.5 : DEFAULT_SHAPE_HEIGHT_PCT,
    shapeKind,
    color: shapeKind === "highlight" ? "#ffe066" : "#e03131",
    opacity: shapeKind === "highlight" ? HIGHLIGHT_OPACITY : SHAPE_OPAQUE,
  };
}

export function createWhiteoutElement(
  id: string,
  pageIndex: number,
  xPct: number,
  yPct: number,
  color: "white" | "black" = "white",
): WhiteoutEditElement {
  return {
    id,
    type: "whiteout",
    pageIndex,
    xPct,
    yPct,
    widthPct: DEFAULT_WHITEOUT_WIDTH_PCT,
    heightPct: DEFAULT_WHITEOUT_HEIGHT_PCT,
    color,
  };
}

export function createInkElement(
  id: string,
  pageIndex: number,
  xPct: number,
  yPct: number,
  widthPct: number,
  heightPct: number,
  pngDataUrl: string,
): InkEditElement {
  return { id, type: "ink", pageIndex, xPct, yPct, widthPct, heightPct, pngDataUrl };
}

export function canResizeElement(element: EditElement): boolean {
  return element.type !== "ink";
}

export function isLineShape(element: EditElement): boolean {
  return element.type === "shape" && element.shapeKind === "line";
}

export function patchElement(elements: EditElement[], id: string, patch: Partial<EditElement>): EditElement[] {
  return elements.map((item) => (item.id === id ? ({ ...item, ...patch } as EditElement) : item));
}

export function deleteElement(elements: EditElement[], id: string): EditElement[] {
  return elements.filter((item) => item.id !== id);
}

export function elementsForPage(elements: EditElement[], pageIndex: number): EditElement[] {
  return elements.filter((item) => item.pageIndex === pageIndex);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --no-warnings --test --experimental-strip-types tests/edit-pdf-elements.test.ts`
Expected: PASS — all 8 tests green.

- [ ] **Step 5: Lint**

Run: `npm exec eslint -- lib/pdf/edit/elements.ts tests/edit-pdf-elements.test.ts`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add lib/pdf/edit/elements.ts tests/edit-pdf-elements.test.ts
git commit -m "feat(edit-pdf): add element data model and pure array operations"
```

---

### Task 2: PDF export/flatten logic

**Files:**
- Create: `lib/pdf/edit/export.ts`
- Test: `tests/edit-pdf-export.test.ts`

**Interfaces:**
- Consumes: `EditElement` type from `./elements` (type-only import — erased at compile time, so it never triggers Node's path-alias-resolution gap; see Global Constraints).
- Produces: `exportEditedPdf(originalBytes: ArrayBuffer, elements: EditElement[]): Promise<{ bytes: Uint8Array; skippedPages: number[] }>`.

- [ ] **Step 1: Write the failing test**

Create `tests/edit-pdf-export.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import { exportEditedPdf } from "../lib/pdf/edit/export.ts";
import { createShapeElement, createTextElement, createWhiteoutElement } from "../lib/pdf/edit/elements.ts";

async function makeBlankPdf(pageCount: number): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i += 1) doc.addPage([612, 792]);
  const bytes = await doc.save();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

test("exportEditedPdf returns valid PDF bytes with no elements", async () => {
  const original = await makeBlankPdf(1);
  const { bytes, skippedPages } = await exportEditedPdf(original, []);
  const reloaded = await PDFDocument.load(bytes);
  assert.equal(reloaded.getPageCount(), 1);
  assert.deepEqual(skippedPages, []);
});

test("exportEditedPdf draws a text element onto its page", async () => {
  const original = await makeBlankPdf(1);
  const element = createTextElement("t1", 0, 20, 20);
  const withText = { ...element, text: "Hello" };
  const { bytes } = await exportEditedPdf(original, [withText]);
  const reloaded = await PDFDocument.load(bytes);
  assert.equal(reloaded.getPageCount(), 1);
  // A page with real drawn text/graphics content is larger than a blank one.
  assert.ok(bytes.byteLength > original.byteLength);
});

test("exportEditedPdf draws shape and whiteout elements", async () => {
  const original = await makeBlankPdf(1);
  const rect = createShapeElement("s1", 0, 10, 10, "rect");
  const whiteout = createWhiteoutElement("w1", 0, 40, 40);
  const { bytes, skippedPages } = await exportEditedPdf(original, [rect, whiteout]);
  const reloaded = await PDFDocument.load(bytes);
  assert.equal(reloaded.getPageCount(), 1);
  assert.deepEqual(skippedPages, []);
  assert.ok(bytes.byteLength > original.byteLength);
});

test("exportEditedPdf skips a page whose index doesn't exist, without throwing", async () => {
  const original = await makeBlankPdf(1);
  const outOfRange = createTextElement("t2", 5, 10, 10);
  const withText = { ...outOfRange, text: "orphaned" };
  const { bytes, skippedPages } = await exportEditedPdf(original, [withText]);
  const reloaded = await PDFDocument.load(bytes);
  assert.equal(reloaded.getPageCount(), 1);
  assert.deepEqual(skippedPages, []); // out-of-range elements are silently skipped per-element, not counted as a page failure
});

test("exportEditedPdf ignores an empty text element (nothing to draw)", async () => {
  const original = await makeBlankPdf(1);
  const empty = createTextElement("t3", 0, 10, 10); // text: ""
  const { bytes } = await exportEditedPdf(original, [empty]);
  const reloaded = await PDFDocument.load(bytes);
  assert.equal(reloaded.getPageCount(), 1);
  assert.ok(bytes.byteLength >= original.byteLength);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --no-warnings --test --experimental-strip-types tests/edit-pdf-export.test.ts`
Expected: FAIL — `Cannot find module '../lib/pdf/edit/export.ts'`

- [ ] **Step 3: Write the implementation**

Create `lib/pdf/edit/export.ts`:

```ts
// lib/pdf/edit/export.ts
//
// Flattens EditElement[] onto a freshly-loaded copy of the original PDF's
// bytes via pdf-lib, mirroring SignPdfTool's export step (load fresh, never
// mutate the pdfjs-rendered copy). Percent-based element coordinates are
// converted to PDF points here, using each page's own reported size --
// this is the one place that conversion happens, per the design spec.
//
// Per-page try/catch: one page's draw failure is recorded in
// skippedPages and that page is left as-is, rather than losing the whole
// export -- consistent with the per-page isolation added to
// ExtractTextTool this session.

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { EditElement } from "./elements";

function hexToRgb01(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.replace("#", "");
  const value = Number.parseInt(normalized.length === 3
    ? normalized.split("").map((c) => c + c).join("")
    : normalized, 16);
  return {
    r: ((value >> 16) & 255) / 255,
    g: ((value >> 8) & 255) / 255,
    b: (value & 255) / 255,
  };
}

export async function exportEditedPdf(
  originalBytes: ArrayBuffer,
  elements: EditElement[],
): Promise<{ bytes: Uint8Array; skippedPages: number[] }> {
  const doc = await PDFDocument.load(originalBytes);
  const helvetica = await doc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const pngCache = new Map<string, Uint8Array>();
  const skippedPages: number[] = [];

  const byPage = new Map<number, EditElement[]>();
  for (const element of elements) {
    const list = byPage.get(element.pageIndex) ?? [];
    list.push(element);
    byPage.set(element.pageIndex, list);
  }

  for (const [pageIndex, pageElements] of byPage) {
    const page = doc.getPages()[pageIndex];
    if (!page) continue; // element refers to a page that doesn't exist -- skip that element, not a page failure

    try {
      const { width: pageWidth, height: pageHeight } = page.getSize();

      for (const element of pageElements) {
        const xPt = (element.xPct / 100) * pageWidth;
        const widthPt = (element.widthPct / 100) * pageWidth;
        const heightPt = (element.heightPct / 100) * pageHeight;
        const topYPt = pageHeight - (element.yPct / 100) * pageHeight;

        if (element.type === "text") {
          if (!element.text.trim()) continue;
          const { r, g, b } = hexToRgb01(element.color);
          page.drawText(element.text, {
            x: xPt,
            y: topYPt - element.fontSizePt,
            size: element.fontSizePt,
            font: element.bold ? helveticaBold : helvetica,
            color: rgb(r, g, b),
          });
        } else if (element.type === "whiteout") {
          const { r, g, b } = element.color === "white" ? { r: 1, g: 1, b: 1 } : { r: 0, g: 0, b: 0 };
          page.drawRectangle({ x: xPt, y: topYPt - heightPt, width: widthPt, height: heightPt, color: rgb(r, g, b) });
        } else if (element.type === "shape") {
          const { r, g, b } = hexToRgb01(element.color);
          const color = rgb(r, g, b);
          if (element.shapeKind === "line") {
            page.drawLine({
              start: { x: xPt, y: topYPt },
              end: { x: xPt + widthPt, y: topYPt - heightPt },
              thickness: 2,
              color,
              opacity: element.opacity,
            });
          } else if (element.shapeKind === "ellipse") {
            page.drawEllipse({
              x: xPt + widthPt / 2,
              y: topYPt - heightPt / 2,
              xScale: widthPt / 2,
              yScale: heightPt / 2,
              color,
              opacity: element.opacity,
            });
          } else {
            // "rect" and "highlight" both render as a rectangle -- highlight
            // is just a rect with a lower default opacity, set at creation.
            page.drawRectangle({ x: xPt, y: topYPt - heightPt, width: widthPt, height: heightPt, color, opacity: element.opacity });
          }
        } else if (element.type === "ink") {
          let bytes = pngCache.get(element.pngDataUrl);
          if (!bytes) {
            const response = await fetch(element.pngDataUrl);
            bytes = new Uint8Array(await response.arrayBuffer());
            pngCache.set(element.pngDataUrl, bytes);
          }
          const embedded = await doc.embedPng(bytes);
          page.drawImage(embedded, { x: xPt, y: topYPt - heightPt, width: widthPt, height: heightPt });
        }
      }
    } catch {
      skippedPages.push(pageIndex);
    }
  }

  const bytes = await doc.save();
  return { bytes, skippedPages };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --no-warnings --test --experimental-strip-types tests/edit-pdf-export.test.ts`
Expected: PASS — all 5 tests green.

- [ ] **Step 5: Lint**

Run: `npm exec eslint -- lib/pdf/edit/export.ts tests/edit-pdf-export.test.ts`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add lib/pdf/edit/export.ts tests/edit-pdf-export.test.ts
git commit -m "feat(edit-pdf): add pdf-lib export/flatten logic with per-page error isolation"
```

---

### Task 3: Ink capture component

**Files:**
- Create: `components/pdf/edit/InkCanvas.tsx`

**Interfaces:**
- Consumes: nothing project-specific (pure React + Canvas API).
- Produces: `<InkCanvas stageWidthPx={number} stageHeightPx={number} color={string} strokeWidthPx={number} onStrokeComplete={(result: { pngDataUrl: string; xPct: number; yPct: number; widthPct: number; heightPct: number }) => void} />`. Later tasks (Task 4) rely on exactly this prop shape and callback signature.

- [ ] **Step 1: Write the implementation**

No unit test for this step — it's a React component with pointer-event/canvas interaction, consistent with this codebase's convention that UI components (`SignatureCreator.tsx`, `PlacedElementView.tsx`) are verified via lint + build + manual browser check, not `node --test` (only pure non-React logic gets direct test coverage here). Verification happens in Task 4's manual check once this is wired into the real tool.

Create `components/pdf/edit/InkCanvas.tsx`:

```tsx
"use client";

// components/pdf/edit/InkCanvas.tsx
//
// Freehand ink capture, active only while the Draw tool is selected. Renders
// a transparent canvas exactly matching the page stage's pixel dimensions,
// captures one stroke per pointer-down-to-up gesture, then crops the
// drawn region to its own small canvas and rasterizes that crop to a PNG
// data URL -- avoiding storing a full-page-sized image per stroke.
//
// Adapted from SignatureCreator.tsx's DrawTab (same stroke-capture and
// redraw-loop mechanism), but draws directly on the real page stage instead
// of an isolated fixed-size modal canvas.

import { useRef } from "react";

type Point = { x: number; y: number };

export function InkCanvas({
  stageWidthPx,
  stageHeightPx,
  color,
  strokeWidthPx,
  onStrokeComplete,
}: {
  stageWidthPx: number;
  stageHeightPx: number;
  color: string;
  strokeWidthPx: number;
  onStrokeComplete: (result: { pngDataUrl: string; xPct: number; yPct: number; widthPct: number; heightPct: number }) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pointsRef = useRef<Point[]>([]);
  const drawingRef = useRef(false);

  function getPoint(event: React.PointerEvent<HTMLCanvasElement>): Point {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function redraw() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    const points = pointsRef.current;
    if (points.length < 2) return;
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    for (const point of points.slice(1)) context.lineTo(point.x, point.y);
    context.strokeStyle = color;
    context.lineWidth = strokeWidthPx;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.stroke();
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    drawingRef.current = true;
    pointsRef.current = [getPoint(event)];
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    pointsRef.current.push(getPoint(event));
    redraw();
  }

  function finishStroke(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    (event.target as HTMLElement).releasePointerCapture(event.pointerId);

    const points = pointsRef.current;
    const canvas = canvasRef.current;
    if (points.length < 2 || !canvas) {
      pointsRef.current = [];
      redraw();
      return;
    }

    const minX = Math.min(...points.map((p) => p.x));
    const maxX = Math.max(...points.map((p) => p.x));
    const minY = Math.min(...points.map((p) => p.y));
    const maxY = Math.max(...points.map((p) => p.y));
    const padding = strokeWidthPx;
    const cropX = Math.max(0, minX - padding);
    const cropY = Math.max(0, minY - padding);
    const cropWidth = Math.min(canvas.width, maxX + padding) - cropX;
    const cropHeight = Math.min(canvas.height, maxY + padding) - cropY;

    const cropCanvas = document.createElement("canvas");
    cropCanvas.width = Math.max(1, Math.round(cropWidth));
    cropCanvas.height = Math.max(1, Math.round(cropHeight));
    const cropContext = cropCanvas.getContext("2d");
    if (cropContext) {
      cropContext.beginPath();
      cropContext.moveTo(points[0].x - cropX, points[0].y - cropY);
      for (const point of points.slice(1)) cropContext.lineTo(point.x - cropX, point.y - cropY);
      cropContext.strokeStyle = color;
      cropContext.lineWidth = strokeWidthPx;
      cropContext.lineCap = "round";
      cropContext.lineJoin = "round";
      cropContext.stroke();
    }

    onStrokeComplete({
      pngDataUrl: cropCanvas.toDataURL("image/png"),
      xPct: (cropX / canvas.width) * 100,
      yPct: (cropY / canvas.height) * 100,
      widthPct: (cropWidth / canvas.width) * 100,
      heightPct: (cropHeight / canvas.height) * 100,
    });

    pointsRef.current = [];
    redraw();
  }

  return (
    <canvas
      ref={canvasRef}
      width={stageWidthPx}
      height={stageHeightPx}
      className="absolute inset-0 h-full w-full touch-none"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishStroke}
      onPointerCancel={finishStroke}
    />
  );
}
```

- [ ] **Step 2: Lint**

Run: `npm exec eslint -- components/pdf/edit/InkCanvas.tsx`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add components/pdf/edit/InkCanvas.tsx
git commit -m "feat(edit-pdf): add freehand ink capture component"
```

---

### Task 4: Placed-element view (select/move/resize/line-endpoints)

**Files:**
- Create: `components/pdf/edit/EditElementView.tsx`

**Interfaces:**
- Consumes: `EditElement`, `canResizeElement`, `isLineShape` from `@/lib/pdf/edit/elements`.
- Produces: `<EditElementView element={EditElement} selected={boolean} stageRef={React.RefObject<HTMLDivElement | null>} onSelect={() => void} onChange={(patch: Partial<EditElement>) => void} onDelete={() => void} onTextChange={(text: string) => void} />`. Task 5 renders one of these per element on the current page.

- [ ] **Step 1: Write the implementation**

No unit test — same rationale as Task 3 (pointer-driven DOM interaction, verified via lint/build/manual check).

Create `components/pdf/edit/EditElementView.tsx`:

```tsx
"use client";

// components/pdf/edit/EditElementView.tsx
//
// One placed element (text/shape/whiteout/ink) on the edit stage. Adapted
// from components/pdf/sign/PlacedElementView.tsx's drag/resize pointer math,
// extended to 2D resize (both width and height, since a rectangle needs
// both dimensions -- PlacedElementView's text-like branch only ever resized
// width) and line-endpoint dragging for line shapes. Ink elements are
// move + delete only, matching the design spec.
//
// Same perf approach as PlacedElementView: drag/resize write straight to
// the DOM node's style on every pointermove, and only call onChange once
// at gesture end, so dragging stays smooth regardless of how many other
// elements are on the page.

import { useRef } from "react";
import { canResizeElement, isLineShape, type EditElement } from "@/lib/pdf/edit/elements";

const MIN_SIZE_PCT = 2;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

type LiveGeometry = { xPct: number; yPct: number; widthPct: number; heightPct: number };

export function EditElementView({
  element,
  selected,
  stageRef,
  onSelect,
  onChange,
  onDelete,
  onTextChange,
}: {
  element: EditElement;
  selected: boolean;
  stageRef: React.RefObject<HTMLDivElement | null>;
  onSelect: () => void;
  onChange: (patch: Partial<EditElement>) => void;
  onDelete: () => void;
  onTextChange: (text: string) => void;
}) {
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const liveRef = useRef<LiveGeometry | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; originXPct: number; originYPct: number } | null>(null);
  const resizeRef = useRef<{
    startX: number;
    startY: number;
    originWidthPct: number;
    originHeightPct: number;
    originXPct: number;
    originYPct: number;
    // Which endpoint is being dragged, for line shapes -- "end" resizes via
    // the normal corner handle (adjusts width/height from the start point),
    // "start" instead moves the origin point too so the opposite endpoint
    // stays fixed.
    endpoint: "start" | "end";
  } | null>(null);

  function getStageRect() {
    return stageRef.current?.getBoundingClientRect() ?? null;
  }

  function ensureLive(): LiveGeometry {
    if (!liveRef.current) {
      liveRef.current = { xPct: element.xPct, yPct: element.yPct, widthPct: element.widthPct, heightPct: element.heightPct };
    }
    return liveRef.current;
  }

  function applyLiveStyle(live: LiveGeometry) {
    const node = nodeRef.current;
    if (!node) return;
    node.style.left = `${live.xPct}%`;
    node.style.top = `${live.yPct}%`;
    node.style.width = `${live.widthPct}%`;
    node.style.height = `${live.heightPct}%`;
  }

  function commitLive() {
    const live = liveRef.current;
    liveRef.current = null;
    if (!live) return;
    onChange(live);
  }

  function handleBodyPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).dataset.handle) return;
    onSelect();
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    dragRef.current = { startX: event.clientX, startY: event.clientY, originXPct: element.xPct, originYPct: element.yPct };
  }

  function handleBodyPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const rect = getStageRect();
    if (!drag || !rect) return;
    const deltaXPct = ((event.clientX - drag.startX) / rect.width) * 100;
    const deltaYPct = ((event.clientY - drag.startY) / rect.height) * 100;
    const live = ensureLive();
    live.xPct = clamp(drag.originXPct + deltaXPct, 0, 100 - live.widthPct);
    live.yPct = clamp(drag.originYPct + deltaYPct, 0, 100 - live.heightPct);
    applyLiveStyle(live);
  }

  function handleBodyPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (dragRef.current) {
      dragRef.current = null;
      commitLive();
    }
    (event.target as HTMLElement).releasePointerCapture(event.pointerId);
  }

  function handleResizeStart(endpoint: "start" | "end") {
    return (event: React.PointerEvent<HTMLDivElement>) => {
      event.stopPropagation();
      (event.target as HTMLElement).setPointerCapture(event.pointerId);
      resizeRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        originWidthPct: element.widthPct,
        originHeightPct: element.heightPct,
        originXPct: element.xPct,
        originYPct: element.yPct,
        endpoint,
      };
    };
  }

  function handleResizeMove(event: React.PointerEvent<HTMLDivElement>) {
    const resize = resizeRef.current;
    const rect = getStageRect();
    if (!resize || !rect) return;
    const deltaXPct = ((event.clientX - resize.startX) / rect.width) * 100;
    const deltaYPct = ((event.clientY - resize.startY) / rect.height) * 100;
    const live = ensureLive();

    if (resize.endpoint === "start") {
      // Dragging the line's start point: the opposite corner (origin +
      // original width/height) stays fixed, so both origin and size shift.
      const fixedX = resize.originXPct + resize.originWidthPct;
      const fixedY = resize.originYPct + resize.originHeightPct;
      const nextX = clamp(resize.originXPct + deltaXPct, 0, 100);
      const nextY = clamp(resize.originYPct + deltaYPct, 0, 100);
      live.xPct = Math.min(nextX, fixedX);
      live.yPct = Math.min(nextY, fixedY);
      live.widthPct = Math.max(MIN_SIZE_PCT, Math.abs(fixedX - nextX));
      live.heightPct = Math.max(MIN_SIZE_PCT, Math.abs(fixedY - nextY));
    } else {
      live.widthPct = clamp(resize.originWidthPct + deltaXPct, MIN_SIZE_PCT, 100 - resize.originXPct);
      live.heightPct = clamp(resize.originHeightPct + deltaYPct, MIN_SIZE_PCT, 100 - resize.originYPct);
    }
    applyLiveStyle(live);
  }

  function handleResizeEnd(event: React.PointerEvent<HTMLDivElement>) {
    if (resizeRef.current) {
      resizeRef.current = null;
      commitLive();
    }
    (event.target as HTMLElement).releasePointerCapture(event.pointerId);
  }

  const resizable = canResizeElement(element);
  const isLine = isLineShape(element);

  return (
    <div
      ref={nodeRef}
      role="button"
      tabIndex={0}
      aria-label={`${element.type} element, Delete to remove`}
      onFocus={onSelect}
      onPointerDown={handleBodyPointerDown}
      onPointerMove={(event) => {
        handleBodyPointerMove(event);
        handleResizeMove(event);
      }}
      onPointerUp={(event) => {
        handleBodyPointerUp(event);
        handleResizeEnd(event);
      }}
      onPointerCancel={(event) => {
        handleBodyPointerUp(event);
        handleResizeEnd(event);
      }}
      onKeyDown={(event) => {
        if (event.key === "Delete" || event.key === "Backspace") {
          event.preventDefault();
          event.stopPropagation();
          onDelete();
        }
      }}
      className={`absolute touch-none select-none ${selected ? "z-20" : "z-10"} cursor-grab active:cursor-grabbing`}
      style={{ left: `${element.xPct}%`, top: `${element.yPct}%`, width: `${element.widthPct}%`, height: `${element.heightPct}%` }}
    >
      {element.type === "text" ? (
        <textarea
          value={element.text}
          onChange={(event) => onTextChange(event.target.value)}
          onPointerDown={(event) => event.stopPropagation()}
          placeholder="Type here"
          className={`h-full w-full resize-none rounded-sm bg-transparent px-1 outline-none ${selected ? "ring-2 ring-[var(--lumeo-gold)]" : "hover:ring-1 hover:ring-[var(--text-primary)]/20"}`}
          style={{
            fontSize: `${element.fontSizePt}px`,
            lineHeight: 1.15,
            color: element.color,
            fontWeight: element.bold ? 700 : 400,
            fontStyle: element.italic ? "italic" : "normal",
          }}
        />
      ) : element.type === "ink" ? (
        <div className={`h-full w-full rounded-sm ${selected ? "ring-2 ring-[var(--lumeo-gold)]" : ""}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={element.pngDataUrl} alt="Ink stroke" className="h-full w-full select-none" draggable={false} />
        </div>
      ) : element.type === "whiteout" ? (
        <div
          className={`h-full w-full rounded-sm ${selected ? "ring-2 ring-[var(--lumeo-gold)]" : "hover:ring-1 hover:ring-[var(--text-primary)]/20"}`}
          style={{ backgroundColor: element.color === "white" ? "#ffffff" : "#000000" }}
        />
      ) : isLine ? (
        <svg className="h-full w-full overflow-visible" style={{ pointerEvents: "none" }}>
          <line x1="0" y1="0" x2="100%" y2="100%" stroke={element.color} strokeWidth={2} strokeOpacity={element.opacity} />
        </svg>
      ) : (
        <div
          className={`h-full w-full rounded-sm ${selected ? "ring-2 ring-[var(--lumeo-gold)]" : "hover:ring-1 hover:ring-[var(--text-primary)]/20"}`}
          style={{
            backgroundColor: element.color,
            opacity: element.opacity,
            borderRadius: element.shapeKind === "ellipse" ? "50%" : undefined,
          }}
        />
      )}

      {selected ? (
        <>
          <div className="absolute -top-9 left-1/2 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full border border-[var(--text-primary)]/14 bg-[var(--atelier-surface-1)]/96 px-1.5 py-1 shadow-lg">
            <button
              type="button"
              data-handle="delete"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                onDelete();
              }}
              aria-label="Delete"
              className="grid h-6 w-6 place-items-center rounded-full text-xs text-[var(--text-danger)]/80 transition hover:bg-[var(--text-danger)]/10 hover:text-[var(--text-danger)]"
            >
              ✕
            </button>
          </div>

          {resizable && isLine ? (
            <>
              <div
                data-handle="resize-start"
                onPointerDown={handleResizeStart("start")}
                className="absolute -left-1.5 -top-1.5 h-3.5 w-3.5 cursor-move rounded-full border-2 border-[var(--lumeo-gold)] bg-[var(--atelier-surface-1)]"
              />
              <div
                data-handle="resize-end"
                onPointerDown={handleResizeStart("end")}
                className="absolute -bottom-1.5 -right-1.5 h-3.5 w-3.5 cursor-move rounded-full border-2 border-[var(--lumeo-gold)] bg-[var(--atelier-surface-1)]"
              />
            </>
          ) : resizable ? (
            <div
              data-handle="resize-end"
              onPointerDown={handleResizeStart("end")}
              className="absolute -bottom-1.5 -right-1.5 h-3.5 w-3.5 cursor-nwse-resize rounded-full border-2 border-[var(--lumeo-gold)] bg-[var(--atelier-surface-1)]"
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Lint**

Run: `npm exec eslint -- components/pdf/edit/EditElementView.tsx`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add components/pdf/edit/EditElementView.tsx
git commit -m "feat(edit-pdf): add placed-element view with select/move/resize"
```

---

### Task 5: Main Edit PDF tool component

**Files:**
- Create: `components/pdf/EditPdfTool.tsx`

**Interfaces:**
- Consumes: `EditElement`, `createTextElement`, `createShapeElement`, `createWhiteoutElement`, `createInkElement`, `patchElement`, `deleteElement`, `elementsForPage` from `@/lib/pdf/edit/elements`; `exportEditedPdf` from `@/lib/pdf/edit/export`; `EditElementView` from `@/components/pdf/edit/EditElementView`; `InkCanvas` from `@/components/pdf/edit/InkCanvas`; `useHistoryState` from `@/lib/sign/useHistoryState`; `openPdfJsDocument` from `@/lib/pdf/pdfjs`; `copyArrayBuffer` from `@/lib/pdf/arrayBuffer`; `checkPdfFileSize`, `hasPdfMagicBytes`, `isPdfNamedFile` from `@/lib/pdf/uploadValidation`; `sanitizeFileStem` from `@/lib/pdf/sanitizeFileName`; workspace primitives (`L2ToolWorkspace`, `L2ToolMainColumn`, `L2ToolSettingsPanel`, `L2ActionArea`, `L2FileCard`, `L2UploadStage`) from `@/components/pdf/workspace/ToolWorkspace`; `useAnalytics` from `@/components/analytics/AnalyticsProvider`; `shouldAttemptOnce` from `@/lib/analytics/state`.
- Produces: default export `EditPdfTool()` — the full tool page component, dynamically imported by `app/pdf/edit/page.tsx` in Task 6.

- [ ] **Step 1: Write the implementation**

No unit test — full orchestrator component (upload, pdfjs rendering, undo/redo wiring, export). Verified via lint, `npm run build`, and manual browser check in Task 7.

Create `components/pdf/EditPdfTool.tsx`:

```tsx
"use client";

// components/pdf/EditPdfTool.tsx
//
// Edit PDF workspace -- generalizes SignPdfTool's architecture (pdfjs page
// render -> percent-based HTML overlay for placed elements -> pdf-lib
// flatten on export) to four element types: text, freehand ink, shapes
// (rect/ellipse/line/highlight), and whiteout/redaction boxes.
//
// Explicitly out of scope, per the approved design spec: signatures (use
// Sign PDF), page management -- rotate/reorder/delete/duplicate/merge/split
// (use Page Re-Order / Merge / Split), watermarking (its own future tool),
// multi-select, true content-stripping redaction, vector-path ink.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useAnalytics } from "@/components/analytics/AnalyticsProvider";
import {
  L2ActionArea,
  L2FileCard,
  L2ToolMainColumn,
  L2ToolSettingsPanel,
  L2ToolWorkspace,
  L2UploadStage,
} from "@/components/pdf/workspace/ToolWorkspace";
import { EditElementView } from "@/components/pdf/edit/EditElementView";
import { InkCanvas } from "@/components/pdf/edit/InkCanvas";
import { FileIcon } from "@/components/ui/FileIcon";
import { shouldAttemptOnce } from "@/lib/analytics/state";
import {
  canResizeElement,
  createInkElement,
  createShapeElement,
  createTextElement,
  createWhiteoutElement,
  deleteElement,
  elementsForPage,
  patchElement,
  type EditElement,
  type ShapeKind,
} from "@/lib/pdf/edit/elements";
import { exportEditedPdf } from "@/lib/pdf/edit/export";
import { useHistoryState } from "@/lib/sign/useHistoryState";
import { openPdfJsDocument } from "@/lib/pdf/pdfjs";
import { formatBytes as formatFileSize } from "@/lib/pdf/formatBytes";
import { sanitizeFileStem } from "@/lib/pdf/sanitizeFileName";
import { copyArrayBuffer } from "@/lib/pdf/arrayBuffer";
import { hasPdfMagicBytes, isPdfNamedFile, checkPdfFileSize } from "@/lib/pdf/uploadValidation";

type ActiveTool = "select" | "text" | "draw" | "shape" | "whiteout";

type LoadedPdf = { file: File; bytes: ArrayBuffer; pageCount: number };

const PAGE_RENDER_SCALE = 1.3;
const EXPORT_TIMEOUT_MS = 30_000;
const DEFAULT_SHAPE_KIND: ShapeKind = "rect";

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || target.isContentEditable;
}

async function runWithTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timeoutId = setTimeout(() => reject(new Error(message)), EXPORT_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

function sanitizePdfFileName(value: string, fallback = "lumeo-edited") {
  const stem = sanitizeFileStem(value.replace(/\.pdf$/i, ""), fallback);
  return `${stem}.pdf`;
}

function EditIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" className="h-8 w-8" fill="none">
      <path d="M8 22.5 20 10.5l3 3L11 25.5H8v-3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M18.5 12 21 14.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

export default function EditPdfTool() {
  const { availability, track } = useAnalytics();
  const openedTrackedRef = useRef(false);

  const [pdf, setPdf] = useState<LoadedPdf | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageImageUrl, setPageImageUrl] = useState("");
  const [pageDisplaySize, setPageDisplaySize] = useState<{ width: number; height: number } | null>(null);
  const [pageLoading, setPageLoading] = useState(false);
  const [error, setError] = useState("");

  const { state: elements, set: setElements, undo, redo, canUndo, canRedo, reset: resetElements } = useHistoryState<EditElement[]>([]);
  const elementIdCounterRef = useRef(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [activeTool, setActiveTool] = useState<ActiveTool>("select");
  const [shapeKind, setShapeKind] = useState<ShapeKind>(DEFAULT_SHAPE_KIND);
  const [inkColor, setInkColor] = useState("#12141a");
  const [inkStrokeWidth, setInkStrokeWidth] = useState(3);
  const [zoom, setZoom] = useState(1);

  const [isExporting, setIsExporting] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState("");
  const [downloadName, setDownloadName] = useState("lumeo-edited.pdf");
  const [outputName, setOutputName] = useState("lumeo-edited.pdf");

  const stageRef = useRef<HTMLDivElement | null>(null);
  const pageImageUrlRef = useRef("");
  const downloadUrlRef = useRef("");
  const pdfJsDocRef = useRef<PDFDocumentProxy | null>(null);
  const [docReady, setDocReady] = useState(0);

  useEffect(() => {
    if (!shouldAttemptOnce({ availability, alreadyAccepted: openedTrackedRef.current })) return;
    const result = track({ eventName: "tool_opened", toolSlug: "edit" });
    if (result.accepted) openedTrackedRef.current = true;
  }, [availability, track]);

  useEffect(() => {
    return () => {
      if (pageImageUrlRef.current) URL.revokeObjectURL(pageImageUrlRef.current);
      if (downloadUrlRef.current) URL.revokeObjectURL(downloadUrlRef.current);
      void (pdfJsDocRef.current as (PDFDocumentProxy & { destroy?: () => Promise<void> | void }) | null)?.destroy?.();
    };
  }, []);

  // Opens the source PDF via pdfjs once per uploaded file, kept open for the
  // per-page preview effect below to reuse (no re-parsing on page turns).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const previousDoc = pdfJsDocRef.current;
      pdfJsDocRef.current = null;
      setDocReady(0);
      if (previousDoc) void (previousDoc as PDFDocumentProxy & { destroy?: () => Promise<void> | void }).destroy?.();

      if (!pdf) return;
      try {
        const doc = await openPdfJsDocument(new Uint8Array(copyArrayBuffer(pdf.bytes)));
        if (cancelled) {
          void (doc as PDFDocumentProxy & { destroy?: () => Promise<void> | void }).destroy?.();
          return;
        }
        pdfJsDocRef.current = doc;
        setDocReady((current) => current + 1);
      } catch {
        setError("This file could not be read for preview.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdf]);

  // Renders the current page to a background image for the placement stage.
  useEffect(() => {
    if (!pdf || !pdfJsDocRef.current) return;
    const doc = pdfJsDocRef.current;
    let cancelled = false;

    void (async () => {
      setPageLoading(true);
      try {
        const page = await doc.getPage(pageIndex + 1);
        const viewport = page.getViewport({ scale: PAGE_RENDER_SCALE });
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) return;
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        context.fillStyle = "#FFFFFF";
        context.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvas, canvasContext: context, viewport }).promise;

        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
        if (cancelled || !blob) return;
        if (pageImageUrlRef.current) URL.revokeObjectURL(pageImageUrlRef.current);
        const url = URL.createObjectURL(blob);
        pageImageUrlRef.current = url;
        setPageImageUrl(url);
        setPageDisplaySize({ width: canvas.width, height: canvas.height });
      } catch {
        setError("This page could not be previewed. Try a different page.");
      } finally {
        if (!cancelled) setPageLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pdf, pageIndex, docReady]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) return;
      const command = event.ctrlKey || event.metaKey;
      if (command && event.key.toLowerCase() === "z" && event.shiftKey) {
        event.preventDefault();
        redo();
      } else if (command && event.key.toLowerCase() === "z") {
        event.preventDefault();
        undo();
      } else if (command && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
      } else if ((event.key === "Delete" || event.key === "Backspace") && selectedId) {
        event.preventDefault();
        setElements((current) => deleteElement(current, selectedId));
        setSelectedId(null);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [redo, undo, selectedId, setElements]);

  async function addFile(files: FileList | File[]) {
    setError("");
    const file = Array.from(files)[0];
    if (!file) return;

    if (!isPdfNamedFile(file)) {
      setError("Please choose a PDF file.");
      return;
    }
    const sizeError = checkPdfFileSize(file);
    if (sizeError) {
      setError(sizeError);
      return;
    }

    try {
      const bytes = await file.arrayBuffer();
      if (!hasPdfMagicBytes(bytes)) {
        setError("This doesn't look like a valid PDF file.");
        return;
      }
      // A lightweight pdfjs open (already done in the effect above once
      // `pdf` state is set) validates the page count; here we just need
      // pageCount up front for the Next/Prev bounds, so open once via pdfjs.
      const doc = await openPdfJsDocument(new Uint8Array(copyArrayBuffer(bytes)));
      const pageCount = doc.numPages;
      void (doc as PDFDocumentProxy & { destroy?: () => Promise<void> | void }).destroy?.();

      setPdf({ file, bytes, pageCount });
      setPageIndex(0);
      resetElements([]);
      setSelectedId(null);
      setDownloadUrl("");
    } catch (uploadError) {
      const message =
        uploadError instanceof Error && /password|encrypt/i.test(uploadError.message)
          ? "This file appears to be password-protected or encrypted."
          : "This file could not be read. It may be damaged or password-protected.";
      setError(message);
    }
  }

  function nextElementId() {
    elementIdCounterRef.current += 1;
    return `el-${elementIdCounterRef.current}`;
  }

  function handleStageClick(event: React.MouseEvent<HTMLDivElement>) {
    if (activeTool === "select" || activeTool === "draw") return;
    if ((event.target as HTMLElement).closest('[role="button"]')) return;
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    const xPct = ((event.clientX - rect.left) / rect.width) * 100;
    const yPct = ((event.clientY - rect.top) / rect.height) * 100;
    const id = nextElementId();

    let element: EditElement;
    if (activeTool === "text") element = createTextElement(id, pageIndex, xPct, yPct);
    else if (activeTool === "shape") element = createShapeElement(id, pageIndex, xPct, yPct, shapeKind);
    else element = createWhiteoutElement(id, pageIndex, xPct, yPct);

    setElements((current) => [...current, element]);
    setSelectedId(id);
    setActiveTool("select");
  }

  function handleInkStroke(result: { pngDataUrl: string; xPct: number; yPct: number; widthPct: number; heightPct: number }) {
    const id = nextElementId();
    const element = createInkElement(id, pageIndex, result.xPct, result.yPct, result.widthPct, result.heightPct, result.pngDataUrl);
    setElements((current) => [...current, element]);
  }

  const currentPageElements = useMemo(() => elementsForPage(elements, pageIndex), [elements, pageIndex]);
  const selectedElement = useMemo(() => elements.find((item) => item.id === selectedId) ?? null, [elements, selectedId]);

  const generateEditedPdf = useCallback(async () => {
    if (!pdf) return;
    setIsExporting(true);
    setError("");
    const startedAt = performance.now();
    track({ eventName: "processing_started", toolSlug: "edit" });

    try {
      const { bytes, skippedPages } = await runWithTimeout(
        exportEditedPdf(copyArrayBuffer(pdf.bytes), elements),
        "Generating the PDF took too long. Try fewer elements or a smaller file.",
      );
      if (skippedPages.length > 0) {
        setError(`Page${skippedPages.length === 1 ? "" : "s"} ${skippedPages.map((p) => p + 1).join(", ")} could not be updated and were left unchanged.`);
      }
      const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      const blob = new Blob([buffer], { type: "application/pdf" });
      if (downloadUrlRef.current) URL.revokeObjectURL(downloadUrlRef.current);
      const url = URL.createObjectURL(blob);
      downloadUrlRef.current = url;
      setDownloadUrl(url);
      setDownloadName(sanitizePdfFileName(outputName));
      track({ eventName: "processing_succeeded", toolSlug: "edit", durationMs: performance.now() - startedAt, success: true });
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Could not export the PDF. Please try again.");
      track({ eventName: "processing_failed", toolSlug: "edit", durationMs: performance.now() - startedAt, success: false, errorCode: "processing_error" });
    } finally {
      setIsExporting(false);
    }
  }, [pdf, elements, outputName, track]);

  function downloadEditedPdf() {
    if (!downloadUrl) return;
    track({ eventName: "download_started", toolSlug: "edit" });
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = downloadName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  if (!pdf) {
    return (
      <section className="l2-tool-empty-state grid gap-4 pb-4 lg:pb-0">
        <div className="mx-auto w-full max-w-[1040px]">
          <L2UploadStage
            inputId="edit-pdf-upload"
            accept="application/pdf,.pdf"
            acceptedNote="PDF only · One file"
            multiple={false}
            icon={<EditIcon />}
            buttonLabel="Select PDF"
            onFilesSelected={(files) => void addFile(files)}
          />
        </div>
        {error ? (
          <div role="alert" className="mt-4 rounded-lg border border-[var(--border-danger)]/20 bg-[var(--surface-danger)]/10 p-4 text-sm font-medium text-[var(--text-danger)]">
            {error}
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <section className="l2-tool-deep-workspace pb-4 lg:pb-0">
      <L2ToolWorkspace>
        <L2ToolMainColumn>
          <section className="rounded-xl border border-[var(--text-primary)]/12 bg-gradient-to-br from-[var(--atelier-surface-3)] via-[var(--atelier-surface-2)] to-[var(--atelier-surface-1)] p-3 shadow-2xl shadow-black/28">
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
              <L2FileCard icon={<FileIcon />} name={pdf.file.name} meta={`${pdf.pageCount} page${pdf.pageCount === 1 ? "" : "s"} · ${formatFileSize(pdf.file.size)}`} />
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)" className="rounded-full border border-[var(--text-primary)]/12 px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)]/58 transition hover:border-[var(--text-primary)]/24 disabled:opacity-30">
                  Undo
                </button>
                <button type="button" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Y)" className="rounded-full border border-[var(--text-primary)]/12 px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)]/58 transition hover:border-[var(--text-primary)]/24 disabled:opacity-30">
                  Redo
                </button>
                <button type="button" onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))} title="Zoom out" className="rounded-full border border-[var(--text-primary)]/12 px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)]/58 transition hover:border-[var(--text-primary)]/24">
                  −
                </button>
                <span className="text-xs font-semibold text-[var(--text-primary)]/58">{Math.round(zoom * 100)}%</span>
                <button type="button" onClick={() => setZoom((z) => Math.min(2, z + 0.1))} title="Zoom in" className="rounded-full border border-[var(--text-primary)]/12 px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)]/58 transition hover:border-[var(--text-primary)]/24">
                  +
                </button>
                <button type="button" onClick={() => setZoom(1)} title="Fit width" className="rounded-full border border-[var(--text-primary)]/12 px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)]/58 transition hover:border-[var(--text-primary)]/24">
                  Fit
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--text-primary)]/10 bg-[var(--atelier-surface-1)]/60 px-3 py-2">
              <button type="button" disabled={pageIndex === 0} onClick={() => setPageIndex((c) => Math.max(0, c - 1))} className="rounded-full border border-[var(--text-primary)]/14 px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)]/70 transition hover:border-[var(--lumeo-gold)]/40 disabled:opacity-35">
                ← Prev
              </button>
              <span className="text-xs font-semibold text-[var(--text-primary)]/60">Page {pageIndex + 1} of {pdf.pageCount}</span>
              <button type="button" disabled={pageIndex === pdf.pageCount - 1} onClick={() => setPageIndex((c) => Math.min(pdf.pageCount - 1, c + 1))} className="rounded-full border border-[var(--text-primary)]/14 px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)]/70 transition hover:border-[var(--lumeo-gold)]/40 disabled:opacity-35">
                Next →
              </button>
            </div>
          </section>

          <section className="mt-3 rounded-xl border border-[var(--text-primary)]/12 bg-gradient-to-br from-[var(--atelier-surface-3)] via-[var(--atelier-surface-2)] to-[var(--atelier-surface-1)] p-3.5 shadow-2xl shadow-black/24">
            {pageLoading || !pageImageUrl || !pageDisplaySize ? (
              <div className="flex h-64 items-center justify-center rounded-lg border border-[var(--text-primary)]/10 bg-[var(--atelier-surface-1)]/40 text-sm text-[var(--text-primary)]/40">
                Loading page preview...
              </div>
            ) : (
              <div className="mx-auto" style={{ width: `${zoom * 100}%` }}>
                <div
                  ref={stageRef}
                  onClick={handleStageClick}
                  className={`relative mx-auto max-h-[32rem] w-full overflow-hidden rounded-lg border border-[var(--text-primary)]/12 bg-white ${activeTool !== "select" && activeTool !== "draw" ? "cursor-crosshair" : ""}`}
                  style={{ aspectRatio: `${pageDisplaySize.width} / ${pageDisplaySize.height}` }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={pageImageUrl} alt={`Page ${pageIndex + 1} preview`} className="pointer-events-none block h-full w-full select-none" />

                  {currentPageElements.map((element) => (
                    <EditElementView
                      key={element.id}
                      element={element}
                      selected={selectedId === element.id}
                      stageRef={stageRef}
                      onSelect={() => setSelectedId(element.id)}
                      onChange={(patch) => setElements((current) => patchElement(current, element.id, patch))}
                      onDelete={() => {
                        setElements((current) => deleteElement(current, element.id));
                        setSelectedId(null);
                      }}
                      onTextChange={(text) => setElements((current) => patchElement(current, element.id, { text } as Partial<EditElement>))}
                    />
                  ))}

                  {activeTool === "draw" && pageDisplaySize ? (
                    <InkCanvas
                      stageWidthPx={pageDisplaySize.width}
                      stageHeightPx={pageDisplaySize.height}
                      color={inkColor}
                      strokeWidthPx={inkStrokeWidth}
                      onStrokeComplete={handleInkStroke}
                    />
                  ) : null}
                </div>
              </div>
            )}
          </section>

          {error ? (
            <div role="alert" className="mt-3 rounded-lg border border-[var(--border-danger)]/20 bg-[var(--surface-danger)]/10 p-4 text-sm font-medium text-[var(--text-danger)]">
              {error}
            </div>
          ) : null}
        </L2ToolMainColumn>

        <L2ToolSettingsPanel title="Tools" description="Pick a tool, then click the page to place it.">
          <div className="flex h-full min-h-0 flex-col">
            <div className="grid grid-cols-5 gap-1.5">
              {(["select", "text", "draw", "shape", "whiteout"] as ActiveTool[]).map((tool) => (
                <button
                  key={tool}
                  type="button"
                  onClick={() => setActiveTool(tool)}
                  className={`rounded-lg border px-2 py-2 text-[11px] font-bold capitalize transition ${activeTool === tool ? "border-[var(--lumeo-gold)] bg-[var(--lumeo-gold)]/10 text-[var(--text-primary)]" : "border-[var(--text-primary)]/12 text-[var(--text-primary)]/60 hover:border-[var(--text-primary)]/24"}`}
                >
                  {tool}
                </button>
              ))}
            </div>

            {activeTool === "shape" ? (
              <div className="mt-3 grid grid-cols-4 gap-1.5">
                {(["rect", "ellipse", "line", "highlight"] as ShapeKind[]).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => setShapeKind(kind)}
                    className={`rounded-lg border px-2 py-1.5 text-[10px] font-bold capitalize transition ${shapeKind === kind ? "border-[var(--lumeo-gold)] bg-[var(--lumeo-gold)]/10" : "border-[var(--text-primary)]/12 text-[var(--text-primary)]/60"}`}
                  >
                    {kind}
                  </button>
                ))}
              </div>
            ) : null}

            {activeTool === "draw" ? (
              <div className="mt-3 grid gap-2">
                <label className="flex items-center justify-between text-xs font-semibold text-[var(--text-primary)]/60">
                  Color
                  <input type="color" value={inkColor} onChange={(e) => setInkColor(e.target.value)} className="h-7 w-10 rounded border border-[var(--text-primary)]/14" />
                </label>
                <label className="flex items-center justify-between text-xs font-semibold text-[var(--text-primary)]/60">
                  Thickness
                  <input type="range" min={1} max={10} value={inkStrokeWidth} onChange={(e) => setInkStrokeWidth(Number(e.target.value))} className="w-24" />
                </label>
              </div>
            ) : null}

            {activeTool === "whiteout" ? (
              <p className="mt-3 rounded-lg border border-[var(--text-primary)]/12 bg-[var(--text-primary)]/[0.04] p-2.5 text-[11px] leading-5 text-[var(--text-primary)]/60">
                Whiteout hides content visually in the exported PDF. For documents with legal or compliance requirements, verify the underlying content is also removed before sharing.
              </p>
            ) : null}

            {selectedElement && selectedElement.type === "text" ? (
              <div className="mt-3 grid gap-2 border-t border-[var(--text-primary)]/10 pt-3">
                <label className="flex items-center justify-between text-xs font-semibold text-[var(--text-primary)]/60">
                  Font size
                  <input
                    type="number"
                    min={8}
                    max={72}
                    value={selectedElement.fontSizePt}
                    onChange={(e) => setElements((current) => patchElement(current, selectedElement.id, { fontSizePt: Number(e.target.value) } as Partial<EditElement>))}
                    className="w-16 rounded border border-[var(--text-primary)]/14 bg-transparent px-2 py-1 text-right"
                  />
                </label>
                <label className="flex items-center justify-between text-xs font-semibold text-[var(--text-primary)]/60">
                  Color
                  <input
                    type="color"
                    value={selectedElement.color}
                    onChange={(e) => setElements((current) => patchElement(current, selectedElement.id, { color: e.target.value } as Partial<EditElement>))}
                    className="h-7 w-10 rounded border border-[var(--text-primary)]/14"
                  />
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setElements((current) => patchElement(current, selectedElement.id, { bold: !selectedElement.bold } as Partial<EditElement>))}
                    className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-bold transition ${selectedElement.bold ? "border-[var(--lumeo-gold)] bg-[var(--lumeo-gold)]/10" : "border-[var(--text-primary)]/12"}`}
                  >
                    Bold
                  </button>
                  <button
                    type="button"
                    onClick={() => setElements((current) => patchElement(current, selectedElement.id, { italic: !selectedElement.italic } as Partial<EditElement>))}
                    className={`flex-1 rounded-lg border px-2 py-1.5 text-xs italic transition ${selectedElement.italic ? "border-[var(--lumeo-gold)] bg-[var(--lumeo-gold)]/10" : "border-[var(--text-primary)]/12"}`}
                  >
                    Italic
                  </button>
                </div>
              </div>
            ) : null}

            <div className="mt-auto border-t border-[var(--text-primary)]/10 pt-3">
              <label className="block rounded-lg border border-[var(--text-primary)]/10 bg-[var(--atelier-surface-1)]/50 p-2.5">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-primary)]/34">File name</span>
                <input
                  value={outputName}
                  onChange={(e) => {
                    setOutputName(e.target.value);
                    setDownloadUrl("");
                  }}
                  className="mt-1.5 w-full rounded-md border border-transparent bg-transparent px-0 py-1 text-sm font-semibold text-[var(--text-primary)] outline-none placeholder:text-[var(--text-primary)]/26 focus:border-b-[var(--lumeo-gold)]/45"
                  placeholder="lumeo-edited.pdf"
                />
              </label>

              <div className="mt-3">
                {downloadUrl ? (
                  <L2ActionArea
                    primary={
                      <button type="button" onClick={downloadEditedPdf} className="lumeo-primary-action w-full rounded-[var(--radius-md)] bg-[var(--emerald-600)] px-5 py-2.5 text-sm font-semibold text-[var(--text-on-accent)] transition hover:-translate-y-0.5 hover:bg-[var(--emerald-500)]">
                        Download edited PDF
                      </button>
                    }
                  />
                ) : (
                  <L2ActionArea
                    primary={
                      <button
                        type="button"
                        disabled={elements.length === 0 || isExporting}
                        onClick={() => void generateEditedPdf()}
                        className="lumeo-primary-action w-full rounded-[var(--radius-md)] bg-[var(--emerald-600)] px-5 py-2.5 text-sm font-semibold text-[var(--text-on-accent)] transition hover:-translate-y-0.5 hover:bg-[var(--emerald-500)] disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        {isExporting ? "Exporting..." : "Export PDF"}
                      </button>
                    }
                  />
                )}
              </div>
            </div>
          </div>
        </L2ToolSettingsPanel>
      </L2ToolWorkspace>
    </section>
  );
}
```

- [ ] **Step 2: Lint**

Run: `npm exec eslint -- components/pdf/EditPdfTool.tsx`
Expected: no output (fix any reported issues before proceeding — e.g. unused imports).

- [ ] **Step 3: Commit**

```bash
git add components/pdf/EditPdfTool.tsx
git commit -m "feat(edit-pdf): add main Edit PDF tool component"
```

---

### Task 6: Page wrapper, catalog, admin, registry, FAQ, and schema wiring

**Files:**
- Create: `app/pdf/edit/page.tsx`
- Create: `supabase/migrations/20260726001_seed_edit_pdf_tool.sql`
- Modify: `lib/tools/catalog.ts`
- Modify: `components/pdf/PdfToolRegistry.tsx`
- Modify: `components/pdf/toolFaqs.ts`
- Modify: `app/guides/page.tsx`
- Modify: `.github/workflows/lumeo-ci.yml`
- Modify: `scripts/verify-public-routes.mjs`
- Modify: `tests/pdf-tool-catalog-wiring.test.ts`

**Interfaces:**
- Consumes: `EditPdfTool` (default export) from Task 5; `buildSoftwareApplicationSchema`, `buildBreadcrumbSchema` from `@/lib/public-site/schema`; `getToolBlockedState` from `@/lib/tools/tool-status`; `withSeoOverride` from `@/lib/public-site/seo`.

- [ ] **Step 1: Create the tool page**

Create `app/pdf/edit/page.tsx`:

```tsx
import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { PublicCatalogPageShell } from "@/components/public/PublicCatalogPageShell";
import { L2ToolPageHeader, ToolWorkspaceLoading } from "@/components/pdf/workspace/ToolWorkspace";
import { ToolMaintenanceNotice } from "@/components/pdf/ToolMaintenanceNotice";
import { getToolBlockedState } from "@/lib/tools/tool-status";
import { withSeoOverride } from "@/lib/public-site/seo";
import { buildBreadcrumbSchema, buildSoftwareApplicationSchema } from "@/lib/public-site/schema";

const EditPdfTool = dynamic(() => import("@/components/pdf/EditPdfTool"), {
  loading: () => <ToolWorkspaceLoading />,
});

const softwareSchema = buildSoftwareApplicationSchema({
  name: "Lumeo Edit PDF",
  description: "Add text, freehand drawing, shapes, and whiteout boxes to a PDF, privately in your browser.",
  path: "/pdf/edit",
  featureList: ["Click-to-type text", "Freehand ink", "Shapes and highlight", "Whiteout boxes", "No file upload"],
});
const breadcrumbSchema = buildBreadcrumbSchema([
  { name: "Home", path: "/" },
  { name: "PDF Tools", path: "/pdf-tools" },
  { name: "Edit PDF", path: "/pdf/edit" },
]);

export async function generateMetadata(): Promise<Metadata> {
  return withSeoOverride("/pdf/edit", {
    title: { absolute: "Edit PDF Online Privately - Text, Draw, Shapes & Whiteout" },
    description: "Add text, freehand drawing, shapes, and whiteout boxes to a PDF privately in your browser. No uploads, nothing leaves your device.",
    alternates: { canonical: "/pdf/edit" },
    openGraph: {
      title: "Edit PDF Online Privately - Lumeo PDF",
      description: "Type, draw, and mark up a PDF in a calm browser-first workspace.",
      url: "https://lumeo.in/pdf/edit",
      siteName: "Lumeo PDF",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: "Edit PDF Online Privately - Lumeo PDF",
      description: "Add text, drawing, shapes, and whiteout boxes to a PDF directly in your browser.",
    },
  });
}

export default async function EditPdfPage() {
  const toolState = await getToolBlockedState("edit");

  return (
    <PublicCatalogPageShell
      maxWidth="max-w-[1240px]"
      mainClassName="min-h-dvh bg-[var(--surface-canvas)] text-[var(--text-primary)]"
      contentClassName="px-5 pb-12 pt-7 sm:px-8 sm:pb-14 sm:pt-9"
    >
      <L2ToolPageHeader title="Edit PDF" description="Add text, drawing, shapes, and whiteout boxes to a PDF." />

      {toolState.blocked ? (
        <ToolMaintenanceNotice status={toolState.status} message={toolState.message} />
      ) : (
        <div className="l2-live-tool-workspace lumeo-fade-up lumeo-fade-up-delay-1 aura-live-tool"><EditPdfTool /></div>
      )}

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
    </PublicCatalogPageShell>
  );
}
```

- [ ] **Step 2: Add the catalog action**

In `lib/tools/catalog.ts`, modify the `inscribe` entry (currently `availability: "soon"` with no `primaryRoute`):

```ts
  {
    key: "inscribe",
    name: "Inscribe",
    plain: "Edit & annotate",
    tag: "Type, highlight, stamp and mark up any page.",
    processing: "browser",
    availability: "available",
    primaryRoute: "/pdf/edit",
    actions: [
      { label: "Edit PDF", slug: "edit", route: "/pdf/edit", live: true },
      { label: "Images", slug: "add-images", live: false },
      { label: "Watermark", slug: "watermark", live: false },
      { label: "Page numbers", slug: "page-numbers", live: false },
      { label: "Header & footer", slug: "header-footer", live: false },
      { label: "Crop", slug: "crop", live: false },
      { label: "Bookmarks", slug: "bookmarks", live: false },
    ],
  },
```

Note: `processing` changes from `"hybrid"` to `"browser"` (Edit PDF is 100% client-side, no server round trip) and the placeholder `"Add text"`/`"Shapes"`/`"Highlight"` slugs are removed since "Edit PDF" now covers all three live. `"Images"` (drag-drop image insertion, not part of this scope) stays a placeholder.

- [ ] **Step 3: Add the admin DB seed migration**

Create `supabase/migrations/20260726001_seed_edit_pdf_tool.sql`:

```sql
begin;

do $$
begin
  if to_regclass('public.pdf_tools') is null then
    raise exception 'Missing required table public.pdf_tools. Run 20260712002_control_center_foundation.sql before this migration.';
  end if;
end;
$$;

-- Edit PDF is a new live tool (text/draw/shapes/whiteout, flattened via
-- pdf-lib) with no existing tool_categories row for its Inscribe category --
-- following the same precedent as the "sign" row seeded in
-- 20260725001_seed_missing_pdf_tools.sql, category_id is left null rather
-- than inventing a new category row out of scope for this change.
insert into public.pdf_tools (slug, category_id, name, short_description, route, icon_key, status, is_enabled, is_homepage_eligible, sort_order)
values
  ('edit', null, 'Edit PDF', 'Add text, freehand drawing, shapes, and whiteout boxes to a PDF.', '/pdf/edit', 'edit', 'active', true, true, 0)
on conflict (slug) do update
set category_id = excluded.category_id,
    name = excluded.name,
    short_description = excluded.short_description,
    route = excluded.route,
    icon_key = excluded.icon_key,
    status = excluded.status,
    is_enabled = excluded.is_enabled,
    is_homepage_eligible = excluded.is_homepage_eligible,
    updated_at = now();

commit;
```

- [ ] **Step 4: Add the PdfToolRegistry entry**

In `components/pdf/PdfToolRegistry.tsx`:

Modify the `PdfToolSlug` union to add `"edit"`:

```ts
export type PdfToolSlug =
  | "merge"
  | "split"
  | "compress"
  | "jpg-to-pdf"
  | "pdf-to-jpg"
  | "sign"
  | "word-to-pdf"
  | "pdf-to-word"
  | "organize"
  | "html-to-pdf"
  | "extract-text"
  | "edit";
```

Add a new entry to the `pdfTools` array (after the `"extract-text"` entry):

```ts
  {
    slug: "edit",
    title: "Edit PDF",
    shortTitle: "Edit PDF",
    description: "Add text, freehand drawing, shapes, and whiteout boxes to a PDF.",
    route: "/pdf/edit",
    status: "live",
    browserNote: "Browser-first editing",
    engineNote: "Live now",
    accepted: "one PDF file",
    bullets: [
      "Click-to-type text boxes",
      "Freehand ink with adjustable color and thickness",
      "Rectangle, ellipse, line, and highlight shapes",
      "Whiteout boxes (visual only)",
      "Undo/redo",
    ],
  },
```

- [ ] **Step 5: Add FAQ copy**

In `components/pdf/toolFaqs.ts`, add a new exported array (after `htmlToPdfFaqs`, before `signFaqs`):

```ts
export const editPdfFaqs: FaqItem[] = [
  {
    question: "Does whiteout actually remove the underlying content?",
    answer:
      "No -- whiteout in Edit PDF hides content visually in the exported PDF, it does not strip the underlying text or image data. For documents with legal or compliance requirements, verify the underlying content is also removed before sharing.",
  },
  {
    question: "Can I resize a shape or text box after placing it?",
    answer: "Yes. Select it and drag the corner handle (or either endpoint, for a line) to resize. Freehand ink strokes can be moved and deleted, but not resized.",
  },
  {
    question: "Can I edit an existing signature or reorganize pages with this tool?",
    answer: "No -- use Sign PDF for signatures and Page Re-Order for rotating, reordering, or deleting pages. Edit PDF focuses on adding text, drawing, shapes, and whiteout boxes.",
  },
];
```

- [ ] **Step 6: Update `/guides`**

In `app/guides/page.tsx`, add `editPdfFaqs` to the import from `@/components/pdf/toolFaqs` and to the `allFaqs` array, add an `editPdfFaqs`-based `FaqGroup`, and add a `ToolGuide` card. Add to the import list:

```ts
import {
  compressFaqs,
  editPdfFaqs,
  extractTextFaqs,
  htmlToPdfFaqs,
  jpgToPdfFaqs,
  mergeFaqs,
  organizeFaqs,
  pdfToJpgFaqs,
  pdfToWordFaqs,
  privacyFaqs,
  signFaqs,
  splitFaqs,
  wordToPdfFaqs,
} from "@/components/pdf/toolFaqs";
```

Add `...editPdfFaqs,` into the `allFaqs` array (any position — order doesn't matter for the FAQPage schema).

Add a `ToolGuide` card in the "Current PDF tools" section (near the other Inscribe-adjacent tools, e.g. after the HTML to PDF card):

```tsx
        <ToolGuide
          title="Inscribe — Edit PDF"
          href="/pdf/edit"
          use="Add text, freehand drawing, shapes, and whiteout boxes to a PDF."
          workflow="Add one PDF, pick a tool, click the page to place an element, adjust or delete it, export."
          limitation="Whiteout is visual-only -- it does not strip the underlying text or image data."
        />
```

Add a `FaqGroup` near the end (before `Privacy questions`):

```tsx
      <FaqGroup title="Inscribe — Edit PDF questions" items={editPdfFaqs} />
```

- [ ] **Step 7: Add Edit PDF to CI's focused lint list and route verification**

In `.github/workflows/lumeo-ci.yml`, add `app/pdf/edit/page.tsx` to the `npm exec eslint` file list in the "Validate Lumeo PDF Workspace" job (alongside the other 11 tool pages).

In `scripts/verify-public-routes.mjs`, add `"/pdf/edit"` to the `routes` array.

- [ ] **Step 8: Extend the catalog wiring test**

In `tests/pdf-tool-catalog-wiring.test.ts`, add:

```ts
test("edit is live and routed to /pdf/edit", () => {
  const action = findAction("edit");
  assert.ok(action, "expected action edit to exist");
  assert.equal(action?.live, true);
  assert.equal(action?.route, "/pdf/edit");
});

test("PdfToolRegistry includes edit", () => {
  const registryContent = readFileSync("components/pdf/PdfToolRegistry.tsx", "utf8");
  assert.match(registryContent, /slug:\s*"edit"/);
});
```

- [ ] **Step 9: Run the full test suite**

Run: `node --no-warnings --test --experimental-strip-types tests/`
Expected: all tests pass, including the 2 new ones added in Step 8 and everything from Tasks 1-2.

- [ ] **Step 10: Lint everything touched this task**

Run:
```bash
npm exec eslint -- app/pdf/edit/page.tsx lib/tools/catalog.ts components/pdf/PdfToolRegistry.tsx components/pdf/toolFaqs.ts app/guides/page.tsx scripts/verify-public-routes.mjs tests/pdf-tool-catalog-wiring.test.ts
```
Expected: no output.

- [ ] **Step 11: Commit**

```bash
git add app/pdf/edit/page.tsx supabase/migrations/20260726001_seed_edit_pdf_tool.sql lib/tools/catalog.ts components/pdf/PdfToolRegistry.tsx components/pdf/toolFaqs.ts app/guides/page.tsx .github/workflows/lumeo-ci.yml scripts/verify-public-routes.mjs tests/pdf-tool-catalog-wiring.test.ts
git commit -m "feat(edit-pdf): wire Edit PDF into catalog, admin console, guides, and SEO"
```

---

### Task 7: Full build, test, and manual verification

**Files:** none created/modified — verification only.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all tests pass (the pre-existing 3 unrelated failures noted earlier this session — `aura-design-system.test.ts` and 2 analytics tests — are not touched by this feature and may still show; every Edit PDF-related test must pass).

- [ ] **Step 2: Run the full production build**

Run: `npm run build`
Expected: succeeds, `/pdf/edit` appears in the route list output.

- [ ] **Step 3: Manual browser verification**

Start the dev server and check, in order:
1. Navigate to `/pdf/edit` directly — page loads, title is "Edit PDF Online Privately...".
2. Upload a small multi-page PDF.
3. Select the Text tool, click the page — a text box appears and is immediately typeable.
4. Select the Draw tool, drag across the page — an ink stroke appears.
5. Select the Shape tool, try each of rect/ellipse/line/highlight — each places correctly, and the line's two endpoints are independently draggable when selected.
6. Select the Whiteout tool, place a box — the disclosure copy is visible in the right panel while that tool is active.
7. Select an existing element (Select tool) — drag to move, drag the corner handle to resize (endpoint handles for the line), press Delete to remove it.
8. Use Prev/Next to switch pages, add an element on page 2, confirm page 1's elements aren't visible on page 2.
9. Press Ctrl+Z / Ctrl+Y — confirm undo/redo works across adds, moves, and deletes.
10. Click "Export PDF", then "Download edited PDF" — open the downloaded file and confirm every placed element appears on the correct page, in roughly the right position.
11. Check the browser console for errors throughout.
12. View page source / inspect for the `SoftwareApplication` and `BreadcrumbList` `<script type="application/ld+json">` tags.
13. Confirm the homepage tile grid, "PDF Tools" nav dropdown, and `/pdf-tools/inscribe` category page all show "Edit PDF" linking to `/pdf/edit`.
14. In the admin console (`/admin/tools`), confirm the "Edit PDF" row appears, `active`, enabled, and that toggling it to `maintenance` blocks `/pdf/edit` with the maintenance notice (then toggle back to `active`).
15. Confirm `/guides` shows the new "Inscribe — Edit PDF" card and its FAQ group, and that no visible FAQ accordion appears on `/pdf/edit` itself.

- [ ] **Step 4: Fix anything found, re-verify, then final commit if any fixes were needed**

If any step in Step 3 surfaces a bug, fix it in the relevant file from Tasks 1-6, re-run the affected step, and commit the fix separately with a `fix(edit-pdf): ...` message.

## Self-review notes

- **Spec coverage:** every "In scope" bullet from the design spec has a corresponding task — element types (Task 1, 4, 5), select/move/resize/delete (Task 4), multi-page navigation (Task 5), undo/redo (Task 5, via `useHistoryState`), zoom (Task 5), export via `pdf-lib` (Task 2, 5), redaction disclosure copy (Task 5), catalog/admin/registry/FAQ/schema wiring (Task 6). Every "Explicitly out of scope" bullet has no corresponding task (verified by absence, not by an explicit "we didn't do X" comment cluttering the plan).
- **Type consistency:** `EditElement`, `ShapeKind`, `canResizeElement`, `isLineShape`, `patchElement`, `deleteElement`, `elementsForPage`, `createTextElement`/`createShapeElement`/`createWhiteoutElement`/`createInkElement` are defined once in Task 1 and referenced with identical names/signatures in Tasks 2, 4, 5, 6 — no renamed duplicates.
- **No placeholders:** every code step contains complete, runnable code; no "TODO" or "similar to Task N" shortcuts.
