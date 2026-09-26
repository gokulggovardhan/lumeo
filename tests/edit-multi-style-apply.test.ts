import assert from "node:assert/strict";
import test from "node:test";
import {
  PDFDict,
  PDFDocument,
  PDFName,
  StandardFonts,
} from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { applyNativeTextStyleBatchToDocument } from "../lib/pdf/edit/applyEditPlan.ts";
import { collectPageTextOperators } from "../lib/pdf/edit/formXObjects.ts";
import { resolveFont } from "../lib/pdf/edit/fontEncoding.ts";
import { resolveFontMetrics } from "../lib/pdf/edit/fontMetrics.ts";
import { buildNativeTextStyleBatchPlan } from "../lib/pdf/edit/multiStylePlan.ts";

function asciiBytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

async function buildMixedFontFixture(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const helvetica = await doc.embedFont(StandardFonts.Helvetica);
  const times = await doc.embedFont(StandardFonts.TimesRoman);

  const fonts = doc.context.obj({});
  fonts.set(PDFName.of("FHelvetica"), helvetica.ref);
  fonts.set(PDFName.of("FTimes"), times.ref);
  page.node.Resources()!.set(PDFName.of("Font"), fonts);

  const stream = doc.context.stream(
    asciiBytes(
      [
        "BT",
        "/FHelvetica 12 Tf",
        "0 g",
        "1 0 0 1 60 740 Tm",
        "(Mixed alpha) Tj",
        "/FTimes 18 Tf",
        "0.2 0.4 0.8 rg",
        "1 0 0 1 60 690 Tm",
        "(Mixed beta) Tj",
        "/FHelvetica 10 Tf",
        "0 g",
        "1 0 0 1 60 640 Tm",
        "(Neighbor) Tj",
        "ET",
      ].join("\n"),
    ),
  );
  page.node.set(PDFName.of("Contents"), doc.context.register(stream));
  return doc.save();
}

function resolvedFontFor(
  doc: PDFDocument,
  resources: PDFDict,
  resourceName: string,
) {
  const fonts = resources.lookup(PDFName.of("Font"), PDFDict);
  const fontDict = doc.context.lookup(
    fonts.get(PDFName.of(resourceName)),
    PDFDict,
  );
  const resolvedFont = resolveFont(fontDict, doc.context);
  return {
    resolvedFont,
    fontMetrics: resolveFontMetrics(fontDict, doc.context, resolvedFont),
  };
}

async function extractedStrings(bytes: Uint8Array): Promise<string[]> {
  const doc = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
  const page = await doc.getPage(1);
  const content = await page.getTextContent();
  return content.items
    .map((item) => ("str" in item ? item.str : ""))
    .filter(Boolean);
}

test("mixed-span style writer changes two native fonts atomically while preserving text, resources and neighbor state", async () => {
  const original = await buildMixedFontFixture();
  const loaded = await PDFDocument.load(original.slice());
  const located = collectPageTextOperators(loaded, 0);

  assert.equal(located.length, 3);
  assert.deepEqual(
    located.map((entry) => entry.operator.fontResourceName),
    ["FHelvetica", "FTimes", "FHelvetica"],
  );

  const inputs = located.slice(0, 2).map((entry, index) => {
    const resourceName = entry.operator.fontResourceName;
    assert.ok(resourceName);
    const profile = resolvedFontFor(loaded, entry.resources, resourceName);
    return {
      spanId: `span-${index}`,
      locatedOperator: entry,
      ...profile,
    };
  });

  const batch = buildNativeTextStyleBatchPlan({
    pageIndex: 0,
    inputs,
    patch: {
      fontSizePt: 16,
      horizontalScalingPct: 90,
      fillColorHex: "#008800",
    },
  });
  assert.equal(batch.editable, true);
  if (!batch.editable) return;

  await applyNativeTextStyleBatchToDocument(loaded, batch);
  const editedBytes = await loaded.save();

  assert.deepEqual(await extractedStrings(editedBytes), [
    "Mixed alpha",
    "Mixed beta",
    "Neighbor",
  ]);

  const reloaded = await PDFDocument.load(editedBytes.slice());
  const after = collectPageTextOperators(reloaded, 0);
  assert.equal(after.length, 3);

  assert.equal(after[0].operator.fontResourceName, "FHelvetica");
  assert.equal(after[1].operator.fontResourceName, "FTimes");
  assert.equal(after[0].operator.fontSizePt, 16);
  assert.equal(after[1].operator.fontSizePt, 16);
  assert.equal(after[0].operator.horizontalScalingPct, 90);
  assert.equal(after[1].operator.horizontalScalingPct, 90);
  assert.equal(after[0].operator.fillColor?.cssHex, "#008800");
  assert.equal(after[1].operator.fillColor?.cssHex, "#008800");

  // The local wrappers restore the pre-existing state immediately after each
  // changed show. The untouched neighbor therefore keeps its original font,
  // size, scale and black paint.
  assert.equal(after[2].operator.fontResourceName, "FHelvetica");
  assert.equal(after[2].operator.fontSizePt, 10);
  assert.equal(after[2].operator.horizontalScalingPct, 100);
  assert.equal(after[2].operator.fillColor?.cssHex, "#000000");
});

test("mixed-span style writer rejects a rejected plan before mutating the document", async () => {
  const original = await buildMixedFontFixture();
  const loaded = await PDFDocument.load(original.slice());

  await assert.rejects(
    () =>
      applyNativeTextStyleBatchToDocument(loaded, {
        editable: false,
        pageIndex: 0,
        contentStreamIndex: 0,
        entries: [],
        reason: "Blocked by preflight.",
      }),
    /Blocked by preflight/,
  );

  const after = await loaded.save();
  assert.deepEqual(await extractedStrings(after), [
    "Mixed alpha",
    "Mixed beta",
    "Neighbor",
  ]);
});
