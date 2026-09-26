import assert from "node:assert/strict";
import test from "node:test";
import type { PdfTextStyle } from "../lib/pdf/edit/documentModel.ts";
import { summarizeNativeTextSelectionStyles } from "../lib/pdf/edit/mixedStyleSelection.ts";

function style(overrides: Partial<PdfTextStyle> = {}): PdfTextStyle {
  return {
    fontResourceName: "F1",
    fontFamily: "Demo Sans",
    fontSubtype: "TrueType",
    baseFont: "ABCDEF+DemoSans",
    embedded: true,
    subset: true,
    fontSizePt: 12,
    weight: 400,
    italic: false,
    charSpacingPt: 0,
    wordSpacingPt: 0,
    horizontalScalingPct: 100,
    textRisePt: 0,
    renderingMode: 0,
    fillColor: {
      colorSpace: "DeviceRGB",
      components: [0.2, 0.4, 0.6],
      cssHex: "#336699",
    },
    strokeColor: null,
    fillOpacity: 1,
    strokeOpacity: 1,
    ...overrides,
  };
}

test("mixed-style summary preserves unanimous values", () => {
  const summary = summarizeNativeTextSelectionStyles([
    { style: style() },
    { style: style() },
  ]);

  assert.equal(summary.spanCount, 2);
  assert.deepEqual(summary.fontFamily, { state: "single", value: "Demo Sans" });
  assert.deepEqual(summary.fontSizePt, { state: "single", value: 12 });
  assert.deepEqual(summary.fillColor, {
    state: "single",
    value: {
      colorSpace: "DeviceRGB",
      components: [0.2, 0.4, 0.6],
      cssHex: "#336699",
    },
  });
  assert.equal(summary.hasMixedValues, false);
});

test("mixed-style summary marks every differing field explicitly", () => {
  const summary = summarizeNativeTextSelectionStyles([
    { style: style() },
    {
      style: style({
        fontFamily: "Other Serif",
        fontSizePt: 14,
        weight: 700,
        italic: true,
        charSpacingPt: 0.25,
        wordSpacingPt: 1.5,
        horizontalScalingPct: 92,
        renderingMode: 2,
        fillColor: {
          colorSpace: "DeviceGray",
          components: [0.5],
          cssHex: "#808080",
        },
      }),
    },
  ]);

  assert.equal(summary.fontFamily.state, "mixed");
  assert.equal(summary.weight.state, "mixed");
  assert.equal(summary.italic.state, "mixed");
  assert.equal(summary.fontSizePt.state, "mixed");
  assert.equal(summary.charSpacingPt.state, "mixed");
  assert.equal(summary.wordSpacingPt.state, "mixed");
  assert.equal(summary.horizontalScalingPct.state, "mixed");
  assert.equal(summary.fillColor.state, "mixed");
  assert.equal(summary.renderingMode.state, "mixed");
  assert.equal(summary.hasMixedValues, true);
});

test("mixed-style summary uses tolerant numeric and exact native paint comparison", () => {
  const summary = summarizeNativeTextSelectionStyles([
    { style: style({ fontSizePt: 12 }) },
    {
      style: style({
        fontSizePt: 12 + 5e-7,
        fillColor: {
          colorSpace: "DeviceRGB",
          components: [0.2 + 5e-7, 0.4, 0.6],
          cssHex: "#336699",
        },
      }),
    },
  ]);

  assert.equal(summary.fontSizePt.state, "single");
  assert.equal(summary.fillColor.state, "single");
  assert.equal(summary.hasMixedValues, false);
});

test("mixed-style summary does not treat identical CSS hex across different PDF color spaces as the same paint state", () => {
  const summary = summarizeNativeTextSelectionStyles([
    { style: style() },
    {
      style: style({
        fillColor: {
          colorSpace: "DeviceGray",
          components: [0.2],
          cssHex: "#336699",
        },
      }),
    },
  ]);

  assert.equal(summary.fillColor.state, "mixed");
  assert.equal(summary.hasMixedValues, true);
});

test("mixed-style summary refuses an empty selection", () => {
  assert.throws(
    () => summarizeNativeTextSelectionStyles([]),
    /At least one PDF text span is required/,
  );
});
