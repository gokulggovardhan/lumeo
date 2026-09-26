import assert from "node:assert/strict";
import test from "node:test";
import type {
  PdfPageTextModel,
  PdfTextSpan,
} from "../lib/pdf/edit/documentModel.ts";
import {
  graphemeBoundaries,
  logicalRangeCoversWholeSpans,
  logicalRangeForFullRunSelection,
  logicalRangeForSingleSpan,
  nearestGraphemeBoundary,
  orderedSingleSpanOffsets,
} from "../lib/pdf/edit/logicalTextRange.ts";

function span(id: string, sourceRunIndex: number, text: string): PdfTextSpan {
  return {
    id,
    sourceRunIndex,
    text,
  } as PdfTextSpan;
}

function model(...spans: PdfTextSpan[]): PdfPageTextModel {
  return {
    spans,
  } as PdfPageTextModel;
}

test("grapheme boundaries keep an emoji ZWJ sequence indivisible", () => {
  const text = "A👨‍👩‍👧‍👦B";
  const boundaries = graphemeBoundaries(text);

  assert.equal(boundaries[0], 0);
  assert.equal(boundaries.at(-1), text.length);
  assert.equal(boundaries.length, 4);
  assert.equal(text.slice(boundaries[1], boundaries[2]), "👨‍👩‍👧‍👦");

  for (let offset = boundaries[1] + 1; offset < boundaries[2]; offset += 1) {
    const normalized = nearestGraphemeBoundary(text, offset);
    assert.ok(
      normalized === boundaries[1] || normalized === boundaries[2],
      `offset ${offset} normalized inside the grapheme: ${normalized}`,
    );
  }
});

test("single-span logical selection expands partial grapheme offsets safely", () => {
  const text = "A👨‍👩‍👧‍👦B";
  const boundaries = graphemeBoundaries(text);
  const selected = logicalRangeForSingleSpan({
    span: span("s0", 0, text),
    text,
    selectionStart: boundaries[1] + 1,
    selectionEnd: boundaries[2] - 1,
  });

  assert.equal(selected.anchor.offset, boundaries[1]);
  assert.equal(selected.focus.offset, boundaries[2]);
  assert.equal(selected.text, "👨‍👩‍👧‍👦");
  assert.equal(selected.collapsed, false);
});

test("single-span backward selection preserves anchor/focus direction", () => {
  const selected = logicalRangeForSingleSpan({
    span: span("s0", 0, "Invoice"),
    text: "Invoice",
    selectionStart: 1,
    selectionEnd: 5,
    direction: "backward",
  });

  assert.equal(selected.direction, "backward");
  assert.equal(selected.anchor.offset, 5);
  assert.equal(selected.focus.offset, 1);
  assert.deepEqual(orderedSingleSpanOffsets(selected, "s0"), {
    start: 1,
    end: 5,
    direction: "backward",
  });
});

test("collapsed caret is snapped to one grapheme boundary", () => {
  const text = "e\u0301x";
  const selected = logicalRangeForSingleSpan({
    span: span("s0", 0, text),
    text,
    selectionStart: 1,
    selectionEnd: 1,
  });

  assert.equal(selected.collapsed, true);
  assert.equal(selected.anchor.offset, selected.focus.offset);
  assert.ok(graphemeBoundaries(text).includes(selected.focus.offset));
});

test("full-span logical selection preserves forward PDF run order", () => {
  const page = model(
    span("s0", 0, "Alpha"),
    span("s1", 1, "Beta"),
    span("s2", 2, "Gamma"),
  );
  const selected = logicalRangeForFullRunSelection(page, 0, 2);

  assert.ok(selected);
  assert.equal(selected.direction, "forward");
  assert.deepEqual(selected.sourceRunIndices, [0, 1, 2]);
  assert.deepEqual(selected.spanIds, ["s0", "s1", "s2"]);
  assert.equal(selected.anchor.offset, 0);
  assert.equal(selected.focus.offset, "Gamma".length);
  assert.equal(selected.text, "AlphaBetaGamma");
  assert.equal(logicalRangeCoversWholeSpans(selected, page), true);
});

test("full-span backward selection keeps direction while retaining document-order runs", () => {
  const page = model(
    span("s0", 0, "Alpha"),
    span("s1", 1, "Beta"),
    span("s2", 2, "Gamma"),
  );
  const selected = logicalRangeForFullRunSelection(page, 2, 0);

  assert.ok(selected);
  assert.equal(selected.direction, "backward");
  assert.deepEqual(selected.sourceRunIndices, [0, 1, 2]);
  assert.equal(selected.anchor.spanId, "s2");
  assert.equal(selected.anchor.offset, "Gamma".length);
  assert.equal(selected.focus.spanId, "s0");
  assert.equal(selected.focus.offset, 0);
  assert.equal(logicalRangeCoversWholeSpans(selected, page), true);
});

test("partial cross-span logical selection never satisfies whole-span writer gate", () => {
  const page = model(
    span("s0", 0, "Alpha"),
    span("s1", 1, "Beta"),
  );
  const whole = logicalRangeForFullRunSelection(page, 0, 1);
  assert.ok(whole);

  const partial = {
    ...whole,
    anchor: { ...whole.anchor, offset: 2 },
  };
  assert.equal(logicalRangeCoversWholeSpans(partial, page), false);
});
