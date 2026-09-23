import assert from "node:assert/strict";
import test from "node:test";
import {
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
  PDFRef,
  StandardFonts,
  decodePDFRawStream,
} from "pdf-lib";
import { applyEditPlanToDocument } from "../lib/pdf/edit/applyEditPlan.ts";
import { buildEditPlan } from "../lib/pdf/edit/editPlan.ts";
import { resolveFont } from "../lib/pdf/edit/fontEncoding.ts";
import { resolveFontMetrics } from "../lib/pdf/edit/fontMetrics.ts";
import { collectPageTextOperators } from "../lib/pdf/edit/formXObjects.ts";
import { buildNativePaintPlan, paintColorFromCssHex } from "../lib/pdf/edit/nativePaint.ts";

async function fixture() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 300]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.node.Resources()!.set(PDFName.of("Font"), doc.context.obj({ F1: font.ref }));
  page.node.set(
    PDFName.of("Contents"),
    doc.context.register(doc.context.stream("BT /F1 12 Tf 0 g (Alpha) Tj (Beta) Tj ET")),
  );
  return doc.save();
}

test("document writer composes native colour with native text state and restores paint before following text", async () => {
  const original = await fixture();
  const doc = await PDFDocument.load(original.slice());
  const located = collectPageTextOperators(doc, 0);
  assert.equal(located.length, 2);
  assert.equal(located[0].operator.fillColor?.colorSpace, "DeviceGray");
  assert.equal(located[0].operator.fillColor?.cssHex, "#000000");

  const fontDict = (located[0].resources.lookup(PDFName.of("Font"), PDFDict) as PDFDict)
    .lookup(PDFName.of("F1"), PDFDict);
  const resolvedFont = resolveFont(fontDict, doc.context);
  const fontMetrics = resolveFontMetrics(fontDict, doc.context, resolvedFont);
  const plan = buildEditPlan({
    pageIndex: 0,
    contentStreamIndex: 0,
    formPath: null,
    operatorIndex: 0,
    operator: located[0].operator,
    replacementText: "Alpha",
    resolvedFont,
    fontMetrics,
    replacementTextState: {
      fontSizePt: 13,
      charSpacing: 0.2,
      wordSpacing: 0,
      horizontalScalingPct: 97,
    },
  });
  assert.equal(plan.editable, true, plan.reason ?? "");

  const red = paintColorFromCssHex("#ff0000");
  assert.ok(red);
  const paintPlan = buildNativePaintPlan(located[0].operator, { fillColor: red });
  assert.equal(paintPlan.editable, true);

  await applyEditPlanToDocument(doc, plan, resolvedFont.bytesPerCode, {
    nativePaintPlan: paintPlan,
  });
  const saved = await doc.save();
  const reloaded = await PDFDocument.load(saved.slice());
  const redetected = collectPageTextOperators(reloaded, 0);
  assert.equal(redetected.length, 2);
  assert.equal(redetected[0].operator.fillColor?.colorSpace, "DeviceRGB");
  assert.equal(redetected[0].operator.fillColor?.cssHex, "#ff0000");
  assert.equal(redetected[0].operator.fontSizePt, 13);
  assert.equal(redetected[0].operator.charSpacing, 0.2);
  assert.equal(redetected[0].operator.horizontalScalingPct, 97);
  assert.equal(redetected[1].operator.fillColor?.colorSpace, "DeviceGray");
  assert.equal(redetected[1].operator.fillColor?.cssHex, "#000000");

  const contents = reloaded.getPages()[0].node.get(PDFName.of("Contents"));
  assert.ok(contents instanceof PDFRef);
  const raw = reloaded.context.lookup(contents);
  assert.ok(raw instanceof PDFRawStream);
  const decoded = new TextDecoder().decode(decodePDFRawStream(raw).decode());
  const redIndex = decoded.indexOf("1 0 0 rg");
  const restoreIndex = decoded.indexOf("0 g", redIndex + 1);
  const lastTextIndex = decoded.lastIndexOf("Tj");
  assert.ok(redIndex >= 0, decoded);
  assert.ok(restoreIndex > redIndex, decoded);
  assert.ok(lastTextIndex > restoreIndex, decoded);
});
