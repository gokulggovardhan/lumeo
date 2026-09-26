import assert from "node:assert/strict";
import test from "node:test";
import type { PdfPaintColor, TextShowOperator } from "../lib/pdf/edit/contentStream.ts";
import type { LocatedTextOperator } from "../lib/pdf/edit/formXObjects.ts";
import type { ResolvedFont } from "../lib/pdf/edit/fontEncoding.ts";
import type { FontMetrics } from "../lib/pdf/edit/fontMetrics.ts";
import {
  buildNativeTextStyleBatchPlan,
  type NativeTextStyleBatchInput,
} from "../lib/pdf/edit/multiStylePlan.ts";

const black: PdfPaintColor = {
  colorSpace: "DeviceGray",
  components: [0],
  cssHex: "#000000",
};
const blue: PdfPaintColor = {
  colorSpace: "DeviceRGB",
  components: [0.2, 0.4, 0.8],
  cssHex: "#3366cc",
};
const cmyk: PdfPaintColor = {
  colorSpace: "DeviceCMYK",
  components: [0.1, 0.2, 0.3, 0.4],
  cssHex: null,
};

function font(baseFont: string): ResolvedFont {
  return {
    kind: "Type1",
    baseFont,
    isEmbedded: false,
    isSubset: false,
    bytesPerCode: 1,
    encodingSource: "WinAnsi",
    glyphCodeToUnicode: new Map([
      [65, "A"],
      [66, "B"],
    ]),
    unicodeToGlyphCode: new Map([
      ["A", 65],
      ["B", 66],
    ]),
  };
}

function metrics(a = 600, b = 620): FontMetrics {
  return {
    bytesPerCode: 1,
    defaultWidth: 500,
    glyphWidths: new Map([
      [65, a],
      [66, b],
    ]),
    source: "Widths",
  };
}

function operator({
  fontResourceName,
  text = "A",
  start,
  fontSizePt = 12,
  contentFill = black,
  kind = "Tj",
}: {
  fontResourceName: string;
  text?: "A" | "B";
  start: number;
  fontSizePt?: number;
  contentFill?: PdfPaintColor;
  kind?: TextShowOperator["kind"];
}): TextShowOperator {
  return {
    kind,
    start,
    end: start + 12,
    strings: [Uint8Array.from([text.charCodeAt(0)])],
    fontResourceName,
    fontSizePt,
    textRenderingMatrix: [fontSizePt, 0, 0, fontSizePt, 50, 700],
    charSpacing: 0,
    wordSpacing: 0,
    horizontalScalingPct: 100,
    leading: 0,
    textRise: 0,
    renderMode: 0,
    fillColor: contentFill,
    strokeColor: black,
    fillOpacity: 1,
    strokeOpacity: 1,
  };
}

function input({
  spanId,
  fontResourceName,
  text,
  start,
  fontSizePt,
  fillColor,
  stream = 0,
  kind = "Tj",
  fragmented = false,
  formPath = null,
  baseFont = fontResourceName,
}: {
  spanId: string;
  fontResourceName: string;
  text: "A" | "B";
  start: number;
  fontSizePt: number;
  fillColor: PdfPaintColor;
  stream?: number;
  kind?: TextShowOperator["kind"];
  fragmented?: boolean;
  formPath?: string[] | null;
  baseFont?: string;
}): NativeTextStyleBatchInput {
  const op = operator({
    fontResourceName,
    text,
    start,
    fontSizePt,
    contentFill: fillColor,
    kind,
  });
  const locatedOperator: LocatedTextOperator = {
    locator: formPath
      ? { kind: "xobject", formPath }
      : { kind: "page", contentStreamIndex: stream },
    operatorIndex: start / 20,
    operator: op,
    streamBytes: new Uint8Array(),
    resources: null as unknown as LocatedTextOperator["resources"],
  };
  return {
    spanId,
    locatedOperator,
    resolvedFont: font(baseFont),
    fontMetrics: metrics(),
    fragmented,
  };
}

test("mixed-span style planner preserves each span's own PDF font authority", () => {
  const plan = buildNativeTextStyleBatchPlan({
    pageIndex: 0,
    inputs: [
      input({
        spanId: "a",
        fontResourceName: "FHelvetica",
        baseFont: "Helvetica",
        text: "A",
        start: 20,
        fontSizePt: 12,
        fillColor: black,
      }),
      input({
        spanId: "b",
        fontResourceName: "FTimes",
        baseFont: "Times-Roman",
        text: "B",
        start: 80,
        fontSizePt: 18,
        fillColor: blue,
      }),
    ],
    patch: {
      fontSizePt: 16,
      horizontalScalingPct: 90,
      fillColorHex: "#008800",
    },
  });

  assert.equal(plan.editable, true);
  if (!plan.editable) return;
  assert.equal(plan.entries.length, 2);
  assert.deepEqual(
    plan.entries.map((entry) => entry.plan.fontResourceName),
    ["FHelvetica", "FTimes"],
  );
  assert.deepEqual(
    plan.entries.map((entry) => entry.plan.replacementText),
    ["A", "B"],
  );
  assert.deepEqual(
    plan.entries.map((entry) => entry.plan.replacementTextState?.fontSizePt),
    [16, 16],
  );
  assert.deepEqual(
    plan.entries.map((entry) => entry.plan.replacementTextState?.horizontalScalingPct),
    [90, 90],
  );
  assert.ok(plan.entries.every((entry) => entry.nativePaintPlan?.editable));
});

