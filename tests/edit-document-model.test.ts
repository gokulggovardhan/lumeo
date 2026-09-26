import assert from "node:assert/strict";
import test from "node:test";
import type { PDFDict } from "pdf-lib";
import type { TextShowOperator } from "../lib/pdf/edit/contentStream.ts";
import {
  buildPdfPageTextModel,
  type PdfTextSourceMatch,
} from "../lib/pdf/edit/documentModel.ts";
import type { DetectedTextRun } from "../lib/pdf/edit/textRuns.ts";

function run(
  str: string,
  xPct: number,
  yPct: number,
  widthPct = 20,
  heightPct = 2,
): DetectedTextRun {
  return {
    str,
    fontName: "F1",
    xPct,
    yPct,
    widthPct,
    heightPct,
    fontSizePt: 12,
    rotated: false,
  };
}

function match(
  operatorIndex: number,
  overrides: Partial<TextShowOperator> = {},
): PdfTextSourceMatch {
  const operator: TextShowOperator = {
    kind: "Tj",
    start: 0,
    end: 10,
    strings: [new Uint8Array([65])],
    fontResourceName: "F1",
    fontSizePt: 12,
    textRenderingMatrix: [12, 0, 0, 12, 72, 700],
    charSpacing: 0,
    wordSpacing: 0,
    horizontalScalingPct: 100,
    leading: 14,
    textRise: 0,
    renderMode: 0,
    ...overrides,
  };
  return {
    operator,
    locatedOperator: {
      locator: { kind: "page", contentStreamIndex: 0 },
      operatorIndex,
      operator,
      streamBytes: new Uint8Array(),
      resources: {} as PDFDict,
    },
  };
}

test("document model stores the detector baseline directly instead of rebuilding it from box height", () => {
  const detected = run("Baseline", 10, 20, 18, 6);
  detected.baselineXPct = 11;
  detected.baselineYPct = 27.5;
  detected.ascentRatio = 0.61;

  const model = buildPdfPageTextModel({
    pageIndex: 0,
    widthPt: 600,
    heightPt: 800,
    runs: [detected],
    matches: [match(0)],
  });

  assert.equal(model.spans.length, 1);
  assert.ok(Math.abs(model.spans[0].baselinePt - 220) < 1e-9);
  // A legacy 0.85 * box-height reconstruction would have produced 200.8pt,
  // proving this expectation is tied to the explicit baseline, not the box.
  assert.notEqual(model.spans[0].baselinePt, 200.8);
});

test("document model keeps distant same-baseline columns as separate lines and blocks", () => {
  const runs = [
    run("Left heading", 10, 20),
    run("Right heading", 65, 20),
    run("Left detail", 10, 25),
    run("Right detail", 65, 25),
  ];
  const model = buildPdfPageTextModel({
    pageIndex: 0,
    widthPt: 600,
    heightPt: 800,
    runs,
    matches: runs.map((_, index) => match(index)),
  });

  assert.equal(model.spans.length, 4);
  assert.equal(model.lines.length, 4);
  assert.equal(model.blocks.length, 2);
  assert.deepEqual(
    model.blocks.map((block) => block.text),
    ["Left heading\nLeft detail", "Right heading\nRight detail"],
  );
  assert.equal(model.capability, "native-editable");
  assert.equal(model.editableSpanCount, 4);
});

test("document model merges nearby fragmented spans into a meaningful line", () => {
  const runs = [
    run("Total", 10, 40, 8),
    run("Amount", 19, 40, 10),
    run("1350.00", 31, 40, 12),
  ];
  const model = buildPdfPageTextModel({
    pageIndex: 0,
    widthPt: 600,
    heightPt: 800,
    runs,
    matches: runs.map((_, index) => match(index)),
    fragmentedRunIndices: new Set([1]),
  });

  assert.equal(model.lines.length, 1);
  assert.equal(model.lines[0].text, "Total Amount 1350.00");
  assert.equal(model.spans[1].capability, "fragmented-editable");
});

test("document model exposes view-only and clipping limitations instead of faking editability", () => {
  const runs = [run("Unmatched", 10, 10), run("Clip text", 10, 95)];
  const model = buildPdfPageTextModel({
    pageIndex: 2,
    widthPt: 612,
    heightPt: 792,
    runs,
    matches: [null, match(1, { renderMode: 7 })],
  });

  assert.equal(model.capability, "view-only");
  assert.equal(model.spans[0].capability, "view-only");
  assert.match(model.spans[0].capabilityReason ?? "", /could not be matched/i);
  assert.equal(model.spans[1].capability, "unsupported");
  assert.match(model.spans[1].capabilityReason ?? "", /clipping/i);
  assert.equal(model.lines[0].region, "body");
  assert.equal(model.lines[1].region, "footer");
});

test("document model preserves source matrix and operator text state", () => {
  const model = buildPdfPageTextModel({
    pageIndex: 0,
    widthPt: 600,
    heightPt: 800,
    runs: [run("Rotated", 20, 20)],
    matches: [
      match(0, {
        textRenderingMatrix: [0, 11, -11, 0, 100, 200],
        fontSizePt: 11,
        charSpacing: 0.4,
        wordSpacing: 1.2,
        horizontalScalingPct: 93,
        textRise: 2,
        renderMode: 2,
      }),
    ],
  });
  const span = model.spans[0];
  assert.deepEqual(span.sourceMatrix, [0, 11, -11, 0, 100, 200]);
  assert.ok(Math.abs(span.rotationDeg - 90) < 1e-9);
  assert.equal(span.style.charSpacingPt, 0.4);
  assert.equal(span.style.wordSpacingPt, 1.2);
  assert.equal(span.style.horizontalScalingPct, 93);
  assert.equal(span.style.textRisePt, 2);
  assert.equal(span.style.renderingMode, 2);
});


test("document model preserves proven fill/stroke paint and alpha from the matched operator", () => {
  const model = buildPdfPageTextModel({
    pageIndex: 0,
    widthPt: 600,
    heightPt: 800,
    runs: [run("Painted", 20, 20)],
    matches: [
      match(0, {
        fillColor: {
          colorSpace: "DeviceRGB",
          components: [0.2, 0.4, 0.6],
          cssHex: "#336699",
        },
        strokeColor: {
          colorSpace: "DeviceGray",
          components: [0.25],
          cssHex: "#404040",
        },
        fillOpacity: 0.5,
        strokeOpacity: 0.75,
      }),
    ],
  });

  assert.deepEqual(model.spans[0].style.fillColor, {
    colorSpace: "DeviceRGB",
    components: [0.2, 0.4, 0.6],
    cssHex: "#336699",
  });
  assert.equal(model.spans[0].style.fillOpacity, 0.5);
  assert.equal(model.spans[0].style.strokeOpacity, 0.75);
});
