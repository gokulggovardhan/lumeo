import assert from "node:assert/strict";
import test from "node:test";
import {
  PDFArray,
  PDFDocument,
  PDFNumber,
  PDFOperator,
  PDFOperatorNames,
  StandardFonts,
} from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { DocumentTextCapabilityClassifier } from "../lib/pdf/edit/documentTextCapability.ts";
import {
  collectPageTextOperators,
  type PageContentEvidence,
} from "../lib/pdf/edit/formXObjects.ts";
import { PdfFontRegistry } from "../lib/pdf/edit/fontRegistry.ts";
import { detectNativeTextSpans } from "../lib/pdf/edit/nativeTextDetection.ts";
import { reconcileTextDetections } from "../lib/pdf/edit/textReconciliation.ts";
import { textRunsFromContent } from "../lib/pdf/edit/textRuns.ts";

type PageInternals = {
  getFont(): [unknown, { toString(): string }];
  getContentStream(): { push(...ops: PDFOperator[]): void };
};

function pushBackToBackText({
  doc,
  textParts,
  fontSize = 20,
}: {
  doc: PDFDocument;
  textParts: readonly string[];
  fontSize?: number;
}) {
  const page = doc.addPage([612, 792]);
  return { page, fontSize, textParts };
}

async function makeBackToBackTextPdf() {
  const doc = await PDFDocument.create();
  const { page, fontSize } = pushBackToBackText({
    doc,
    textParts: ["Hello ", "World"],
  });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.setFont(font);
  const internals = page as unknown as PageInternals;
  const fontKey = internals.getFont()[1];

  internals.getContentStream().push(
    PDFOperator.of(PDFOperatorNames.BeginText),
    PDFOperator.of(PDFOperatorNames.SetFontAndSize, [
      fontKey as never,
      PDFNumber.of(fontSize),
    ]),
    PDFOperator.of(PDFOperatorNames.MoveText, [
      PDFNumber.of(50),
      PDFNumber.of(700),
    ]),
    PDFOperator.of(PDFOperatorNames.ShowText, [font.encodeText("Hello ")]),
    PDFOperator.of(PDFOperatorNames.ShowText, [font.encodeText("World")]),
    PDFOperator.of(PDFOperatorNames.EndText),
  );

  return {
    bytes: await doc.save(),
    expectedSecondX: 50 + font.widthOfTextAtSize("Hello ", fontSize),
  };
}

async function pdfJsRuns(bytes: Uint8Array) {
  const doc = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  return {
    viewport,
    runs: textRunsFromContent(
      content.items as never,
      viewport.transform,
      viewport.width,
      viewport.height,
    ),
  };
}

test("native walker advances implicit Tj text position using the active PDF font metrics", async () => {
  const fixture = await makeBackToBackTextPdf();
  const loaded = await PDFDocument.load(fixture.bytes.slice());
  const located = collectPageTextOperators(loaded, 0);

  assert.equal(located.length, 2);
  assert.equal(located[0].operator.positionReliability, "proven");
  assert.equal(located[1].operator.positionReliability, "proven");
  assert.ok(located[0].operator.textAdvancePt !== null);
  assert.ok(
    Math.abs(
      located[1].operator.textRenderingMatrix[4] - fixture.expectedSecondX,
    ) < 0.05,
    `expected second Tj at x≈${fixture.expectedSecondX}, got ${located[1].operator.textRenderingMatrix[4]}`,
  );
});

test("native walker includes TJ numeric adjustments in the following implicit text position", async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const fontSize = 14;
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.setFont(font);
  const internals = page as unknown as PageInternals;
  const fontKey = internals.getFont()[1];

  const array = PDFArray.withContext(doc.context);
  array.push(font.encodeText("AB"));
  array.push(PDFNumber.of(-100));
  array.push(font.encodeText("CD"));

  internals.getContentStream().push(
    PDFOperator.of(PDFOperatorNames.BeginText),
    PDFOperator.of(PDFOperatorNames.SetFontAndSize, [
      fontKey as never,
      PDFNumber.of(fontSize),
    ]),
    PDFOperator.of(PDFOperatorNames.MoveText, [
      PDFNumber.of(50),
      PDFNumber.of(700),
    ]),
    PDFOperator.of(PDFOperatorNames.ShowTextAdjusted, [array]),
    PDFOperator.of(PDFOperatorNames.ShowText, [font.encodeText("E")]),
    PDFOperator.of(PDFOperatorNames.EndText),
  );

  const bytes = await doc.save();
  const loaded = await PDFDocument.load(bytes.slice());
  const located = collectPageTextOperators(loaded, 0);
  assert.equal(located.length, 2);
  assert.deepEqual(located[0].operator.tjAdjustments, [-100]);

  const expected =
    50 +
    font.widthOfTextAtSize("ABCD", fontSize) +
    (100 / 1000) * fontSize;
  assert.ok(
    Math.abs(located[1].operator.textRenderingMatrix[4] - expected) < 0.05,
    `expected post-TJ x≈${expected}, got ${located[1].operator.textRenderingMatrix[4]}`,
  );
});

