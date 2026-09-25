export type EditPdfFidelityFixtureMeasurement = {
  id: string;
  category: string;
  expectedTextCharacters: number;
  detectedTextCharacters: number;
  expectedSpans?: number;
  matchedSpans: number;
  unmatchedSpans: number;
  correctFontResolutions: number;
  unresolvedFonts: number;
  baselineErrorsPt: readonly number[];
  unsupportedRuns: number;
  nativeEditSuccess: boolean | null;
  exportSuccess: boolean | null;
  reopenSuccess: boolean | null;
  visualDiffPass: boolean | null;
};

export type EditPdfFidelityFixtureResult = EditPdfFidelityFixtureMeasurement & {
  textRecall: number | null;
  matchedSpanRatio: number | null;
  maxBaselineErrorPt: number | null;
  meanBaselineErrorPt: number | null;
};

export type EditPdfFidelityCorpusReport = {
  schemaVersion: 1;
  fixtureCount: number;
  fixtures: readonly EditPdfFidelityFixtureResult[];
  totals: {
    expectedTextCharacters: number;
    detectedTextCharacters: number;
    matchedSpans: number;
    unmatchedSpans: number;
    correctFontResolutions: number;
    unresolvedFonts: number;
    unsupportedRuns: number;
    nativeEditSuccesses: number;
    nativeEditMeasured: number;
    exportSuccesses: number;
    exportMeasured: number;
    reopenSuccesses: number;
    reopenMeasured: number;
    visualDiffPasses: number;
    visualDiffMeasured: number;
  };
  aggregate: {
    textRecall: number | null;
    matchedSpanRatio: number | null;
  };
};

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function evaluateEditPdfFidelityFixture(
  measurement: EditPdfFidelityFixtureMeasurement,
): EditPdfFidelityFixtureResult {
  const maxBaselineErrorPt =
    measurement.baselineErrorsPt.length > 0
      ? Math.max(...measurement.baselineErrorsPt.map((value) => Math.abs(value)))
      : null;
  return {
    ...measurement,
    textRecall: ratio(measurement.detectedTextCharacters, measurement.expectedTextCharacters),
    matchedSpanRatio: ratio(
      measurement.matchedSpans,
      measurement.matchedSpans + measurement.unmatchedSpans,
    ),
    maxBaselineErrorPt,
    meanBaselineErrorPt:
      measurement.baselineErrorsPt.length > 0
        ? mean(measurement.baselineErrorsPt.map((value) => Math.abs(value)))
        : null,
  };
}

export function buildEditPdfFidelityCorpusReport(
  measurements: readonly EditPdfFidelityFixtureMeasurement[],
): EditPdfFidelityCorpusReport {
  const fixtures = measurements.map(evaluateEditPdfFidelityFixture);
  const totals = fixtures.reduce(
    (acc, fixture) => {
      acc.expectedTextCharacters += fixture.expectedTextCharacters;
      acc.detectedTextCharacters += fixture.detectedTextCharacters;
      acc.matchedSpans += fixture.matchedSpans;
      acc.unmatchedSpans += fixture.unmatchedSpans;
      acc.correctFontResolutions += fixture.correctFontResolutions;
      acc.unresolvedFonts += fixture.unresolvedFonts;
      acc.unsupportedRuns += fixture.unsupportedRuns;
      if (fixture.nativeEditSuccess !== null) {
        acc.nativeEditMeasured += 1;
        acc.nativeEditSuccesses += Number(fixture.nativeEditSuccess);
      }
      if (fixture.exportSuccess !== null) {
        acc.exportMeasured += 1;
        acc.exportSuccesses += Number(fixture.exportSuccess);
      }
      if (fixture.reopenSuccess !== null) {
        acc.reopenMeasured += 1;
        acc.reopenSuccesses += Number(fixture.reopenSuccess);
      }
      if (fixture.visualDiffPass !== null) {
        acc.visualDiffMeasured += 1;
        acc.visualDiffPasses += Number(fixture.visualDiffPass);
      }
      return acc;
    },
    {
      expectedTextCharacters: 0,
      detectedTextCharacters: 0,
      matchedSpans: 0,
      unmatchedSpans: 0,
      correctFontResolutions: 0,
      unresolvedFonts: 0,
      unsupportedRuns: 0,
      nativeEditSuccesses: 0,
      nativeEditMeasured: 0,
      exportSuccesses: 0,
      exportMeasured: 0,
      reopenSuccesses: 0,
      reopenMeasured: 0,
      visualDiffPasses: 0,
      visualDiffMeasured: 0,
    },
  );

  return {
    schemaVersion: 1,
    fixtureCount: fixtures.length,
    fixtures,
    totals,
    aggregate: {
      textRecall: ratio(totals.detectedTextCharacters, totals.expectedTextCharacters),
      matchedSpanRatio: ratio(totals.matchedSpans, totals.matchedSpans + totals.unmatchedSpans),
    },
  };
}
