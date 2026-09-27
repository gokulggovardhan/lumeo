import assert from "node:assert/strict";
import test from "node:test";
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFOperator,
  PDFOperatorNames,
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

async function fragmentedParagraphFixture(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontKey = page.node.newFontDictionary(font.name, font.ref);

  const firstAdjusted = PDFArray.withContext(doc.context);
  firstAdjusted.push(PDFHexString.of(hexOf("alpha")));
  firstAdjusted.push(PDFNumber.of(-15));
  firstAdjusted.push(PDFHexString.of(hexOf(" beta")));

  const ops = [
    beginText(),
    setFontAndSize(fontKey, 18),
    setLineHeight(22),
    moveText(60, 700),
    showText(PDFHexString.of(hexOf("First "))),
    PDFOperator.of(PDFOperatorNames.ShowTextAdjusted, [firstAdjusted]),
    nextLine(),
    showText(PDFHexString.of(hexOf("Second "))),
    showText(PDFHexString.of(hexOf("line"))),
    endText(),
  ];
  page.pushOperators(...ops);
  return doc.save();
}

async function threeOperatorFragmentedParagraphFixture(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontKey = page.node.newFontDictionary(font.name, font.ref);

  page.pushOperators(
    beginText(),
    setFontAndSize(fontKey, 18),
    setLineHeight(22),
    moveText(60, 700),
    showText(PDFHexString.of(hexOf("Left "))),
    showText(PDFHexString.of(hexOf("right"))),
    nextLine(),
    showText(PDFHexString.of(hexOf("Second"))),
    endText(),
  );
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
  const beforeTextObjectIndices = allOperators.map(
    (operator) => operator.textObjectIndex,
  );
  const beforeCtms = allOperators.map((operator) => matrixCopy(operator.ctm));

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
  if (!isValidatedParagraphEditPlan(plan)) {
    assert.fail("Expected a planner-issued validated paragraph plan.");
  }
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
  assert.equal(afterOperators.length, 3);
  assert.deepEqual(
    afterOperators.map((operator) => operator.textObjectIndex),
    beforeTextObjectIndices,
  );
  assert.deepEqual(
    afterOperators.map((operator) => operator.ctm),
    beforeCtms,
  );
  assert.deepEqual(
    afterOperators.map((operator) => operator.textLineMatrix),
    beforeMatrices,
  );
});

test("paragraph planner rewrites fragmented Tj/TJ operators within each preserved line", async () => {
  const original = await fragmentedParagraphFixture();
  const { resolvedFont, fontMetrics, allOperators } =
    await planningContext(original);
  assert.equal(allOperators.length, 4);
  assert.equal(allOperators[0].kind, "Tj");
  assert.equal(allOperators[1].kind, "TJ");
  assert.equal(allOperators[2].kind, "Tj");
  assert.equal(allOperators[3].kind, "Tj");

  const beforeMatrices = allOperators.map((operator) =>
    matrixCopy(operator.textLineMatrix),
  );

  const plan = buildParagraphEditPlan({
    pageIndex: 0,
    contentStreamIndex: 0,
    allOperators,
    operatorIndices: [0, 1, 2, 3],
    replacementText: "Alpha combined\nBeta combined",
    resolvedFont,
    fontMetrics,
  });

  assert.ok(isValidatedParagraphEditPlan(plan));
  assert.deepEqual(plan.originalLines, [
    "First alpha beta",
    "Second line",
  ]);
  assert.deepEqual(plan.replacementLines, [
    "Alpha combined",
    "Beta combined",
  ]);
  assert.equal(plan.subPlans.length, 4);
  assert.equal(plan.subPlans[0].replacementText, "Alpha combined");
  assert.equal(plan.subPlans[1].replacementText, "");
  assert.equal(plan.subPlans[2].replacementText, "Beta combined");
  assert.equal(plan.subPlans[3].replacementText, "");

  const edited = await PDFDocument.load(original.slice());
  await applyParagraphEditPlanToDocument(edited, plan);
  const bytes = await edited.save();

  assert.deepEqual(await extractText(bytes), [
    "Alpha combined",
    "Beta combined",
  ]);
  const afterOperators = walkTextShowOperators(
    await decodedContentStreamBytes(bytes),
  );
  assert.equal(afterOperators.length, 4);
  assert.deepEqual(
    afterOperators.map((operator) => operator.textLineMatrix),
    beforeMatrices,
  );
});