test("mixed-span style planner skips spans that already match the requested text state", () => {
  const plan = buildNativeTextStyleBatchPlan({
    pageIndex: 0,
    inputs: [
      input({
        spanId: "already",
        fontResourceName: "F1",
        text: "A",
        start: 20,
        fontSizePt: 16,
        fillColor: black,
      }),
      input({
        spanId: "change",
        fontResourceName: "F2",
        text: "B",
        start: 80,
        fontSizePt: 12,
        fillColor: black,
      }),
    ],
    patch: { fontSizePt: 16 },
  });

  assert.equal(plan.editable, true);
  if (!plan.editable) return;
  assert.deepEqual(plan.entries.map((entry) => entry.spanId), ["change"]);
});

test("mixed-span style planner accepts exact Gray/RGB sources for one RGB fill request", () => {
  const plan = buildNativeTextStyleBatchPlan({
    pageIndex: 0,
    inputs: [
      input({
        spanId: "gray",
        fontResourceName: "F1",
        text: "A",
        start: 20,
        fontSizePt: 12,
        fillColor: black,
      }),
      input({
        spanId: "rgb",
        fontResourceName: "F2",
        text: "B",
        start: 80,
        fontSizePt: 12,
        fillColor: blue,
      }),
    ],
    patch: { fillColorHex: "#008800" },
  });

  assert.equal(plan.editable, true);
  if (!plan.editable) return;
  assert.equal(plan.entries.length, 2);
  assert.ok(plan.entries.every((entry) => entry.nativePaintPlan?.editable));
});

test("mixed-span style planner blocks CMYK-to-RGB guessing as one atomic transaction", () => {
  const plan = buildNativeTextStyleBatchPlan({
    pageIndex: 0,
    inputs: [
      input({
        spanId: "safe",
        fontResourceName: "F1",
        text: "A",
        start: 20,
        fontSizePt: 12,
        fillColor: black,
      }),
      input({
        spanId: "cmyk",
        fontResourceName: "F2",
        text: "B",
        start: 80,
        fontSizePt: 12,
        fillColor: cmyk,
      }),
    ],
    patch: { fillColorHex: "#008800" },
  });

  assert.equal(plan.editable, false);
  if (plan.editable) return;
  assert.match(plan.reason, /CMYK|guess-convert/i);
});

test("mixed-span style planner rejects unsafe structural classes instead of partially applying", () => {
  const safe = input({
    spanId: "safe",
    fontResourceName: "F1",
    text: "A",
    start: 20,
    fontSizePt: 12,
    fillColor: black,
  });

  const cases: Array<{ label: string; second: NativeTextStyleBatchInput; reason: RegExp }> = [
    {
      label: "TJ",
      second: input({
        spanId: "tj",
        fontResourceName: "F2",
        text: "B",
        start: 80,
        fontSizePt: 12,
        fillColor: black,
        kind: "TJ",
      }),
      reason: /simple Tj/i,
    },
    {
      label: "form",
      second: input({
        spanId: "form",
        fontResourceName: "F2",
        text: "B",
        start: 80,
        fontSizePt: 12,
        fillColor: black,
        formPath: ["Fm1"],
      }),
      reason: /Form XObjects/i,
    },
    {
      label: "other stream",
      second: input({
        spanId: "stream",
        fontResourceName: "F2",
        text: "B",
        start: 80,
        fontSizePt: 12,
        fillColor: black,
        stream: 1,
      }),
      reason: /multiple PDF content streams/i,
    },
    {
      label: "fragmented",
      second: input({
        spanId: "fragmented",
        fontResourceName: "F2",
        text: "B",
        start: 80,
        fontSizePt: 12,
        fillColor: black,
        fragmented: true,
      }),
      reason: /multiple PDF operators/i,
    },
  ];

  for (const item of cases) {
    const plan = buildNativeTextStyleBatchPlan({
      pageIndex: 0,
      inputs: [safe, item.second],
      patch: { fontSizePt: 16 },
    });
    assert.equal(plan.editable, false, item.label);
    if (!plan.editable) assert.match(plan.reason, item.reason, item.label);
  }
});

test("mixed-span style planner reports a no-op instead of rewriting identical spans", () => {
  const plan = buildNativeTextStyleBatchPlan({
    pageIndex: 0,
    inputs: [
      input({
        spanId: "a",
        fontResourceName: "F1",
        text: "A",
        start: 20,
        fontSizePt: 12,
        fillColor: black,
      }),
      input({
        spanId: "b",
        fontResourceName: "F2",
        text: "B",
        start: 80,
        fontSizePt: 12,
        fillColor: black,
      }),
    ],
    patch: { fontSizePt: 12 },
  });

  assert.equal(plan.editable, false);
  if (plan.editable) return;
  assert.match(plan.reason, /already match/i);
});
