import assert from "node:assert/strict";
import test from "node:test";
import {
  PDFDocument,
  decodePDFRawStream,
  PDFRawStream,
  PDFStream,
  PDFArray,
  StandardFonts,
  PDFOperator,
  PDFOperatorNames,
  PDFNumber,
  PDFName,
  PDFDict,
} from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { textRunsFromContent, type DetectedTextRun } from "../lib/pdf/edit/textRuns.ts";
import { walkTextShowOperators } from "../lib/pdf/edit/contentStream.ts";
import {
  matchDetectedRunToOperator,
  matchDetectedRunToOperatorIndexed,
  buildOperatorSpatialIndex,
  runSpansMultipleOperators,
} from "../lib/pdf/edit/matchTextRun.ts";
import { collectPageTextOperators } from "../lib/pdf/edit/formXObjects.ts";
import { resolveFont } from "../lib/pdf/edit/fontEncoding.ts";
import { resolveFontMetrics } from "../lib/pdf/edit/fontMetrics.ts";
import { buildEditPlan } from "../lib/pdf/edit/editPlan.ts";

async function decodedContentStreamBytes(pdfBytes: Uint8Array): Promise<Uint8Array> {
  const loaded = await PDFDocument.load(pdfBytes);
  const page = loaded.getPages()[0];
  const contents = page.node.Contents();
  const streams: PDFStream[] =
    contents instanceof PDFArray
      ? Array.from({ length: contents.size() }, (_unused, i) => loaded.context.lookup(contents.get(i), PDFStream))
      : [contents as PDFStream];

  const parts = streams.map((stream) => {
    if (!(stream instanceof PDFRawStream)) throw new Error("Expected a raw content stream.");
    return decodePDFRawStream(stream).decode();
  });
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    combined.set(part, offset);
    offset += part.length;
  }
  return combined;
}

async function loadPdfjsPage(bytes: Uint8Array, pageNumber = 1) {
  // pdfjs's getDocument({ data }) detaches the passed-in ArrayBuffer
  // (confirmed directly: reading `bytes` again afterward throws
  // "Cannot perform %TypedArray%.prototype.slice on a detached
  // ArrayBuffer") -- pass it a copy so callers can still use the original
  // bytes for anything else afterward, matching how the app itself
  // already guards this same call (see components/pdf/EditPdfTool.tsx's
  // copyArrayBuffer(pdf.bytes) before every openPdfJsDocument call).
  const doc = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
  return doc.getPage(pageNumber);
}

test("matchDetectedRunToOperator pairs a real pdfjs-detected run with the real operator that produced it", async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText("Hello World", { x: 50, y: 700, size: 18, font });
  const pdfBytes = await doc.save();

  const pdfjsPage = await loadPdfjsPage(pdfBytes);
  const scale = 1.3; // an arbitrary non-1 scale, matching EditPdfTool.tsx's PAGE_RENDER_SCALE
  const viewport = pdfjsPage.getViewport({ scale });
  const content = await pdfjsPage.getTextContent();
  const runs = textRunsFromContent(content.items as never, viewport.transform, viewport.width, viewport.height);
  assert.equal(runs.length, 1);

  const streamBytes = await decodedContentStreamBytes(pdfBytes);
  const operators = walkTextShowOperators(streamBytes);
  assert.equal(operators.length, 1);

  const matched = matchDetectedRunToOperator(runs[0], viewport.width, viewport.height, operators, viewport.transform);
  assert.equal(matched, operators[0]);
  assert.equal(Buffer.from(matched!.strings[0]).toString("latin1"), "Hello World");
});

