import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { buildPdfPageTextModel } from "../lib/pdf/edit/documentModel.ts";
import { buildEditPdfPageDiagnosticReport } from "../lib/pdf/edit/diagnostics.ts";
import { buildEditPdfFidelityCorpusReport } from "../lib/pdf/edit/fidelityMetrics.ts";
import { collectPageTextOperators } from "../lib/pdf/edit/formXObjects.ts";
import { PdfFontRegistry } from "../lib/pdf/edit/fontRegistry.ts";
import type { DetectedTextRun } from "../lib/pdf/edit/textRuns.ts";

test("diagnostics retain raw source bytes, native decoding, font identity and explicit blind spots", async () => {
  const source = await PDFDocument.create();
  const page = source.addPage([612, 792]);
  const font = await source.embedFont(StandardFonts.Helvetica);
  page.drawText("Invoice", { x: 72, y: 700, size: 12, font });
  const bytes = await source.save();

  const doc = await PDFDocument.load(bytes);
  const [located] = collectPageTextOperators(doc, 0);
  assert.ok(located);
  assert.ok(located.operator.fontResourceName);

  const registry = new PdfFontRegistry(doc);
  const profile = registry.resolve(located.resources, located.operator.fontResourceName);
  assert.ok(profile);

  const run: DetectedTextRun = {
    str: "Invoice",
    fontName: located.operator.fontResourceName,
    xPct: 10,
    yPct: 10,
    widthPct: 12,
    heightPct: 2,
    fontSizePt: 12,
    rotated: false,
  };
  const match = { locatedOperator: located, operator: located.operator };
  const model = buildPdfPageTextModel({
    pageIndex: 0,
    widthPt: 612,
    heightPt: 792,
    runs: [run],
    matches: [match],
    fontProfiles: [profile],
  });

  const report = buildEditPdfPageDiagnosticReport({
    pageModel: model,
    runs: [run],
    matches: [match],
    fontProfiles: [profile],
  });

  assert.equal(report.schemaVersion, 1);
  assert.equal(report.pageNumber, 1);
  assert.equal(report.spans.length, 1);
  const span = report.spans[0];
  assert.equal(span.source.operator.kind, "Tj");
  assert.equal(span.source.operator.decodedUnicode, "Invoice");
  assert.equal(span.source.operator.decodedUnicodeComplete, true);
  assert.ok(span.source.operator.rawEncodedHex[0]?.length > 0);
  assert.equal(span.font.baseFont, "Helvetica");
  assert.equal(span.font.nativeRewriteCapability, "proven");
  assert.equal(span.geometry.fontSizePt, 12);
  assert.equal(span.geometry.fontSizeDeltaPt, 0);
  assert.equal(span.geometry.baselineDeltaPt, null);
  assert.ok(span.unresolvedEvidence.includes("native-pdfjs-baseline-not-reconciled"));
  assert.ok(span.unresolvedEvidence.includes("font-object-ref-not-exposed"));
  assert.ok(!span.unresolvedEvidence.includes("font-profile-unresolved"));
});

test("corpus report distinguishes unmeasured outcomes from real failures", () => {
  const report = buildEditPdfFidelityCorpusReport([
    {
      id: "measured",
      category: "native",
      expectedTextCharacters: 10,
      detectedTextCharacters: 9,
      matchedSpans: 1,
      unmatchedSpans: 1,
      correctFontResolutions: 1,
      unresolvedFonts: 1,
      baselineErrorsPt: [0.25, -0.5],
      unsupportedRuns: 1,
      nativeEditSuccess: true,
      exportSuccess: null,
      reopenSuccess: null,
      visualDiffPass: null,
    },
    {
      id: "unmeasured",
      category: "future",
      expectedTextCharacters: 0,
      detectedTextCharacters: 0,
      matchedSpans: 0,
      unmatchedSpans: 0,
      correctFontResolutions: 0,
      unresolvedFonts: 0,
      baselineErrorsPt: [],
      unsupportedRuns: 0,
      nativeEditSuccess: null,
      exportSuccess: null,
      reopenSuccess: null,
      visualDiffPass: null,
    },
  ]);

  assert.equal(report.fixtureCount, 2);
  assert.equal(report.aggregate.textRecall, 0.9);
  assert.equal(report.aggregate.matchedSpanRatio, 0.5);
  assert.equal(report.fixtures[0].maxBaselineErrorPt, 0.5);
  assert.equal(report.totals.nativeEditMeasured, 1);
  assert.equal(report.totals.nativeEditSuccesses, 1);
  assert.equal(report.totals.exportMeasured, 0);
  assert.equal(report.totals.reopenMeasured, 0);
  assert.equal(report.totals.visualDiffMeasured, 0);
});
