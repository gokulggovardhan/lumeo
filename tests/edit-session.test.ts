import assert from "node:assert/strict";
import test from "node:test";
import {
  PdfEditSession,
  appendPdfEditOperation,
  createPdfEditJournal,
  recordElementMutation,
} from "../lib/pdf/edit/editSession.ts";
import {
  createShapeElement,
  createTextElement,
  patchElement,
} from "../lib/pdf/edit/elements.ts";

test("PdfEditSession owns an immutable copy of uploaded source bytes", () => {
  const source = new Uint8Array([37, 80, 68, 70, 45, 1, 2, 3]);
  const session = new PdfEditSession(source);

  source[0] = 0;
  const firstRead = new Uint8Array(session.getSourcePdfBytes());
  assert.equal(firstRead[0], 37);

  firstRead[1] = 0;
  const secondRead = new Uint8Array(session.getSourcePdfBytes());
  assert.equal(secondRead[1], 80);
});

test("operation journal assigns deterministic monotonic identities", () => {
  let journal = createPdfEditJournal();
  journal = appendPdfEditOperation(journal, {
    kind: "replaceText",
    pageIndex: 0,
    target: {
      kind: "native",
      pageIndex: 0,
      spanIds: ["p0-span-0"],
      operators: [{
        streamKind: "page",
        contentStreamIndex: 0,
        formPath: null,
        operatorIndex: 2,
      }],
    },
    beforeText: "Invoice",
    afterText: "Receipt",
    layoutStrategy: "natural",
  });
  journal = appendPdfEditOperation(journal, {
    kind: "pageOperation",
    pageIndex: 0,
    action: "reorder",
    detail: { from: 0, to: 2 },
  });

  assert.deepEqual(
    journal.operations.map((operation) => [operation.id, operation.sequence, operation.kind]),
    [
      ["edit-op-1", 1, "replaceText"],
      ["edit-op-2", 2, "pageOperation"],
    ],
  );
  assert.equal(journal.nextSequence, 3);
});

test("placed-element mutations become semantic insert, text/style and geometry operations", () => {
  const originalText = {
    ...createTextElement("text-1", 0, 10, 20),
    text: "Original",
  };
  const shape = createShapeElement("shape-1", 0, 40, 40, "rect");

  let journal = recordElementMutation(createPdfEditJournal(), [], [originalText, shape]);
  assert.deepEqual(
    journal.operations.map((operation) => operation.kind),
    ["insertText", "elementLifecycle"],
  );

  const changedText = {
    ...originalText,
    text: "Updated",
    xPct: 14,
    widthPct: 28,
    color: "#cc0000",
    bold: true,
  };
  journal = recordElementMutation(journal, [originalText, shape], [changedText, shape]);

  assert.deepEqual(
    journal.operations.slice(2).map((operation) => operation.kind),
    ["changeGeometry", "replaceText", "changeStyle"],
  );

  journal = recordElementMutation(journal, [changedText, shape], [shape]);
  assert.equal(journal.operations.at(-1)?.kind, "deleteText");
});

test("PdfEditSession withOperation keeps the same immutable source and advances the journal", () => {
  const session = new PdfEditSession(new Uint8Array([1, 2, 3]));
  const next = session.withOperation({
    kind: "insertText",
    pageIndex: 0,
    target: { kind: "placed", pageIndex: 0, elementId: "text-1" },
    text: "Hello",
    geometry: { xPct: 10, yPct: 10, widthPct: 20, heightPct: 4 },
    style: {
      fontSizePt: 12,
      color: "#000000",
      bold: false,
      italic: false,
      underline: false,
    },
  });

  assert.equal(next.journal.operations.length, 1);
  assert.deepEqual(
    [...new Uint8Array(next.getSourcePdfBytes())],
    [1, 2, 3],
  );
});
