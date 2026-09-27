import assert from "node:assert/strict";
import test from "node:test";
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFRawStream,
  PDFStream,
  StandardFonts,
  beginText,
  decodePDFRawStream,
  endText,
  moveText,
  nextLine,
  setFontAndSize,
  setLineHeight,
  showText,
} from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  walkTextShowOperators,
  type Matrix2x3,
  type TextShowOperator,
} from "../lib/pdf/edit/contentStream.ts";
import { resolveFont } from "../lib/pdf/edit/fontEncoding.ts";
import { resolveFontMetrics } from "../lib/pdf/edit/fontMetrics.ts";
import {
  applyParagraphEditPlanToDocument,
  buildParagraphEditPlan,
  isValidatedParagraphEditPlan,
} from "../lib/pdf/edit/paragraphEditPlan.ts";
import { EditPlanRejectedError } from "../lib/pdf/edit/applyEditPlan.ts";

function hexOf(text: string): string {
  return Buffer.from(text, "ascii").toString("hex");
}

async function fixture(lines: string[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.setFont(font);
  const fontKey = page.node.newFontDictionary(font.name, font.ref);

  const ops = [
    beginText(),
    setFontAndSize(fontKey, 18),
    setLineHeight(22),
    moveText(60, 700),
  ];
  lines.forEach((line, index) => {
    if (index > 0) ops.push(nextLine());
    ops.push(showText(PDFHexString.of(hexOf(line))));
  });
  ops.push(endText());
  page.pushOperators(...ops);
  return doc.save();
}

async function decodedContentStreamBytes(pdfBytes: Uint8Array): Promise<Uint8Array> {
  const loaded = await PDFDocument.load(pdfBytes.slice());
  const page = loaded.getPages()[0];
  const contents = page.node.Contents();
  const streams: PDFStream[] =
    contents instanceof PDFArray
      ? Array.from({ length: contents.size() }, (_unused, index) =>
          loaded.context.lookup(contents.get(index), PDFStream),
        )
      : [contents as PDFStream];

  const parts = streams.map((stream) => {
    if (!(stream instanceof PDFRawStream)) {
      throw new Error("Expected a raw content stream.");
    }
    return decodePDFRawStream(stream).decode();
  });
  const result = new Uint8Array(
    parts.reduce((sum, part) => sum + part.length, 0),
  );
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function firstFontDict(
  pageResources: PDFDict,
  context: import("pdf-lib").PDFContext,
): PDFDict {
  const fonts = pageResources.lookup(PDFName.of("Font"), PDFDict);
  return context.lookup(fonts.get(fonts.keys()[0]), PDFDict);
}

async function extractText(pdfBytes: Uint8Array): Promise<string[]> {
  const doc = await pdfjsLib.getDocument({
    data: pdfBytes.slice(),
    useWorkerFetch: false,
  }).promise;
  try {
    const page = await doc.getPage(1);
    const content = await page.getTextContent();
    return content.items
      .map((item) => ("str" in item ? item.str : ""))
      .filter((text) => text.length > 0);
  } finally {
    const destroy = (doc as { destroy?: () => Promise<void> | void }).destroy;
    if (typeof destroy === "function") await destroy.call(doc);
  }
}

async function planningContext(pdfBytes: Uint8Array) {
  const loaded = await PDFDocument.load(pdfBytes.slice());
  const page = loaded.getPages()[0];
  const fontDict = firstFontDict(page.node.Resources()!, loaded.context);
  const resolvedFont = resolveFont(fontDict, loaded.context);
  const fontMetrics = resolveFontMetrics(
    fontDict,
    loaded.context,
    resolvedFont,
  );
  const allOperators = walkTextShowOperators(
    await decodedContentStreamBytes(pdfBytes),
  );
  return { loaded, resolvedFont, fontMetrics, allOperators };
}

function matrixCopy(matrix: Matrix2x3 | undefined): Matrix2x3 | undefined {
  return matrix ? [...matrix] as Matrix2x3 : undefined;
}

test("paragraph planner rewrites existing native lines atomically without moving their baselines", async () => {
  const original = await fixture(["First line", "Second line", "Third line"]);
  const { resolvedFont, fontMetrics, allOperators } =
    await planningContext(original);
  assert.equal(allOperators.length, 3);

  const beforeMatrices = allOperators.map((operator) =>
    matrixCopy(operator.textLineMatrix),
  );
  const beforeKinds = allOperators.map((operator) => operator.kind);

  const plan = buildParagraphEditPlan({
    pageIndex: 0,
    contentStreamIndex: 0,
    allOperators,
    operatorIndices: [0, 1, 2],
    replacementText: "Alpha line\nBeta line\nGamma line",
    resolvedFont,
    fontMetrics,
  });

  assert.equal(plan.editable, true);
  assert.equal(isValidatedParagraphEditPlan(plan), true);
  if (!isValidatedParagraphEditPlan(plan)) assert.fail(plan.reason);
  assert.deepEqual(plan.originalLines, [
    "First line",
    "Second line",
    "Third line",
  ]);
  assert.deepEqual(plan.replacementLines, [
    "Alpha line",
    "Beta line",
    "Gamma line",
  ]);

  const edited = await PDFDocument.load(original.slice());
  await applyParagraphEditPlanToDocument(edited, plan);
  const bytes = await edited.save();

  assert.deepEqual(await extractText(bytes), [
    "Alpha line",
    "Beta line",
    "Gamma line",
  ]);

  const afterOperators = walkTextShowOperators(
    await decodedContentStreamBytes(bytes),
  );
  assert.deepEqual(
    afterOperators.map((operator) => operator.kind),
    beforeKinds,
  );
  assert.deepEqual(
    afterOperators.map((operator) => operator.textLineMatrix),
    beforeMatrices,
  );
});

test("paragraph planner requires the replacement to preserve the native line count", async () => {
  const original = await fixture(["One", "Two"]);
  const { resolvedFont, fontMetrics, allOperators } =
    await planningContext(original);

  const plan = buildParagraphEditPlan({
    pageIndex: 0,
    contentStreamIndex: 0,
    allOperators,
    operatorIndices: [0, 1],
    replacementText: "Collapsed into one line",
    resolvedFont,
    fontMetrics,
  });

  assert.equal(plan.editable, false);
  assert.match(plan.reason, /exactly 2 lines|line count/i);
});

test("paragraph planner rejects two selected operators on the same native line", async () => {
  const original = await fixture(["One", "Two"]);
  const { resolvedFont, fontMetrics, allOperators } =
    await planningContext(original);

  const second: TextShowOperator = {
    ...allOperators[1],
    textLineMatrix: matrixCopy(allOperators[0].textLineMatrix),
  };
  const altered = [allOperators[0], second];

  const plan = buildParagraphEditPlan({
    pageIndex: 0,
    contentStreamIndex: 0,
    allOperators: altered,
    operatorIndices: [0, 1],
    replacementText: "Alpha\nBeta",
    resolvedFont,
    fontMetrics,
  });

  assert.equal(plan.editable, false);
  assert.match(plan.reason, /same native line/i);
});

test("paragraph planner rejects lines from different text objects", async () => {
  const original = await fixture(["One", "Two"]);
  const { resolvedFont, fontMetrics, allOperators } =
    await planningContext(original);

  const altered = allOperators.map((operator, index) => ({
    ...operator,
    textObjectIndex:
      index === 1 ? (operator.textObjectIndex ?? 0) + 1 : operator.textObjectIndex,
  }));

  const plan = buildParagraphEditPlan({
    pageIndex: 0,
    contentStreamIndex: 0,
    allOperators: altered,
    operatorIndices: [0, 1],
    replacementText: "Alpha\nBeta",
    resolvedFont,
    fontMetrics,
  });

  assert.equal(plan.editable, false);
  assert.match(plan.reason, /separate native text objects/i);
});

test("paragraph planner rejects lines under different CTMs", async () => {
  const original = await fixture(["One", "Two"]);
  const { resolvedFont, fontMetrics, allOperators } =
    await planningContext(original);

  const changedCtm: Matrix2x3 = [
    ...(allOperators[1].ctm ?? [1, 0, 0, 1, 0, 0]),
  ] as Matrix2x3;
  changedCtm[4] += 12;
  const altered = allOperators.map((operator, index) =>
    index === 1 ? { ...operator, ctm: changedCtm } : operator,
  );

  const plan = buildParagraphEditPlan({
    pageIndex: 0,
    contentStreamIndex: 0,
    allOperators: altered,
    operatorIndices: [0, 1],
    replacementText: "Alpha\nBeta",
    resolvedFont,
    fontMetrics,
  });

  assert.equal(plan.editable, false);
  assert.match(plan.reason, /different page transforms/i);
});

test("paragraph writer rejects a forged plain-object aggregate plan", async () => {
  const original = await fixture(["One", "Two"]);
  const { resolvedFont, fontMetrics, allOperators } =
    await planningContext(original);
  const plan = buildParagraphEditPlan({
    pageIndex: 0,
    contentStreamIndex: 0,
    allOperators,
    operatorIndices: [0, 1],
    replacementText: "Alpha\nBeta",
    resolvedFont,
    fontMetrics,
  });
  assert.equal(plan.editable, true);
  if (!isValidatedParagraphEditPlan(plan)) assert.fail(plan.reason);

  const forged = { ...plan };
  const edited = await PDFDocument.load(original.slice());
  await assert.rejects(
    () => applyParagraphEditPlanToDocument(edited, forged as typeof plan),
    (error: unknown) =>
      error instanceof EditPlanRejectedError &&
      /planner-issued validated paragraph/i.test(error.message),
  );
});
