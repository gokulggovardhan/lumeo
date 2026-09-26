import assert from "node:assert/strict";
import test from "node:test";
import { walkTextShowOperators } from "../lib/pdf/edit/contentStream.ts";
import {
  buildEditPlan,
  isValidatedEditPlan,
  type ValidatedEditPlan,
} from "../lib/pdf/edit/editPlan.ts";
import type { TextShowState } from "../lib/pdf/edit/fontMetrics.ts";
import {
  applyEditPlanWithNativePaintToBytes,
  NativePaintPlanRejectedError,
} from "../lib/pdf/edit/nativePaintApply.ts";
import { buildNativePaintPlan } from "../lib/pdf/edit/nativePaint.ts";

const encoder = new TextEncoder();

function editablePlanForFirstOperator(
  bytes: Uint8Array,
  replacementTextState: Partial<TextShowState> | null = null,
): ValidatedEditPlan {
  const operators = walkTextShowOperators(bytes);
  assert.equal(operators.length, 2);
  const operator = operators[0];

  const resolvedFont = {
    kind: "Type1" as const,
    baseFont: "Helvetica",
    isEmbedded: false,
    isSubset: false,
    bytesPerCode: 1 as const,
    encodingSource: "WinAnsi" as const,
    glyphCodeToUnicode: new Map([
      [0x41, "A"],
      [0x42, "B"],
      [0x43, "C"],
    ]),
    unicodeToGlyphCode: new Map([
      ["A", 0x41],
      ["B", 0x42],
      ["C", 0x43],
    ]),
  };
  const fontMetrics = {
    bytesPerCode: 1 as const,
    defaultWidth: 500,
    glyphWidths: new Map([
      [0x41, 500],
      [0x42, 500],
      [0x43, 500],
    ]),
    source: "Widths" as const,
  };

  const plan = buildEditPlan({
    pageIndex: 0,
    contentStreamIndex: 0,
    operatorIndex: 0,
    operator,
    replacementText: "C",
    resolvedFont,
    fontMetrics,
    replacementTextState,
  });
  if (!isValidatedEditPlan(plan)) {
    throw new Error(plan.reason);
  }
  return plan;
}

test("native paint wraps one rewritten Tj and restores the exact original colour before later text", () => {
  const bytes = encoder.encode(
    "BT /F1 12 Tf 0 0 1 rg <41> Tj <42> Tj ET",
  );
  const operators = walkTextShowOperators(bytes);
  const plan = editablePlanForFirstOperator(bytes);
  const paint = buildNativePaintPlan(operators[0], {
    fillColor: { colorSpace: "DeviceRGB", components: [1, 0, 0], cssHex: "#ff0000" },
  });
  assert.equal(paint.editable, true);

  const edited = applyEditPlanWithNativePaintToBytes(bytes, plan, 1, paint);
  const text = new TextDecoder().decode(edited);
  assert.match(text, /1 0 0 rg <43> Tj 0 0 1 rg <42> Tj/);

  const reparsed = walkTextShowOperators(edited);
  assert.equal(reparsed.length, 2);
  assert.deepEqual(reparsed[0].strings[0], Uint8Array.from([0x43]));
  assert.equal(reparsed[0].fillColor?.cssHex, "#ff0000");
  assert.deepEqual(reparsed[1].strings[0], Uint8Array.from([0x42]));
  assert.equal(reparsed[1].fillColor?.cssHex, "#0000ff");
});

test("native paint composes with existing Tc/Tw/Tz/Tf text-state formatting inside the same local segment", () => {
  const bytes = encoder.encode(
    "BT /F1 12 Tf 0 g <41> Tj <42> Tj ET",
  );
  const plan = editablePlanForFirstOperator(bytes, {
    fontSizePt: 14,
    charSpacing: 0.5,
    wordSpacing: 1,
    horizontalScalingPct: 96,
  });
  const paint = buildNativePaintPlan(walkTextShowOperators(bytes)[0], {
    fillColor: { colorSpace: "DeviceRGB", components: [0, 0.5, 0], cssHex: "#008000" },
  });
  assert.equal(paint.editable, true);

  const edited = applyEditPlanWithNativePaintToBytes(bytes, plan, 1, paint);
  const text = new TextDecoder().decode(edited);
  // The real dry-run preserves the source endpoint under the changed size/
  // scale, so this case must promote Tj to a compensated TJ rather than
  // pretending the replacement has the same effective advance.
  assert.match(
    text,
    /0 0\.5 0 rg[\s\S]*14 Tf[\s\S]*0\.5 Tc[\s\S]*1 Tw[\s\S]*96 Tz[\s\S]*\[<43> -?[\d.]+\] TJ/,
  );
  // The established writer restores text state in reverse dependency order,
  // then native paint restores colour. Assert that exact sequence rather
  // than imposing an alternative ordering that the proven writer never used.
  assert.match(text, /100 Tz[\s\S]*0 Tw[\s\S]*0 Tc[\s\S]*\/F1 12 Tf[\s\S]*0 g <42> Tj/);

  const reparsed = walkTextShowOperators(edited);
  assert.equal(reparsed[0].fontSizePt, 14);
  assert.equal(reparsed[0].charSpacing, 0.5);
  assert.equal(reparsed[0].wordSpacing, 1);
  assert.equal(reparsed[0].horizontalScalingPct, 96);
  assert.equal(reparsed[0].fillColor?.cssHex, "#008000");

  assert.equal(reparsed[1].fontSizePt, 12);
  assert.equal(reparsed[1].charSpacing, 0);
  assert.equal(reparsed[1].wordSpacing, 0);
  assert.equal(reparsed[1].horizontalScalingPct, 100);
  assert.equal(reparsed[1].fillColor?.cssHex, "#000000");
});

test("a rejected paint plan never reaches the proven text writer", () => {
  const bytes = encoder.encode("BT /F1 12 Tf <41> Tj <42> Tj ET");
  const plan = editablePlanForFirstOperator(bytes);
  const paint = buildNativePaintPlan(
    { ...walkTextShowOperators(bytes)[0], fillColor: null },
    { fillColor: { colorSpace: "DeviceRGB", components: [1, 0, 0], cssHex: "#ff0000" } },
  );
  assert.equal(paint.editable, false);
  assert.throws(
    () => applyEditPlanWithNativePaintToBytes(bytes, plan, 1, paint),
    (error: unknown) =>
      error instanceof NativePaintPlanRejectedError && /original fill colour is unknown/i.test(error.message),
  );
});
