import assert from "node:assert/strict";
import test from "node:test";
import {
  appendPdfEditOperations,
  createPdfEditSession,
  deriveElementOperations,
  nativeTextOperation,
  pageOperation,
} from "../lib/pdf/edit/editSession.ts";
import { createShapeElement, createTextElement } from "../lib/pdf/edit/elements.ts";

test("PdfEditSession appends deterministic semantic operations without mutating prior state", () => {
  const initial = createPdfEditSession(2048);
  const next = appendPdfEditOperations(initial, [
    nativeTextOperation({
      pageIndex: 0,
      spanIds: ["p0-span-3"],
      contentStreamIndex: 0,
      formPath: null,
      operatorIndices: [5],
      fontResourceName: "F1",
      originalText: "Employee record",
      replacementText: "Employee file",
    }),
  ]);

  assert.equal(initial.operations.length, 0);
  assert.equal(initial.nextSequence, 1);
  assert.equal(next.sourceByteLength, 2048);
  assert.equal(next.operations.length, 1);
  assert.equal(next.operations[0].id, "edit-op-1");
  assert.equal(next.operations[0].kind, "replaceText");
  assert.equal(next.nextSequence, 2);
});

test("native deletion is represented explicitly instead of disguised as replacement", () => {
  const operation = nativeTextOperation({
    pageIndex: 2,
    spanIds: ["p2-span-0", "p2-span-1"],
    contentStreamIndex: 1,
    formPath: null,
    operatorIndices: [8, 9],
    fontResourceName: "F4",
    originalText: "Delete me",
    replacementText: "",
  });
  assert.equal(operation.kind, "deleteText");
  if (operation.kind === "deleteText") {
    assert.equal(operation.originalText, "Delete me");
    assert.equal(operation.target.kind, "native-text");
    if (operation.target.kind === "native-text") {
      assert.deepEqual(operation.target.operatorIndices, [8, 9]);
    }
  }
});

test("overlay transitions classify insert text, text replacement, style and geometry independently", () => {
  const originalText = createTextElement("t1", 0, 10, 20);
  const inserted = createTextElement("t2", 0, 50, 40);
  const changed = {
    ...originalText,
    text: "Changed",
    xPct: 12,
    fontSizePt: 18,
    bold: true,
  };

  const operations = deriveElementOperations(
    [originalText],
    [changed, { ...inserted, text: "New text" }],
  );

  assert.deepEqual(
    operations.map((operation) => operation.kind),
    ["changeGeometry", "replaceText", "changeStyle", "insertText"],
  );
});

test("non-text overlay insertion and deletion remain explicit element operations", () => {
  const shape = createShapeElement("s1", 0, 5, 5, "rect");
  const inserted = deriveElementOperations([], [shape]);
  const deleted = deriveElementOperations([shape], []);
  assert.equal(inserted[0].kind, "insertElement");
  assert.equal(deleted[0].kind, "deleteElement");
});

test("page operations retain page counts and affected indices for deterministic history inspection", () => {
  const operation = pageOperation({
    operation: "delete",
    beforePageCount: 5,
    afterPageCount: 3,
    affectedPageIndices: [1, 3],
    description: "Removed pages 2 and 4.",
  });
  assert.deepEqual(operation, {
    kind: "pageOperation",
    operation: "delete",
    beforePageCount: 5,
    afterPageCount: 3,
    affectedPageIndices: [1, 3],
    description: "Removed pages 2 and 4.",
  });
});
