import assert from "node:assert/strict";
import test from "node:test";
import type { PDFDict } from "pdf-lib";
import type { TextShowOperator } from "../lib/pdf/edit/contentStream.ts";
import {
  buildPdfPageTextModel,
  type PdfTextSourceMatch,
} from "../lib/pdf/edit/documentModel.ts";
import { planStructuredReplaceAllPage } from "../lib/pdf/edit/structuredReplaceAll.ts";
import { searchPdfPageText } from "../lib/pdf/edit/textSearch.ts";
import type { DetectedTextRun } from "../lib/pdf/edit/textRuns.ts";

function run(str: string, xPct: number, widthPct = 15): DetectedTextRun {
  return {
    str,
    fontName: "F1",
    xPct,
    yPct: 20,
    widthPct,
    heightPct: 2,
    fontSizePt: 12,
    rotated: false,
    baselineXPct: xPct,
    baselineYPct: 21.6,
  };
}

function match(operatorIndex: number): PdfTextSourceMatch {
  const operator: TextShowOperator = {
    kind: "Tj",
    start: operatorIndex * 10,
    end: operatorIndex * 10 + 8,
    strings: [Uint8Array.of(65)],
    fontResourceName: "F1",
    fontSizePt: 12,
    textRenderingMatrix: [12, 0, 0, 12, 72 + operatorIndex * 80, 700],
    textLineMatrix: [1, 0, 0, 1, 72, 700],
    ctm: [1, 0, 0, 1, 0, 0],
    textObjectIndex: 0,
    charSpacing: 0,
    wordSpacing: 0,
    horizontalScalingPct: 100,
    leading: 14,
    textRise: 0,
    renderMode: 0,
  };
  return {
    operator,
    locatedOperator: {
      locator: { kind: "page", contentStreamIndex: 0 },
      operatorIndex,
      operator,
      streamBytes: new Uint8Array(),
      resources: {} as PDFDict,
    },
  };
}

function model(runs: DetectedTextRun[], matched = true) {
  return buildPdfPageTextModel({
    pageIndex: 0,
    widthPt: 600,
    heightPt: 800,
    runs,
    matches: runs.map((_, index) => (matched ? match(index) : null)),
  });
}

test("structured Replace All folds repeated matches in one native span into one rewrite", () => {
  const page = model([run("foo foo foo", 10, 30)]);
  const matches = searchPdfPageText(page, "foo");
  assert.equal(matches.length, 3);

  const plan = planStructuredReplaceAllPage({
    page,
    matches,
    replacement: "bar",
  });

  assert.equal(plan.plannedMatchCount, 3);
  assert.equal(plan.candidates.length, 1);
  assert.equal(plan.candidates[0].originalText, "foo foo foo");
  assert.equal(plan.candidates[0].replacementText, "bar bar bar");
  assert.deepEqual(plan.candidates[0].sourceRunIndices, [0]);
  assert.equal(plan.skipped.length, 0);
});

test("structured Replace All preserves disjoint cross-span matches", () => {
  const page = model([
    run("Employee", 10, 14),
    run("record", 25, 10),
    run("and", 37, 6),
    run("Employee", 45, 14),
    run("record", 60, 10),
  ]);
  const matches = searchPdfPageText(page, "Employee record");
  assert.equal(matches.length, 2);

  const plan = planStructuredReplaceAllPage({
    page,
    matches,
    replacement: "Staff file",
  });

  assert.equal(plan.plannedMatchCount, 2);
  assert.equal(plan.candidates.length, 2);
  assert.deepEqual(
    plan.candidates.map((candidate) => candidate.sourceRunIndices),
    [[0, 1], [3, 4]],
  );
  assert.equal(plan.skipped.length, 0);
});

test("structured Replace All refuses search-only matches with no native authority", () => {
  const page = model([run("foo", 10)], false);
  const matches = searchPdfPageText(page, "foo");
  assert.equal(matches[0].capability, "view-only");

  const plan = planStructuredReplaceAllPage({
    page,
    matches,
    replacement: "bar",
  });

  assert.equal(plan.candidates.length, 0);
  assert.equal(plan.plannedMatchCount, 0);
  assert.equal(plan.skipped.length, 1);
  assert.equal(plan.skipped[0].reason, "not-editable");
});

test("structured Replace All rejects native target conflicts instead of choosing mutation order", () => {
  const page = model([
    run("alpha", 10, 12),
    run("beta", 23, 10),
    run("gamma", 34, 12),
  ]);
  const left = searchPdfPageText(page, "alpha beta");
  const right = searchPdfPageText(page, "beta gamma");
  assert.equal(left.length, 1);
  assert.equal(right.length, 1);

  const plan = planStructuredReplaceAllPage({
    page,
    matches: [left[0], right[0]],
    replacement: "X",
  });

  assert.equal(plan.candidates.length, 0);
  assert.equal(plan.plannedMatchCount, 0);
  assert.equal(plan.skipped.length, 2);
  assert.ok(plan.skipped.every((entry) => entry.reason === "overlapping-native-target"));
});
