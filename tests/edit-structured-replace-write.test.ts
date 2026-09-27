import assert from "node:assert/strict";
import test from "node:test";
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
  PDFStream,
  StandardFonts,
  decodePDFRawStream,
} from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { walkTextShowOperators } from "../lib/pdf/edit/contentStream.ts";
import { resolveFont } from "../lib/pdf/edit/fontEncoding.ts";
import { resolveFontMetrics } from "../lib/pdf/edit/fontMetrics.ts";
import {
  buildEditPlan,
  isValidatedEditPlan,
} from "../lib/pdf/edit/editPlan.ts";
import {
  applyValidatedEditPlanBatchToDocument,
  EditPlanRejectedError,
} from "../lib/pdf/edit/applyEditPlan.ts";
import { PdfFontRegistry } from "../lib/pdf/edit/fontRegistry.ts";
import { collectPageTextOperators } from "../lib/pdf/edit/formXObjects.ts";
import { analyzeNativeReplacePage } from "../lib/pdf/edit/nativeReplacePageAnalysis.ts";
import { searchPdfPageText } from "../lib/pdf/edit/textSearch.ts";
import { planStructuredReplaceAllPage } from "../lib/pdf/edit/structuredReplaceAll.ts";
import { preflightStructuredReplacePageWrites } from "../lib/pdf/edit/structuredReplaceWritePlan.ts";

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
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function firstFontDict(
  resources: PDFDict,
  context: import("pdf-lib").PDFContext,
): PDFDict {
  const fonts = resources.lookup(PDFName.of("Font"), PDFDict);
  return context.lookup(fonts.get(fonts.keys()[0]), PDFDict);
}

async function extractText(pdfBytes: Uint8Array): Promise<string> {
  const doc = await pdfjsLib.getDocument({ data: pdfBytes.slice() }).promise;
  const page = await doc.getPage(1);
  const content = await page.getTextContent();
  return content.items
    .map((item) => ("str" in item ? item.str : ""))
    .join(" ");
}

test("structured Replace All revalidates a real page and preflights repeated matches without mutation", async () => {
  const source = await PDFDocument.create();
  const page = source.addPage([612, 792]);
  const font = await source.embedFont(StandardFonts.Helvetica);
  page.drawText("foo foo", { x: 50, y: 700, size: 18, font });
  const bytes = await source.save();

  const pdfLibDoc = await PDFDocument.load(bytes.slice());
  const registry = new PdfFontRegistry(pdfLibDoc);
  const pdfJsDoc = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
  const pdfJsPage = await pdfJsDoc.getPage(1);

  const analysis = await analyzeNativeReplacePage({
    page: pdfJsPage,
    pdfDocument: pdfLibDoc,
    pageIndex: 0,
    dependencies: {
      collectPageTextOperators,
      fontRegistry: registry,
    },
  });
  const matches = searchPdfPageText(analysis.pageTextModel, "foo");
  assert.equal(matches.length, 2);
  assert.ok(matches.every((match) => match.capability === "editable"));

  const pagePlan = planStructuredReplaceAllPage({
    page: analysis.pageTextModel,
    matches,
    replacement: "bar",
  });
  assert.equal(pagePlan.plannedMatchCount, 2);
  assert.equal(pagePlan.candidates.length, 1);

  const preflight = await preflightStructuredReplacePageWrites({
    analysis,
    pagePlan,
    dependencies: {
      fontRegistry: registry,
      shapeText: null,
    },
  });

  assert.equal(preflight.validatedMatchCount, 2);
  assert.equal(preflight.skipped.length, 0);
  assert.equal(preflight.units.length, 1);
  assert.equal(preflight.units[0].plans.length, 1);
  assert.ok(isValidatedEditPlan(preflight.units[0].plans[0]));

  const before = await pdfLibDoc.save();
  assert.match(await extractText(before), /foo foo/);
});

test("validated replacement batch rewrites multiple original offsets right-to-left and reopens cleanly", async () => {
  const source = await PDFDocument.create();
  const page = source.addPage([612, 792]);
  const font = await source.embedFont(StandardFonts.Helvetica);
  page.drawText("Alpha", { x: 50, y: 700, size: 18, font });
  page.drawText("Beta", { x: 50, y: 650, size: 18, font });
  const original = await source.save();

  const planningDoc = await PDFDocument.load(original.slice());
  const planningPage = planningDoc.getPages()[0];
  const fontDict = firstFontDict(planningPage.node.Resources()!, planningDoc.context);
  const resolvedFont = resolveFont(fontDict, planningDoc.context);
  const fontMetrics = resolveFontMetrics(fontDict, planningDoc.context, resolvedFont);
  const operators = walkTextShowOperators(
    await decodedContentStreamBytes(original.slice()),
  );
  assert.equal(operators.length, 2);

  const first = buildEditPlan({
    pageIndex: 0,
    contentStreamIndex: 0,
    operatorIndex: 0,
    operator: operators[0],
    replacementText: "First",
    resolvedFont,
    fontMetrics,
  });
  const second = buildEditPlan({
    pageIndex: 0,
    contentStreamIndex: 0,
    operatorIndex: 1,
    operator: operators[1],
    replacementText: "Second",
    resolvedFont,
    fontMetrics,
  });
  assert.ok(isValidatedEditPlan(first));
  assert.ok(isValidatedEditPlan(second));

  const editedDoc = await PDFDocument.load(original.slice());
  await applyValidatedEditPlanBatchToDocument(editedDoc, [
    { plan: first, bytesPerCode: resolvedFont.bytesPerCode },
    { plan: second, bytesPerCode: resolvedFont.bytesPerCode },
  ]);
  const edited = await editedDoc.save();
  const text = await extractText(edited);
  assert.match(text, /First/);
  assert.match(text, /Second/);
  assert.doesNotMatch(text, /Alpha/);
  assert.doesNotMatch(text, /Beta/);

  await assert.rejects(
    () =>
      applyValidatedEditPlanBatchToDocument(
        PDFDocument.load(original.slice()) as never,
        [],
      ),
    /no validated edit plans/i,
  );
});

test("validated replacement batch rejects duplicate native byte ranges", async () => {
  const source = await PDFDocument.create();
  const page = source.addPage([612, 792]);
  const font = await source.embedFont(StandardFonts.Helvetica);
  page.drawText("Alpha", { x: 50, y: 700, size: 18, font });
  const original = await source.save();

  const planningDoc = await PDFDocument.load(original.slice());
  const planningPage = planningDoc.getPages()[0];
  const fontDict = firstFontDict(planningPage.node.Resources()!, planningDoc.context);
  const resolvedFont = resolveFont(fontDict, planningDoc.context);
  const fontMetrics = resolveFontMetrics(fontDict, planningDoc.context, resolvedFont);
  const operators = walkTextShowOperators(
    await decodedContentStreamBytes(original.slice()),
  );
  const plan = buildEditPlan({
    pageIndex: 0,
    contentStreamIndex: 0,
    operatorIndex: 0,
    operator: operators[0],
    replacementText: "First",
    resolvedFont,
    fontMetrics,
  });
  assert.ok(isValidatedEditPlan(plan));

  const editedDoc = await PDFDocument.load(original.slice());
  await assert.rejects(
    () =>
      applyValidatedEditPlanBatchToDocument(editedDoc, [
        { plan, bytesPerCode: resolvedFont.bytesPerCode },
        { plan, bytesPerCode: resolvedFont.bytesPerCode },
      ]),
    (error: unknown) =>
      error instanceof EditPlanRejectedError &&
      /overlap/i.test((error as Error).message),
  );
});
