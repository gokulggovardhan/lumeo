import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument, StandardFonts, PDFName, PDFDict } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { textRunsFromContent } from "../lib/pdf/edit/textRuns.ts";
import { collectPageTextOperators } from "../lib/pdf/edit/formXObjects.ts";
import { buildOperatorSpatialIndex, matchDetectedRunToOperatorIndexed, runSpansMultipleOperators } from "../lib/pdf/edit/matchTextRun.ts";
import { resolveFont } from "../lib/pdf/edit/fontEncoding.ts";
import { resolveFontMetrics } from "../lib/pdf/edit/fontMetrics.ts";
import { buildEditPlan } from "../lib/pdf/edit/editPlan.ts";
import { applyEditPlanToDocument } from "../lib/pdf/edit/applyEditPlan.ts";

// edit-restyle-blanking.test.ts proves the EXPORTED file no longer carries the
// original text. It never touches the intermediate the UI actually lives with:
// restyleSelectedRun puts the blanked bytes straight into historyState.pdfBytes,
// and the rasterize effect immediately re-renders the page FROM those bytes.
// If that intermediate can't be re-opened and drawn, the user's document is
// replaced by "This page could not be previewed" the instant they press
// Restyle -- with the edit applied and undo armed, so it looks like a
// successful edit destroyed the page.

async function invoicePdf() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  page.drawText("Total Amount 1350.00", { x: 50, y: 640, size: 12, font });
  return doc.save();
}

/** The blanking half of restyleSelectedRun, stopping where the UI does. */
async function blankedBytes(bytes: Uint8Array) {
  const pdfjsDoc = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
  const page = await pdfjsDoc.getPage(1);
  const viewport = page.getViewport({ scale: 1 });
  const runs = textRunsFromContent((await page.getTextContent()).items as never, viewport.transform, viewport.width, viewport.height);
  const run = runs.find((r) => r.str.includes("1350.00"));
  assert.ok(run, "fixture should contain the amount");

  const doc = await PDFDocument.load(bytes);
  const located = collectPageTextOperators(doc, 0);
  const index = buildOperatorSpatialIndex(located.map((l) => l.operator), viewport.transform);
  const operator = matchDetectedRunToOperatorIndexed(run, viewport.width, viewport.height, index);
  assert.ok(operator, "a plain single-operator run must match");

  const locatedOperator = located.find((l) => l.operator === operator)!;
  const fontDict = locatedOperator.resources
    .lookup(PDFName.of("Font"), PDFDict)
    .lookup(PDFName.of(operator.fontResourceName!), PDFDict);
  const resolvedFont = resolveFont(fontDict, doc.context);
  const plan = buildEditPlan({
    pageIndex: 0,
    contentStreamIndex: locatedOperator.locator.kind === "page" ? locatedOperator.locator.contentStreamIndex : 0,
    formPath: locatedOperator.locator.kind === "xobject" ? locatedOperator.locator.formPath : null,
    operatorIndex: locatedOperator.operatorIndex,
    operator,
    replacementText: "",
    resolvedFont,
    fontMetrics: resolveFontMetrics(fontDict, doc.context, resolvedFont),
  });
  assert.ok(plan.editable && !runSpansMultipleOperators(plan.originalText, run.str));
  await applyEditPlanToDocument(doc, plan, resolvedFont.bytesPerCode, { isolate: false });
  return doc.save();
}

test("the blanked bytes the UI re-renders from can still be opened and drawn", async () => {
  const blanked = await blankedBytes(await invoicePdf());

  const doc = await pdfjsLib.getDocument({ data: blanked.slice() }).promise;
  assert.equal(doc.numPages, 1);
  const page = await doc.getPage(1);

  // getOperatorList runs the same content-stream parse, font load and
  // resource resolution that a canvas render does -- it is the closest thing
  // to EFFECT B's page.render() that works without a DOM canvas, and it
  // throws on exactly the malformed-stream cases a render would.
  const ops = await page.getOperatorList();
  assert.ok(ops.fnArray.length > 0, "blanked page should still produce drawing operators");

  // And the point of blanking: the text is genuinely gone from this
  // intermediate, not merely from the later export.
  const content = await page.getTextContent();
  const text = content.items.map((i) => ("str" in i ? i.str : "")).join("");
  assert.ok(!text.includes("1350.00"), `original should be gone, got ${JSON.stringify(text)}`);
});
