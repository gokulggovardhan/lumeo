import assert from "node:assert/strict";
import test from "node:test";
import type { PDFDict } from "pdf-lib";
import type { TextShowOperator } from "../lib/pdf/edit/contentStream.ts";
import {
  buildPdfPageTextModel,
  type PdfTextSourceMatch,
} from "../lib/pdf/edit/documentModel.ts";
import {
  buildPdfTextSearchPageIndex,
  nextSearchMatchIndex,
  replacementTextForSearchMatch,
  searchPdfDocumentIndex,
  searchPdfDocumentText,
  searchPdfPageText,
} from "../lib/pdf/edit/textSearch.ts";
import type { DetectedTextRun } from "../lib/pdf/edit/textRuns.ts";
import type { PdfFontProfile } from "../lib/pdf/edit/fontRegistry.ts";

function run(
  str: string,
  xPct: number,
  yPct: number,
  widthPct = 14,
): DetectedTextRun {
  return {
    str,
    fontName: "F1",
    xPct,
    yPct,
    widthPct,
    heightPct: 2,
    fontSizePt: 12,
    rotated: false,
  };
}

function safeFontProfile(): PdfFontProfile {
  return {
    kind: "Type1",
    encodingSource: "WinAnsi",
    metricsSource: "Widths",
    resolvedFont: {
      writingMode: "horizontal",
    },
  } as PdfFontProfile;
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

function pageModel(pageIndex = 0) {
  const runs = [
    run("Employee", 10, 20, 14),
    run("record", 25, 20, 10),
    run("Recordkeeping", 10, 28, 20),
  ];
  return buildPdfPageTextModel({
    pageIndex,
    widthPt: 600,
    heightPt: 800,
    runs,
    matches: runs.map((_, index) => match(index)),
    fontProfiles: runs.map(() => safeFontProfile()),
  });
}

test("structured search matches across adjacent spans and returns exact source runs", () => {
  const page = pageModel();
  const matches = searchPdfPageText(page, "employee record");
  assert.equal(matches.length, 1);
  assert.deepEqual(matches[0].sourceRunIndices, [0, 1]);
  assert.equal(matches[0].text, "Employee record");
  assert.equal(matches[0].capability, "editable");
  assert.ok(matches[0].boundsPct.widthPct > 20);
});

test("structured search honors case and whole-word controls", () => {
  const page = pageModel();
  assert.equal(searchPdfPageText(page, "record").length, 2);
  assert.equal(
    searchPdfPageText(page, "record", { wholeWord: true }).length,
    1,
  );
  assert.equal(
    searchPdfPageText(page, "Record", { caseSensitive: true, wholeWord: true }).length,
    0,
  );
  assert.equal(
    searchPdfPageText(page, "Employee", { caseSensitive: true }).length,
    1,
  );
});

test("replacementTextForSearchMatch preserves unmatched prefix and suffix", () => {
  const page = pageModel();
  const [matchResult] = searchPdfPageText(page, "ployee rec");
  assert.ok(matchResult);
  const replacement = replacementTextForSearchMatch(page, matchResult, "staff ");
  assert.ok(replacement);
  assert.deepEqual(replacement.sourceRunIndices, [0, 1]);
  assert.equal(replacement.replacementText, "Emstaff ord");
});

test("document search stays in page order and navigation wraps", () => {
  const first = pageModel(0);
  const second = pageModel(1);
  const matches = searchPdfDocumentText([second, first], "record", { wholeWord: true });
  assert.deepEqual(matches.map((match) => match.pageIndex), [0, 1]);
  assert.equal(nextSearchMatchIndex(matches, -1, 1), 0);
  assert.equal(nextSearchMatchIndex(matches, 0, 1), 1);
  assert.equal(nextSearchMatchIndex(matches, 1, 1), 0);
  assert.equal(nextSearchMatchIndex(matches, 0, -1), 1);
});

test("search-only page models remain searchable but refuse replacement preparation", () => {
  const runs = [run("Search only", 10, 20, 20)];
  const page = buildPdfPageTextModel({
    pageIndex: 3,
    widthPt: 600,
    heightPt: 800,
    runs,
    matches: [null],
  });
  const [matchResult] = searchPdfPageText(page, "Search");
  assert.ok(matchResult);
  assert.equal(matchResult.capability, "view-only");
  assert.equal(replacementTextForSearchMatch(page, matchResult, "Find"), null);
});


test("compact document index preserves search geometry without retaining full page analysis", () => {
  const page = pageModel();
  const index = buildPdfTextSearchPageIndex(page);
  assert.equal(index.pageIndex, page.pageIndex);
  assert.equal(index.lines.length, page.lines.length);
  assert.equal("blocks" in index, false);
  assert.equal("boundsPt" in index.lines[0].spans[0], false);
  assert.equal("fontProfile" in index.lines[0].spans[0], false);

  const matches = searchPdfDocumentIndex([index], "employee record");
  assert.equal(matches.length, 1);
  assert.deepEqual(matches[0].sourceRunIndices, [0, 1]);
  assert.deepEqual(matches[0].boundsPct, searchPdfPageText(page, "employee record")[0].boundsPct);
});