test("paragraph planner groups x-shifted same-baseline pieces as one line but keeps them read-only", async () => {
  const original = await threeOperatorFragmentedParagraphFixture();
  const { resolvedFont, fontMetrics, allOperators } =
    await planningContext(original);
  assert.equal(allOperators.length, 3);

  const shifted = matrixCopy(allOperators[1].textLineMatrix);
  assert.ok(shifted);
  shifted[4] += 24;
  const altered = allOperators.map((operator, index) =>
    index === 1 ? { ...operator, textLineMatrix: shifted } : operator,
  );

  const plan = buildParagraphEditPlan({
    pageIndex: 0,
    contentStreamIndex: 0,
    allOperators: altered,
    operatorIndices: [0, 1, 2],
    replacementText: "First replacement\nSecond replacement",
    resolvedFont,
    fontMetrics,
  });

  assert.equal(plan.editable, false);
  assert.match(plan.reason, /positioned independently|line break/i);
});

test("paragraph planner counts fragmented operators by logical line, not operator count", async () => {
  const original = await fragmentedParagraphFixture();
  const { resolvedFont, fontMetrics, allOperators } =
    await planningContext(original);

  const plan = buildParagraphEditPlan({
    pageIndex: 0,
    contentStreamIndex: 0,
    allOperators,
    operatorIndices: [0, 1, 2, 3],
    replacementText: "Only one replacement line",
    resolvedFont,
    fontMetrics,
  });

  assert.equal(plan.editable, false);
  assert.match(plan.reason, /exactly 2 lines/i);
});

test("paragraph writer rejects a stale fragmented operator without partially publishing earlier lines", async () => {
  const original = await fragmentedParagraphFixture();
  const { resolvedFont, fontMetrics, allOperators } =
    await planningContext(original);
  const plan = buildParagraphEditPlan({
    pageIndex: 0,
    contentStreamIndex: 0,
    allOperators,
    operatorIndices: [0, 1, 2, 3],
    replacementText: "Alpha combined\nBeta combined",
    resolvedFont,
    fontMetrics,
  });
  assert.ok(isValidatedParagraphEditPlan(plan));

  const edited = await PDFDocument.load(original.slice());
  const page = edited.getPages()[0];
  const contents = page.node.Contents();
  const stream =
    contents instanceof PDFArray
      ? edited.context.lookup(contents.get(0), PDFRawStream)
      : (contents as PDFRawStream);
  const decoded = decodePDFRawStream(stream).decode();
  const staleTarget = plan.subPlans[3];
  const mutated = decoded.slice();
  mutated[staleTarget.byteOffset] =
    mutated[staleTarget.byteOffset] === 0x20
      ? 0x21
      : mutated[staleTarget.byteOffset] ^ 0x01;
  page.node.set(
    PDFName.of("Contents"),
    edited.context.register(edited.context.flateStream(mutated)),
  );

  await assert.rejects(
    () => applyParagraphEditPlanToDocument(edited, plan),
    (error: unknown) => error instanceof EditPlanRejectedError,
  );

  // The document was never published with the earlier line replacements.
  const afterFailure = await edited.save();
  const textAfterFailure = (await extractText(afterFailure)).join(" ");
  assert.doesNotMatch(textAfterFailure, /Alpha combined|Beta combined/);
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
  assert.match(plan.reason, /one native PDF line|same-line editor/i);
});

test("paragraph planner rejects horizontal-only repositioning on one baseline", async () => {
  const original = await fixture(["One", "Two"]);
  const { resolvedFont, fontMetrics, allOperators } =
    await planningContext(original);

  const firstMatrix = matrixCopy(allOperators[0].textLineMatrix);
  assert.ok(firstMatrix);
  const shiftedSameBaseline: Matrix2x3 = [...firstMatrix];
  shiftedSameBaseline[4] += 24;
  const altered = allOperators.map((operator, index) =>
    index === 1
      ? { ...operator, textLineMatrix: shiftedSameBaseline }
      : operator,
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
  assert.match(plan.reason, /one native PDF line|same-line editor/i);
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
  if (!isValidatedParagraphEditPlan(plan)) {
    assert.fail("Expected a planner-issued validated paragraph plan.");
  }

  const forged = { ...plan };
  const edited = await PDFDocument.load(original.slice());
  await assert.rejects(
    () => applyParagraphEditPlanToDocument(edited, forged as typeof plan),
    (error: unknown) =>
      error instanceof EditPlanRejectedError &&
      /planner-issued validated paragraph/i.test(error.message),
  );
});
