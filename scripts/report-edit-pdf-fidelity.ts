import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { PDFDocument, StandardFonts, degrees } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { collectPageTextOperators } from "../lib/pdf/edit/formXObjects.ts";
import { PdfFontRegistry } from "../lib/pdf/edit/fontRegistry.ts";
import { detectNativeTextSpans } from "../lib/pdf/edit/nativeTextDetection.ts";
import { reconcileTextDetections } from "../lib/pdf/edit/textReconciliation.ts";
import { classifySpanTextCapability } from "../lib/pdf/edit/documentTextCapability.ts";
import { textRunsFromContent } from "../lib/pdf/edit/textRuns.ts";
import { buildEditPdfFidelityCorpusReport, type EditPdfFidelityFixtureMeasurement } from "../lib/pdf/edit/fidelityMetrics.ts";

type Fixture = {
  id: string;
  category: string;
  expectedText: string;
  bytes: Uint8Array;
};

async function makeFixture(
  id: string,
  category: string,
  text: string,
  options: { font?: typeof StandardFonts[keyof typeof StandardFonts]; rotation?: 0 | 90 | 180 | 270; size?: number } = {},
): Promise<Fixture> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  if (options.rotation) page.setRotation(degrees(options.rotation));
  const font = await doc.embedFont(options.font ?? StandardFonts.Helvetica);
  page.drawText(text, { x: 72, y: 680, size: options.size ?? 12, font });
  return { id, category, expectedText: text, bytes: await doc.save() };
}

async function measure(fixture: Fixture): Promise<EditPdfFidelityFixtureMeasurement> {
  const pdfJsDoc = await pdfjsLib.getDocument({ data: fixture.bytes.slice() }).promise;
  const pdfJsPage = await pdfJsDoc.getPage(1);
  const viewport = pdfJsPage.getViewport({ scale: 1 });
  const content = await pdfJsPage.getTextContent();
  const runs = textRunsFromContent(content.items as never, viewport.transform, viewport.width, viewport.height);

  const pdfLibDoc = await PDFDocument.load(fixture.bytes.slice());
  const registry = new PdfFontRegistry(pdfLibDoc);
  const located = collectPageTextOperators(pdfLibDoc, 0, { fontRegistry: registry });
  const nativeSpans = detectNativeTextSpans({
    locatedOperators: located,
    fontRegistry: registry,
    viewportTransform: viewport.transform,
    pageWidthPt: viewport.width,
    pageHeightPt: viewport.height,
  });
  const reconciled = reconcileTextDetections({
    pdfJsRuns: runs,
    nativeSpans,
    pageWidthPt: viewport.width,
    pageHeightPt: viewport.height,
  });

  const matchedSpans = reconciled.filter((item) => item.locatedOperator !== null).length;
  const correctFontResolutions = reconciled.filter(
    (item) =>
      item.nativeSpan?.fontProfile &&
      item.nativeSpan.fontProfile.encodingSource !== "Unknown",
  ).length;
  const unresolvedFonts = reconciled.filter(
    (item) => item.locatedOperator !== null && !item.nativeSpan?.fontProfile,
  ).length;
  const unsupportedRuns = reconciled.filter(
    (item) => !classifySpanTextCapability(item).safelyRewritable,
  ).length;

  const detectedText = reconciled.map((item) => item.run.str).join("");
  // pdfjs-dist's Node legacy proxy shape differs slightly across builds;
  // this short-lived CI process does not need an unconditional destroy().
  const destroy = (pdfJsDoc as { destroy?: () => Promise<void> | void }).destroy;
  if (typeof destroy === "function") await destroy.call(pdfJsDoc);

  return {
    id: fixture.id,
    category: fixture.category,
    expectedTextCharacters: fixture.expectedText.length,
    detectedTextCharacters: detectedText.length,
    expectedSpans: 1,
    matchedSpans,
    unmatchedSpans: Math.max(0, reconciled.length - matchedSpans),
    correctFontResolutions,
    unresolvedFonts,
    baselineErrorsPt: [],
    unsupportedRuns,
    nativeEditSuccess: null,
    exportSuccess: null,
    reopenSuccess: null,
    visualDiffPass: null,
  };
}

async function main() {
  const fixtures = await Promise.all([
    makeFixture("seed-standard-helvetica", "embedded-or-standard-font", "Invoice Total 1350.00"),
    makeFixture("seed-bold-italic", "mixed-style-signal", "Premium Edit", {
      font: StandardFonts.HelveticaBoldOblique,
      size: 14,
    }),
    makeFixture("seed-rotated-page", "rotated-text", "Rotated native text", {
      rotation: 90,
      size: 13,
    }),
  ]);
  const measurements: EditPdfFidelityFixtureMeasurement[] = [];
  for (const fixture of fixtures) measurements.push(await measure(fixture));

  const report = buildEditPdfFidelityCorpusReport(measurements);
  const output = resolve(process.argv[2] ?? "artifacts/edit-pdf-fidelity-report.json");
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + "\n", "utf8");

  process.stdout.write(
    [
      `Edit PDF fidelity seed report: ${report.fixtureCount} fixtures`,
      `text recall: ${report.aggregate.textRecall === null ? "n/a" : (report.aggregate.textRecall * 100).toFixed(2) + "%"}`,
      `matched spans: ${report.totals.matchedSpans}/${report.totals.matchedSpans + report.totals.unmatchedSpans}`,
      `output: ${output}`,
    ].join("\n") + "\n",
  );
}

await main();