test("matchDetectedRunToOperator picks the correct operator among several, not just the first", async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText("First line", { x: 50, y: 700, size: 18, font });
  page.drawText("Second line", { x: 50, y: 650, size: 18, font });
  page.drawText("Third line", { x: 50, y: 600, size: 18, font });
  const pdfBytes = await doc.save();

  const pdfjsPage = await loadPdfjsPage(pdfBytes);
  const viewport = pdfjsPage.getViewport({ scale: 1 });
  const content = await pdfjsPage.getTextContent();
  const runs = textRunsFromContent(content.items as never, viewport.transform, viewport.width, viewport.height);
  assert.equal(runs.length, 3);

  const streamBytes = await decodedContentStreamBytes(pdfBytes);
  const operators = walkTextShowOperators(streamBytes);
  assert.equal(operators.length, 3);

  // Match every detected run and confirm each pairs with the operator
  // carrying the SAME string -- not just "some" operator, and not always
  // the first one in document order.
  for (const run of runs) {
    const matched = matchDetectedRunToOperator(run, viewport.width, viewport.height, operators, viewport.transform);
    assert.ok(matched, `expected a match for run "${run.str}"`);
    assert.equal(Buffer.from(matched!.strings[0]).toString("latin1"), run.str);
  }
});

test("matchDetectedRunToOperator returns null when no operator is close enough", async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText("Hello World", { x: 50, y: 700, size: 18, font });
  const pdfBytes = await doc.save();

  const pdfjsPage = await loadPdfjsPage(pdfBytes);
  const viewport = pdfjsPage.getViewport({ scale: 1 });
  const content = await pdfjsPage.getTextContent();
  const runs = textRunsFromContent(content.items as never, viewport.transform, viewport.width, viewport.height);

  const matched = matchDetectedRunToOperator(runs[0], viewport.width, viewport.height, [], viewport.transform);
  assert.equal(matched, null);
});

// Regression for a real bug found via live browser testing (Phase 9.2 of
// true PDF text editing): pdfjs's getTextContent() can merge several
// consecutive content-stream operators with no positioning gap between them
// into ONE visual DetectedTextRun, but matchDetectedRunToOperator only ever
// matches that run to a SINGLE operator. Editing via that one operator alone
// would silently rewrite only part of the visual run -- e.g. replacing a
// merged "Hello World" run with "Goodbye" actually produced "GoodbyeWorld"
// (the second, un-replaced Tj's "World" sitting directly against the
// replacement). runSpansMultipleOperators (lib/pdf/edit/matchTextRun.ts) is
// the fix: the EditPdfTool UI compares the matched operator's own decoded
// text against the full run's text before allowing an edit.
test("runSpansMultipleOperators flags a run pdfjs merged from two back-to-back Tj operators with no Td between them", async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.setFont(font);
  // getFont/getContentStream are `private` in pdf-lib's own TS types (an
  // internal-use restriction, not a runtime one -- PDFPage.drawText itself
  // calls both) but this test needs exactly what they return to build two
  // back-to-back ShowText operators drawText's own API can't produce (it
  // always inserts a MoveText between every call). Typed via a narrow local
  // interface rather than `any`, so this stays type-checked.
  const pageInternals = page as unknown as {
    getFont(): [unknown, PDFName];
    getContentStream(): { push(...ops: PDFOperator[]): void };
  };
  const fontKey = pageInternals.getFont()[1];

  // Two ShowText (Tj) operators back-to-back, with only ONE MoveText (Td)
  // between BT and the first -- exactly the "no positioning gap" shape that
  // makes pdfjs's own text-extraction merge them into a single run.
  pageInternals.getContentStream().push(
    PDFOperator.of(PDFOperatorNames.BeginText),
    PDFOperator.of(PDFOperatorNames.SetFontAndSize, [fontKey, PDFNumber.of(20)]),
    PDFOperator.of(PDFOperatorNames.MoveText, [PDFNumber.of(50), PDFNumber.of(700)]),
    PDFOperator.of(PDFOperatorNames.ShowText, [font.encodeText("Hello ")]),
    PDFOperator.of(PDFOperatorNames.ShowText, [font.encodeText("World")]),
    PDFOperator.of(PDFOperatorNames.EndText),
  );
  const pdfBytes = await doc.save();

  const pdfjsPage = await loadPdfjsPage(pdfBytes);
  const scale = 1.3;
  const viewport = pdfjsPage.getViewport({ scale });
  const content = await pdfjsPage.getTextContent();
  const runs = textRunsFromContent(content.items as never, viewport.transform, viewport.width, viewport.height);
  // Confirms the merge actually happened (the premise this test exists to
  // guard) -- pdfjs produced ONE run for what are really two operators.
  assert.equal(runs.length, 1);
  assert.equal(runs[0].str, "Hello World");

  const editDoc = await PDFDocument.load(pdfBytes.slice());
  const located = collectPageTextOperators(editDoc, 0);
  const flatOperators = located.map((item) => item.operator);
  const matched = matchDetectedRunToOperator(runs[0], viewport.width, viewport.height, flatOperators, viewport.transform);
  assert.ok(matched, "expected a position match to the first (closest) operator");
  const locatedOperator = located.find((item) => item.operator === matched)!;

  const fontDict = locatedOperator.resources.lookup(PDFName.of("Font"), PDFDict)!.lookup(PDFName.of(matched!.fontResourceName!), PDFDict)!;
  const resolvedFont = resolveFont(fontDict, editDoc.context);
  const fontMetrics = resolveFontMetrics(fontDict, editDoc.context, resolvedFont);
  const plan = buildEditPlan({
    pageIndex: 0,
    contentStreamIndex: 0,
    operatorIndex: locatedOperator.operatorIndex,
    operator: matched!,
    replacementText: "Goodbye",
    resolvedFont,
    fontMetrics,
  });

  // The matched operator only ever produced "Hello " -- not the full
  // "Hello World" visual run -- which is exactly the mismatch
  // runSpansMultipleOperators must catch.
  assert.equal(plan.originalText, "Hello ");
  assert.equal(runSpansMultipleOperators(plan.originalText, runs[0].str), true);
});

