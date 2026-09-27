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
} from "../lib/pdf/edit/contentStream.ts";
import { resolveFont } from "../lib/pdf/edit/fontEncoding.ts";
import { resolveFontMetrics } from "../lib/pdf/edit/fontMetrics.ts";
import {
  buildParagraphEditPlan,
  isValidatedParagraphEditPlan,
  type ValidatedParagraphEditPlan,
} from "../lib/pdf/edit/paragraphEditPlan.ts";
import {
  applyParagraphEditPlanToDocument,
  EditPlanRejectedError,
} from "../lib/pdf/edit/applyEditPlan.ts";

async function decodedContentStreamBytes(
  pdfBytes: Uint8Array,
): Promise<Uint8Array> {
  const loaded = await PDFDocument.load(pdfBytes);
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
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    combined.set(part, offset);
    offset += part.length;
  }
  return combined;
}

function firstFontDict(
  pageResources: PDFDict,
  context: import("pdf-lib").PDFContext,
): PDFDict {
  const fontResources = pageResources.lookup(PDFName.of("Font"), PDFDict);
  return context.lookup(fontResources.get(fontResources.keys()[0]), PDFDict);
}

function hexOf(text: string): string {
  return Buffer.from(text, "ascii").toString("hex");
}

async function extractPageStrings(pdfBytes: Uint8Array): Promise<string[]> {
  const doc = await pdfjsLib.getDocument({ data: pdfBytes.slice() }).promise;
  try {
    const page = await doc.getPage(1);
    const content = await page.getTextContent();
    return content.items
      .map((item) => ("str" in item ? item.str : ""))
      .filter((text) => text.length > 0);
  } finally {
    await doc.destroy();
  }
}

async function buildFixture(
  lines: Array<{
    text: string;
    kind: "Tj" | "TJ" | "'" | '"';
    sameLineWithPrevious?: boolean;
  }>,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.setFont(font);
  const fontKey = page.node.newFontDictionary(font.name, font.ref);

  const ops = [
    beginText(),
    setFontAndSize(fontKey, 18),
    setLineHeight(20),
    moveText(50, 700),
  ];
  lines.forEach((line, index) => {
    if (line.kind === "Tj") {
      if (index > 0 && !line.sameLineWithPrevious) ops.push(nextLine());
      ops.push(showText(PDFHexString.of(hexOf(line.text))));
    } else if (line.kind === "TJ") {
      if (index > 0 && !line.sameLineWithPrevious) ops.push(nextLine());
      const array = PDFArray.withContext(doc.context);
      array.push(PDFHexString.of(hexOf(line.text)));
      ops.push(PDFOperator.of(PDFOperatorNames.ShowTextAdjusted, [array]));
    } else if (line.kind === "'") {
      ops.push(
        PDFOperator.of(PDFOperatorNames.ShowTextLine, [
          PDFHexString.of(hexOf(line.text)),
        ]),
      );
    } else {
      ops.push(
        PDFOperator.of(PDFOperatorNames.ShowTextLineAndSpace, [
          PDFNumber.of(0),
          PDFNumber.of(0),
          PDFHexString.of(hexOf(line.text)),
        ]),
      );
    }
  });
  ops.push(endText());
  page.pushOperators(...ops);
  return doc.save();
}

async function planFor(
  bytes: Uint8Array,
  operatorIndices: number[],
  replacementText: string,
  mutate?: (
    operators: ReturnType<typeof walkTextShowOperators>,
  ) => ReturnType<typeof walkTextShowOperators>,
) {
  const loaded = await PDFDocument.load(bytes.slice());
  const page = loaded.getPages()[0];
  const fontDict = firstFontDict(page.node.Resources()!, loaded.context);
  const resolvedFont = resolveFont(fontDict, loaded.context);
  const fontMetrics = resolveFontMetrics(
    fontDict,
    loaded.context,
    resolvedFont,
  );
  const streamBytes = await decodedContentStreamBytes(bytes.slice());
  const parsed = walkTextShowOperators(streamBytes);
  const allOperators = mutate ? mutate(parsed) : parsed;
  const plan = buildParagraphEditPlan({
    pageIndex: 0,
    contentStreamIndex: 0,
    allOperators,
    operatorIndices,
    replacementText,
    resolvedFont,
    fontMetrics,
  });
  return { plan, resolvedFont, allOperators };
}

test("paragraph planner preserves two existing native lines and exports both replacements atomically", async () => {
  const original = await buildFixture([
    { text: "Before", kind: "Tj" },
    { text: "Old line one", kind: "Tj" },
    { text: "Old line two", kind: "Tj" },
    { text: "After", kind: "Tj" },
  ]);

  const { plan, resolvedFont } = await planFor(
    original,
    [1, 2],
    "New line one\nNew line two",
  );
  assert.ok(isValidatedParagraphEditPlan(plan));
  assert.equal(plan.lines.length, 2);
  assert.equal(plan.originalText, "Old line one\nOld line two");
  assert.equal(plan.lines[0]?.replacementText, "New line one");
  assert.equal(plan.lines[1]?.replacementText, "New line two");

  const editedDoc = await PDFDocument.load(original.slice());
  await applyParagraphEditPlanToDocument(
    editedDoc,
    plan,
    resolvedFont.bytesPerCode,
  );
  const edited = await editedDoc.save();
  assert.deepEqual(await extractPageStrings(edited), [
    "Before",
    "New line one",
    "New line two",
    "After",
  ]);
});

