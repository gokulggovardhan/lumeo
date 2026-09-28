import assert from "node:assert/strict";
import test from "node:test";
import {
  appendPdfEditOperations,
  createPdfEditSession,
  deriveElementOperations,
  nativeTextOperation,
  nativeTextStyleOperation,
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
  assert.equal(initial.semanticHistory.entries.length, 0);
  assert.equal(initial.nextSequence, 1);
  assert.equal(next.sourceByteLength, 2048);
  assert.equal(next.operations.length, 1);
  assert.equal(next.operations[0].id, "edit-op-1");
  assert.equal(next.operations[0].kind, "replaceText");
  assert.equal(next.semanticHistory.entries.length, 1);
  const semantic = next.semanticHistory.entries[0];
  assert.equal(semantic.tool, "edit");
  assert.equal(semantic.type, "replace-text");
  assert.deepEqual(semantic.target, {
    kind: "text",
    source: "native",
    pageIndex: 0,
    ids: ["p0-span-3"],
  });
  assert.deepEqual(semantic.before, {
    present: true,
    text: "Employee record",
  });
  assert.deepEqual(semantic.after, {
    present: true,
    text: "Employee file",
  });
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


test("page and redaction operations use the shared pages vocabulary without storing redacted text", () => {
  const pageDelete = pageOperation({
    operation: "delete",
    beforePageCount: 5,
    afterPageCount: 4,
    affectedPageIndices: [2],
    description: "Removed page 3.",
  });
  const redact = pageOperation({
    operation: "redact",
    beforePageCount: 4,
    afterPageCount: 4,
    affectedPageIndices: [1],
    description: "Redacted 2 detected regions on page 2.",
  });

  const next = appendPdfEditOperations(createPdfEditSession(4096), [
    pageDelete,
    redact,
  ]);

  const [deleteEntry, redactEntry] = next.semanticHistory.entries;
  assert.equal(deleteEntry.tool, "pages");
  assert.equal(deleteEntry.type, "delete-pages");
  assert.deepEqual(deleteEntry.target, {
    kind: "pages",
    pageIndices: [2],
  });
  assert.deepEqual(deleteEntry.before, { pageCount: 5 });
  assert.deepEqual(deleteEntry.after, { pageCount: 4 });

  assert.equal(redactEntry.tool, "redaction");
  assert.equal(redactEntry.type, "redact");
  assert.deepEqual(redactEntry.target, {
    kind: "pages",
    pageIndices: [1],
  });
  assert.deepEqual(redactEntry.before, { pageCount: 4 });
  assert.deepEqual(redactEntry.after, { pageCount: 4 });
  assert.equal(JSON.stringify(redactEntry).includes("detected regions"), true);
});

test("native text formatting is journaled as a real changeStyle operation", () => {
  const target = {
    kind: "native-text" as const,
    pageIndex: 0,
    spanIds: ["p0-span-2"],
    contentStreamIndex: 0,
    formPath: null,
    operatorIndices: [3],
    fontResourceName: "F1",
  };
  const operation = nativeTextStyleOperation({
    target,
    before: {
      fontFamily: "Helvetica",
      fontSizePt: 12,
      charSpacingPt: 0,
      wordSpacingPt: 0,
      horizontalScalingPct: 100,
    },
    after: {
      fontFamily: "Helvetica",
      fontSizePt: 14,
      charSpacingPt: 0.2,
      wordSpacingPt: 0,
      horizontalScalingPct: 96,
    },
  });

  assert.equal(operation.kind, "changeStyle");
  assert.equal(operation.target.kind, "native-text");
  assert.equal(operation.before.fontSizePt, 12);
  assert.equal(operation.after.fontSizePt, 14);
  assert.equal(operation.after.horizontalScalingPct, 96);
});


test("same-family local font swaps remain distinct semantic style operations without font bytes", () => {
  const base = {
    ...createTextElement("t-local", 0, 12, 18),
    text: "AB",
    fontFamily: "Demo Sans",
    fontAssetId: "local-font-aaaaaaaa",
  };
  const changed = {
    ...base,
    fontAssetId: "local-font-bbbbbbbb",
  };

  const operations = deriveElementOperations([base], [changed]);
  assert.equal(operations.length, 1);
  assert.equal(operations[0].kind, "changeStyle");
  if (operations[0].kind !== "changeStyle") return;
  assert.equal(operations[0].before.fontFamily, "Demo Sans");
  assert.equal(operations[0].after.fontFamily, "Demo Sans");
  assert.equal(operations[0].before.fontIdentity, "local-font-aaaaaaaa");
  assert.equal(operations[0].after.fontIdentity, "local-font-bbbbbbbb");

  const session = appendPdfEditOperations(createPdfEditSession(100), operations);
  const semantic = session.semanticHistory.entries[0];
  assert.equal(semantic.type, "change-style");
  assert.equal(semantic.before?.style?.fontIdentity, "local-font-aaaaaaaa");
  assert.equal(semantic.after?.style?.fontIdentity, "local-font-bbbbbbbb");
  assert.equal(JSON.stringify(semantic).includes("bytes"), false);
});


test("searchable OCR layer is one edit semantic operation on the affected page", () => {
  const operation = pageOperation({
    operation: "add-searchable-text-layer",
    beforePageCount: 2,
    afterPageCount: 2,
    affectedPageIndices: [0],
    description: "Added 7 local OCR words as an invisible searchable text layer.",
  });

  const next = appendPdfEditOperations(createPdfEditSession(4096), [operation]);
  assert.equal(next.operations.length, 1);
  assert.equal(next.operations[0].kind, "pageOperation");
  const semantic = next.semanticHistory.entries[0];
  assert.equal(semantic.tool, "edit");
  assert.equal(semantic.type, "add-searchable-text-layer");
  assert.deepEqual(semantic.target, { kind: "pages", pageIndices: [0] });
  assert.deepEqual(semantic.before, { pageCount: 2 });
  assert.deepEqual(semantic.after, { pageCount: 2 });
  assert.match(semantic.description ?? "", /invisible searchable text layer/i);
});


test("searchable OCR regeneration is a distinct edit semantic operation", () => {
  const operation = pageOperation({
    operation: "replace-searchable-text-layer",
    beforePageCount: 3,
    afterPageCount: 3,
    affectedPageIndices: [1],
    description: "Regenerated 9 local OCR words in the invisible searchable text layer.",
  });

  const next = appendPdfEditOperations(createPdfEditSession(8192), [operation]);
  assert.equal(next.operations.length, 1);
  assert.equal(next.operations[0].kind, "pageOperation");
  const semantic = next.semanticHistory.entries[0];
  assert.equal(semantic.tool, "edit");
  assert.equal(semantic.type, "replace-searchable-text-layer");
  assert.deepEqual(semantic.target, { kind: "pages", pageIndices: [1] });
  assert.match(semantic.description ?? "", /regenerated/i);
});