test("native detection remains independent when PDF.js merges adjacent Tj operators", async () => {
  const fixture = await makeBackToBackTextPdf();
  const pdfJs = await pdfJsRuns(fixture.bytes);
  assert.equal(pdfJs.runs.length, 1);
  assert.equal(pdfJs.runs[0].str, "Hello World");

  const loaded = await PDFDocument.load(fixture.bytes.slice());
  const registry = new PdfFontRegistry(loaded);
  const located = collectPageTextOperators(loaded, 0, { fontRegistry: registry });
  const native = detectNativeTextSpans({
    locatedOperators: located,
    fontRegistry: registry,
    viewportTransform: pdfJs.viewport.transform,
    pageWidthPt: pdfJs.viewport.width,
    pageHeightPt: pdfJs.viewport.height,
  });

  assert.equal(native.length, 2);
  assert.equal(native[0].decode.text, "Hello ");
  assert.equal(native[1].decode.text, "World");
  assert.ok(native.every((span) => span.run !== null));

  const reconciled = reconcileTextDetections({
    pdfJsRuns: pdfJs.runs,
    nativeSpans: native,
    pageWidthPt: pdfJs.viewport.width,
    pageHeightPt: pdfJs.viewport.height,
  });

  // PDF.js's single visual item is retained, but it is now backed by
  // independent native evidence. The second native fragment is not duplicated
  // as a separate overlay inside the same PDF.js-covered visual region.
  assert.equal(reconciled.length, 1);
  assert.equal(reconciled[0].run.str, "Hello World");
  assert.equal(reconciled[0].evidence.source, "reconciled");
  assert.ok(
    reconciled[0].evidence.confidence === "high" ||
      reconciled[0].evidence.confidence === "medium",
  );
  assert.equal(reconciled[0].evidence.unicodeAgreement, "fragment-prefix");
});

test("native-only detection survives when PDF.js provides no text item for the same proven native operators", async () => {
  const fixture = await makeBackToBackTextPdf();
  const pdfJs = await pdfJsRuns(fixture.bytes);
  const loaded = await PDFDocument.load(fixture.bytes.slice());
  const registry = new PdfFontRegistry(loaded);
  const located = collectPageTextOperators(loaded, 0, { fontRegistry: registry });
  const native = detectNativeTextSpans({
    locatedOperators: located,
    fontRegistry: registry,
    viewportTransform: pdfJs.viewport.transform,
    pageWidthPt: pdfJs.viewport.width,
    pageHeightPt: pdfJs.viewport.height,
  });

  const reconciled = reconcileTextDetections({
    pdfJsRuns: [],
    nativeSpans: native,
    pageWidthPt: pdfJs.viewport.width,
    pageHeightPt: pdfJs.viewport.height,
  });

  assert.deepEqual(
    reconciled.map((item) => item.run.str),
    ["Hello ", "World"],
  );
  assert.ok(reconciled.every((item) => item.evidence.source === "native-only"));
});

test("conflicting PDF.js Unicode is not promoted to a native editable reconciliation", async () => {
  const fixture = await makeBackToBackTextPdf();
  const pdfJs = await pdfJsRuns(fixture.bytes);
  const loaded = await PDFDocument.load(fixture.bytes.slice());
  const registry = new PdfFontRegistry(loaded);
  const located = collectPageTextOperators(loaded, 0, { fontRegistry: registry });
  const native = detectNativeTextSpans({
    locatedOperators: located,
    fontRegistry: registry,
    viewportTransform: pdfJs.viewport.transform,
    pageWidthPt: pdfJs.viewport.width,
    pageHeightPt: pdfJs.viewport.height,
  });

  const conflicting = [{ ...pdfJs.runs[0], str: "Different text" }];
  const reconciled = reconcileTextDetections({
    pdfJsRuns: conflicting,
    nativeSpans: native,
    pageWidthPt: pdfJs.viewport.width,
    pageHeightPt: pdfJs.viewport.height,
  });

  assert.equal(reconciled.length, 1);
  assert.equal(reconciled[0].evidence.source, "pdfjs-only");
  assert.equal(reconciled[0].locatedOperator, null);
});

test("page classifier identifies image-only evidence as scanned text candidate without pretending OCR already exists", () => {
  const classifier = new DocumentTextCapabilityClassifier();
  const evidence: PageContentEvidence = {
    textOperatorCount: 0,
    imageXObjectInvocations: 1,
    formXObjectInvocations: 0,
    vectorPaintOperatorCount: 0,
  };

  const classification = classifier.classifyPage({
    reconciled: [],
    nativeSpans: [],
    contentEvidence: evidence,
  });

  assert.equal(classification.primary, "SCANNED_IMAGE");
  assert.ok(classification.signals.includes("SCANNED_IMAGE"));
  assert.match(classification.reasons.join(" "), /image XObject/i);
});