test("paragraph planner reuses same-line multi-run authority independently inside one paragraph line", async () => {
  const original = await buildFixture([
    { text: "Before", kind: "Tj" },
    { text: "First ", kind: "Tj" },
    { text: "line", kind: "TJ", sameLineWithPrevious: true },
    { text: "Second line", kind: "Tj" },
    { text: "After", kind: "Tj" },
  ]);

  const { plan, resolvedFont } = await planFor(
    original,
    [1, 2, 3],
    "Merged first\nChanged second",
  );
  assert.ok(isValidatedParagraphEditPlan(plan));
  assert.equal(plan.lines.length, 2);
  assert.deepEqual(plan.lines[0]?.operatorIndices, [1, 2]);
  assert.deepEqual(plan.lines[1]?.operatorIndices, [3]);
  assert.equal(plan.lines[0]?.subPlans.length, 2);
  assert.equal(plan.lines[1]?.subPlans.length, 1);

  const editedDoc = await PDFDocument.load(original.slice());
  await applyParagraphEditPlanToDocument(
    editedDoc,
    plan,
    resolvedFont.bytesPerCode,
  );
  const edited = await editedDoc.save();
  assert.deepEqual(await extractPageStrings(edited), [
    "Before",
    "Merged first",
    "Changed second",
    "After",
  ]);
});

test("paragraph planner preserves a quote operator's existing line move", async () => {
  const original = await buildFixture([
    { text: "Line one", kind: "Tj" },
    { text: "Line two", kind: "'" },
  ]);
  const { plan, resolvedFont } = await planFor(
    original,
    [0, 1],
    "Changed one\nChanged two",
  );
  assert.ok(isValidatedParagraphEditPlan(plan));

  const editedDoc = await PDFDocument.load(original.slice());
  await applyParagraphEditPlanToDocument(
    editedDoc,
    plan,
    resolvedFont.bytesPerCode,
  );
  const edited = await editedDoc.save();
  assert.deepEqual(await extractPageStrings(edited), [
    "Changed one",
    "Changed two",
  ]);
});

test("paragraph planner requires one explicit replacement line per proven native line", async () => {
  const original = await buildFixture([
    { text: "One", kind: "Tj" },
    { text: "Two", kind: "Tj" },
  ]);
  const { plan } = await planFor(original, [0, 1], "Only one line");
  assert.equal(plan.editable, false);
  assert.match(plan.reason, /2 proven PDF lines|exactly 2 replacement lines/i);
});

test("paragraph planner keeps complex shaping line-by-line instead of combining shaped authority", async () => {
  const original = await buildFixture([
    { text: "One", kind: "Tj" },
    { text: "Two", kind: "Tj" },
  ]);
  const { plan } = await planFor(original, [0, 1], "Simple\ne\u0301");
  assert.equal(plan.editable, false);
  assert.match(plan.reason, /complex shaping|individually/i);
});

test("paragraph planner rejects a cross-text-object selection", async () => {
  const original = await buildFixture([
    { text: "One", kind: "Tj" },
    { text: "Two", kind: "Tj" },
  ]);
  const { plan } = await planFor(
    original,
    [0, 1],
    "Changed one\nChanged two",
    (operators) =>
      operators.map((operator, index) =>
        index === 1 ? { ...operator, textObjectIndex: 999 } : operator,
      ),
  );
  assert.equal(plan.editable, false);
  assert.match(plan.reason, /separate native PDF text objects/i);
});

test("paragraph planner rejects incompatible CTMs", async () => {
  const original = await buildFixture([
    { text: "One", kind: "Tj" },
    { text: "Two", kind: "Tj" },
  ]);
  const { plan } = await planFor(
    original,
    [0, 1],
    "Changed one\nChanged two",
    (operators) =>
      operators.map((operator, index) => {
        if (index !== 1 || !operator.ctm) return operator;
        const ctm: Matrix2x3 = [...operator.ctm];
        ctm[4] += 12;
        return { ...operator, ctm };
      }),
  );
  assert.equal(plan.editable, false);
  assert.match(plan.reason, /incompatible PDF transforms/i);
});

test("paragraph writer rejects a plain-object copy of a validated plan", async () => {
  const original = await buildFixture([
    { text: "One", kind: "Tj" },
    { text: "Two", kind: "Tj" },
  ]);
  const { plan, resolvedFont } = await planFor(
    original,
    [0, 1],
    "Changed one\nChanged two",
  );
  assert.ok(isValidatedParagraphEditPlan(plan));

  const forged = { ...plan } as ValidatedParagraphEditPlan;
  const editedDoc = await PDFDocument.load(original.slice());
  await assert.rejects(
    () =>
      applyParagraphEditPlanToDocument(
        editedDoc,
        forged,
        resolvedFont.bytesPerCode,
      ),
    (error: unknown) =>
      error instanceof EditPlanRejectedError &&
      /validated paragraph planner/i.test(error.message),
  );
});
