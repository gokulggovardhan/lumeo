import assert from "node:assert/strict";
import test from "node:test";
import type { PdfPaintColor } from "../lib/pdf/edit/contentStream.ts";
import {
  buildNativePaintPlan,
  paintColorFromCssHex,
  paintOperator,
  paintChannelsForRenderingMode,
  validateNativePaintColor,
} from "../lib/pdf/edit/nativePaint.ts";

const black: PdfPaintColor = {
  colorSpace: "DeviceGray",
  components: [0],
  cssHex: "#000000",
};
const blue: PdfPaintColor = {
  colorSpace: "DeviceRGB",
  components: [0, 0, 1],
  cssHex: "#0000ff",
};
const red: PdfPaintColor = {
  colorSpace: "DeviceRGB",
  components: [1, 0, 0],
  cssHex: "#ff0000",
};
const cmyk: PdfPaintColor = {
  colorSpace: "DeviceCMYK",
  components: [0.1, 0.2, 0.3, 0.4],
  cssHex: null,
};

function operator(overrides: Record<string, unknown> = {}) {
  return {
    renderMode: 0,
    fillColor: black,
    strokeColor: black,
    fillOpacity: 1,
    strokeOpacity: 1,
    ...overrides,
  };
}

test("paintColorFromCssHex creates deterministic DeviceRGB paint", () => {
  assert.deepEqual(paintColorFromCssHex("#3366CC"), {
    colorSpace: "DeviceRGB",
    components: [0x33 / 255, 0x66 / 255, 0xcc / 255],
    cssHex: "#3366cc",
  });
  assert.equal(paintColorFromCssHex("red"), null);
  assert.equal(paintColorFromCssHex("#fff"), null);
});

test("paintOperator preserves native Gray, RGB and CMYK PDF colour spaces", () => {
  assert.equal(paintOperator(black, "fill"), "0 g");
  assert.equal(paintOperator(blue, "stroke"), "0 0 1 RG");
  assert.equal(paintOperator(cmyk, "fill"), "0.1 0.2 0.3 0.4 k");
});

test("paint components are fail-closed outside the PDF device-colour range", () => {
  assert.match(
    validateNativePaintColor({ colorSpace: "DeviceRGB", components: [1, 2, 0], cssHex: null }) ?? "",
    /between 0 and 1/i,
  );
  assert.match(
    validateNativePaintColor({ colorSpace: "DeviceCMYK", components: [0, 0, 0], cssHex: null }) ?? "",
    /exactly 4/i,
  );
});

test("rendering modes expose only the paint channels that actually draw glyphs", () => {
  assert.deepEqual(paintChannelsForRenderingMode(0), { fill: true, stroke: false });
  assert.deepEqual(paintChannelsForRenderingMode(1), { fill: false, stroke: true });
  assert.deepEqual(paintChannelsForRenderingMode(2), { fill: true, stroke: true });
  assert.deepEqual(paintChannelsForRenderingMode(3), { fill: false, stroke: false });
  assert.deepEqual(paintChannelsForRenderingMode(6), { fill: false, stroke: false });
});

test("fill-only native colour edit is locally restored to the original proven colour", () => {
  const plan = buildNativePaintPlan(operator({ fillColor: blue }), { fillColor: red });
  assert.equal(plan.editable, true);
  if (!plan.editable) return;
  assert.deepEqual(plan.override.fillColor, red);
  assert.equal(plan.wrapper.prefix, "1 0 0 rg");
  assert.equal(plan.wrapper.suffix, "0 0 1 rg");
});

test("stroke-only text uses RG and restores the prior stroke colour", () => {
  const plan = buildNativePaintPlan(
    operator({ renderMode: 1, strokeColor: cmyk }),
    { strokeColor: red },
  );
  assert.equal(plan.editable, true);
  if (!plan.editable) return;
  assert.equal(plan.wrapper.prefix, "1 0 0 RG");
  assert.equal(plan.wrapper.suffix, "0.1 0.2 0.3 0.4 K");
});

test("fill+stroke edit restores both channels in reverse wrapper order", () => {
  const plan = buildNativePaintPlan(
    operator({ renderMode: 2, fillColor: blue, strokeColor: cmyk }),
    { fillColor: red, strokeColor: black },
  );
  assert.equal(plan.editable, true);
  if (!plan.editable) return;
  assert.equal(plan.wrapper.prefix, "1 0 0 rg 0 G");
  assert.equal(plan.wrapper.suffix, "0.1 0.2 0.3 0.4 K 0 0 1 rg");
});

test("unknown original paint is never guessed because exact restore would be impossible", () => {
  const plan = buildNativePaintPlan(operator({ fillColor: null }), { fillColor: red });
  assert.equal(plan.editable, false);
  if (plan.editable) return;
  assert.match(plan.reason, /original fill colour is unknown/i);
});

test("paint changes are rejected for invisible and clipping text", () => {
  for (const renderMode of [3, 4, 5, 6, 7]) {
    const plan = buildNativePaintPlan(operator({ renderMode }), { fillColor: red });
    assert.equal(plan.editable, false, `render mode ${renderMode} must not be paint editable`);
  }
});

test("wrong-channel and no-op requests are rejected instead of pretending to edit", () => {
  const wrong = buildNativePaintPlan(operator({ renderMode: 0 }), { strokeColor: red });
  assert.equal(wrong.editable, false);
  if (!wrong.editable) assert.match(wrong.reason, /does not paint glyph strokes/i);

  const same = buildNativePaintPlan(operator({ fillColor: blue }), { fillColor: blue });
  assert.equal(same.editable, false);
  if (!same.editable) assert.match(same.reason, /already matches/i);
});

test("alpha remains untouched by colour-only planning", () => {
  const plan = buildNativePaintPlan(
    operator({ fillColor: blue, fillOpacity: 0.42 }),
    { fillColor: red },
  );
  assert.equal(plan.editable, true);
  if (!plan.editable) return;
  assert.equal(plan.wrapper.prefix, "1 0 0 rg");
  assert.equal(plan.wrapper.suffix, "0 0 1 rg");
  assert.equal("fillOpacity" in plan.override, false);
});
