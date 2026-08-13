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
import { exportEditedPdf } from "../lib/pdf/edit/export.ts";
import { createWhiteoutElement, createTextElement, type EditElement } from "../lib/pdf/edit/elements.ts";

// Restyle's whiteout HIDES the original glyphs; it never removed them. The
// exported file therefore carried both the original and the replacement in
// its text layer, so copy-paste, Ctrl+F and any downstream parser saw the
// value the user believed they had replaced. These tests pin the blanking
// path that fixes it, and the honest fallback for the cases it can't cover.

async function invoicePdf(splitOperators = false) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  if (!splitOperators) {
    page.drawText("Total Amount 1350.00", { x: 50, y: 640, size: 12, font });
    return doc.save();
  }
  // Two back-to-back Tj with no positioning between them: pdfjs merges these
  // into ONE visual run, so no single operator covers the whole line.
  const context = doc.context;
  const fonts = context.obj({});
  fonts.set(PDFName.of("F1"), font.ref);
  page.node.Resources()!.set(PDFName.of("Font"), fonts);
  const body = "BT\n/F1 12 Tf\n1 0 0 1 50 640 Tm\n(Total Amount ) Tj (1350.00) Tj\nET";
  page.node.set(PDFName.of("Contents"), context.register(context.flateStream(new TextEncoder().encode(body))));
  return doc.save();
}

/** Mirrors what EditPdfTool's restyleSelectedRun does, minus React. */
async function restyle(bytes: Uint8Array) {
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

  let blanked = false;
  if (operator) {
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
    if (plan.editable && !runSpansMultipleOperators(plan.originalText, run.str)) {
      await applyEditPlanToDocument(doc, plan, resolvedFont.bytesPerCode, {
        isolate: locatedOperator.locator.kind === "xobject",
      });
      blanked = true;
    }
  }

  const afterBlank = await doc.save();
  const elements: EditElement[] = [
    { ...createWhiteoutElement("w", 0, 8, 17.5), widthPct: 30, heightPct: 3 },
    { ...createTextElement("t", 0, 8, 17.6), text: "Total Amount 9999.99", fontSizePt: 12, bold: true },
  ];
  const { bytes: exported } = await exportEditedPdf(
    afterBlank.buffer.slice(afterBlank.byteOffset, afterBlank.byteOffset + afterBlank.byteLength) as ArrayBuffer,
    elements,
  );
  return { blanked, exported };
}

async function extract(bytes: Uint8Array) {
  const doc = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
  const content = await (await doc.getPage(1)).getTextContent();
  return content.items.map((i) => ("str" in i ? i.str : "")).filter(Boolean);
}

test("a restyled amount is really gone from the exported file, not just covered", async () => {
  const { blanked, exported } = await restyle(await invoicePdf());
  assert.equal(blanked, true, "a plain single-operator run must be blankable");

  const text = await extract(exported);
  assert.ok(text.some((s) => s.includes("9999.99")), `replacement should be present, got ${JSON.stringify(text)}`);
  // The whole point: the original must NOT survive anywhere in the text layer.
  assert.ok(
    !text.some((s) => s.includes("1350.00")),
    `original amount still extractable after restyle: ${JSON.stringify(text)}`,
  );
});

test("blanking removes only the restyled run, leaving the rest of the page intact", async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText("Keep this line", { x: 50, y: 700, size: 12, font });
  page.drawText("Total Amount 1350.00", { x: 50, y: 640, size: 12, font });
  page.drawText("Keep this too", { x: 50, y: 600, size: 12, font });

  const { blanked, exported } = await restyle(await doc.save());
  assert.equal(blanked, true);

  const text = await extract(exported);
  assert.ok(text.some((s) => s.includes("Keep this line")), "neighbouring text must survive");
  assert.ok(text.some((s) => s.includes("Keep this too")), "neighbouring text must survive");
  assert.ok(!text.some((s) => s.includes("1350.00")), "only the restyled run should be removed");
});

test("a run pdfjs merged from several operators is NOT blanked, so the caller can disclose it", async () => {
  // Rewriting the one matched operator would delete half the line and leave
  // the rest under the whiteout -- worse than leaving it whole. The engine
  // declines, and restyleSelectedRun surfaces a notice instead.
  const { blanked, exported } = await restyle(await invoicePdf(true));
  assert.equal(blanked, false, "a merged multi-operator run must not be blanked");

  const text = await extract(exported);
  assert.ok(text.some((s) => s.includes("9999.99")), "the restyle itself must still happen");
  assert.ok(
    text.some((s) => s.includes("1350.00")),
    "this is the disclosed case: original text remains, which is why a notice is shown",
  );
});
