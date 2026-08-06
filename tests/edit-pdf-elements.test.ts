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
  moveElementByArrowKey,
  patchElement,
  resizeElementByArrowKey,
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

// Phase 9.3 regression coverage: EditElementView.tsx's overlay elements
// (text/shape/whiteout/ink) previously had no keyboard-only way to move or
// resize -- only Delete/Backspace worked, unlike TextRunOverlay's full
// keyboard nav. moveElementByArrowKey/resizeElementByArrowKey are the pure
// clamping logic behind the new Arrow/Shift+Arrow handling; covered here
// since this project has no component-level test harness to exercise the
// key events themselves.
test("moveElementByArrowKey translates by the given delta", () => {
  const el = createTextElement("a", 0, 40, 45);
  const moved = moveElementByArrowKey(el, 5, -3);
  assert.equal(moved.xPct, 45);
  assert.equal(moved.yPct, 42);
});

test("moveElementByArrowKey clamps to the stage edges, never past 0 or 100 minus the element's own size", () => {
  const el = createTextElement("a", 0, 1, 98);
  const moved = moveElementByArrowKey(el, -5, 5);
  assert.equal(moved.xPct, 0, "should clamp at the left edge, not go negative");
  assert.equal(moved.yPct, 100 - el.heightPct, "should clamp so the element's bottom edge never exceeds 100%");
});

test("resizeElementByArrowKey grows/shrinks from the element's own top-left corner", () => {
  const el = createShapeElement("a", 0, 20, 20, "rect");
  const grown = resizeElementByArrowKey(el, 3, -2, 2);
  assert.equal(grown.widthPct, el.widthPct + 3);
  assert.equal(grown.heightPct, el.heightPct - 2);
});

test("resizeElementByArrowKey never shrinks below minSizePct", () => {
  const el = createShapeElement("a", 0, 20, 20, "rect");
  const shrunk = resizeElementByArrowKey(el, -1000, -1000, 2);
  assert.equal(shrunk.widthPct, 2);
  assert.equal(shrunk.heightPct, 2);
});

test("resizeElementByArrowKey never grows past the stage edge from the element's fixed xPct/yPct", () => {
  const el = createShapeElement("a", 0, 90, 85, "rect");
  const grown = resizeElementByArrowKey(el, 1000, 1000, 2);
  assert.equal(grown.widthPct, 100 - el.xPct);
  assert.equal(grown.heightPct, 100 - el.yPct);
});