// Phase 24: matchDetectedRunToOperatorIndexed's spatial-grid prefilter must
// return EXACTLY what the brute-force matchDetectedRunToOperator returns
// for the same inputs -- it's a performance-only change (O(runs x operators)
// -> O(runs) after a one-time O(operators) index build), never a behavior
// change. These synthetic operators/runs don't need a real PDF: matchTextRun
// only ever looks at an operator's textRenderingMatrix and a run's
// xPct/yPct/widthPct/heightPct, both of which are trivial to construct
// directly, and doing so lets this test cover far denser
// (100s-of-operators) scenarios than a real drawText()-built PDF practically
// could.
function makeFakeOperator(leftPx: number, topPx: number, label: string) {
  // boxOriginFromTransform (called on viewportTransform . textRenderingMatrix)
  // treats a non-rotated transform's [4],[5] as the box's own left/top
  // directly when angle ~= 0 and fontHeight's ascent offset is folded in --
  // to keep this test's math simple and exact, use fontSize 0 equivalent
  // (identity scale, tx=[1,0,0,1,leftPx,topPx+ascentOffset]) so the resulting
  // origin.top lands exactly on topPx. hypot(tx[2],tx[3]) with tx=[1,0,0,1,..]
  // is hypot(0,1)=1, so fontAscent = 1*0.85 = 0.85 -- offset topPx by that
  // fixed, known amount so origin.top === topPx exactly.
  const ASCENT_OFFSET = 0.85;
  return {
    kind: "Tj" as const,
    start: 0,
    end: 0,
    strings: [new TextEncoder().encode(label)],
    fontResourceName: "F1",
    fontSizePt: 12,
    textRenderingMatrix: [1, 0, 0, 1, leftPx, topPx + ASCENT_OFFSET] as [number, number, number, number, number, number],
    charSpacing: 0,
    wordSpacing: 0,
    horizontalScalingPct: 100,
    leading: 0,
    textRise: 0,
    renderMode: 0,
  };
}

function makeFakeRun(xPct: number, yPct: number): DetectedTextRun {
  return { str: "x", fontName: "F1", xPct, yPct, widthPct: 1, heightPct: 1, fontSizePt: 12, rotated: false };
}

test("matchDetectedRunToOperatorIndexed matches matchDetectedRunToOperator exactly on a dense scattered grid", () => {
  const pageWidthPx = 1000;
  const pageHeightPx = 1000;
  const viewportTransform: [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0];

  // 400 operators scattered across a 20x20 grid (5px apart -- tighter than
  // POSITION_TOLERANCE_PX's neighboring cells so some runs land ambiguously
  // close to more than one operator, exercising the "closest wins" tie-break
  // the same way both code paths must agree on).
  const operators = [];
  for (let gx = 0; gx < 20; gx += 1) {
    for (let gy = 0; gy < 20; gy += 1) {
      operators.push(makeFakeOperator(gx * 5, gy * 5, `op-${gx}-${gy}`));
    }
  }
  const index = buildOperatorSpatialIndex(operators, viewportTransform);

  // Runs: one exactly on each of a sample of grid points (should match),
  // plus several deliberately far from every operator (should return null),
  // plus a few sitting between two operators' tolerance circles (exercises
  // the closest-wins comparison identically on both paths).
  const runs: DetectedTextRun[] = [];
  for (let gx = 0; gx < 20; gx += 2) {
    for (let gy = 0; gy < 20; gy += 2) {
      runs.push(makeFakeRun((gx * 5 / pageWidthPx) * 100, (gy * 5 / pageHeightPx) * 100));
    }
  }
  // Far outside any operator's tolerance.
  runs.push(makeFakeRun(50, 50));
  runs.push(makeFakeRun(0, 0));
  runs.push(makeFakeRun(99.9, 99.9));

  for (const run of runs) {
    const brute = matchDetectedRunToOperator(run, pageWidthPx, pageHeightPx, operators, viewportTransform);
    const indexed = matchDetectedRunToOperatorIndexed(run, pageWidthPx, pageHeightPx, index);
    assert.equal(indexed, brute, `mismatch for run at (${run.xPct}, ${run.yPct})`);
  }
});

test("matchDetectedRunToOperatorIndexed returns null when the index has no operators near the run, same as brute force", () => {
  const pageWidthPx = 1000;
  const pageHeightPx = 1000;
  const viewportTransform: [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0];
  const operators = [makeFakeOperator(500, 500, "only-op")];
  const index = buildOperatorSpatialIndex(operators, viewportTransform);
  const farRun = makeFakeRun(10, 10);

  assert.equal(matchDetectedRunToOperatorIndexed(farRun, pageWidthPx, pageHeightPx, index), null);
  assert.equal(matchDetectedRunToOperator(farRun, pageWidthPx, pageHeightPx, operators, viewportTransform), null);
});

test("runSpansMultipleOperators does not flag a normal single-operator run", async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText("Hello World", { x: 50, y: 700, size: 18, font });
  const pdfBytes = await doc.save();

  const pdfjsPage = await loadPdfjsPage(pdfBytes);
  const viewport = pdfjsPage.getViewport({ scale: 1 });
  const content = await pdfjsPage.getTextContent();
  const runs = textRunsFromContent(content.items as never, viewport.transform, viewport.width, viewport.height);
  assert.equal(runs.length, 1);

  const editDoc = await PDFDocument.load(pdfBytes.slice());
  const located = collectPageTextOperators(editDoc, 0);
  const flatOperators = located.map((item) => item.operator);
  const matched = matchDetectedRunToOperator(runs[0], viewport.width, viewport.height, flatOperators, viewport.transform);
  assert.ok(matched);
  const locatedOperator = located.find((item) => item.operator === matched)!;

  const fontDict = locatedOperator.resources.lookup(PDFName.of("Font"), PDFDict)!.lookup(PDFName.of(matched!.fontResourceName!), PDFDict)!;
  const resolvedFont = resolveFont(fontDict, editDoc.context);
  const fontMetrics = resolveFontMetrics(fontDict, editDoc.context, resolvedFont);
  const plan = buildEditPlan({
    pageIndex: 0,
    contentStreamIndex: 0,
    operatorIndex: locatedOperator.operatorIndex,
    operator: matched!,
    replacementText: "Goodbye",
    resolvedFont,
    fontMetrics,
  });

  assert.equal(plan.originalText, "Hello World");
  assert.equal(runSpansMultipleOperators(plan.originalText, runs[0].str), false);
});
