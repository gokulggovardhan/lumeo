import assert from "node:assert/strict";
import test from "node:test";
import { walkTextShowOperators } from "../lib/pdf/edit/contentStream.ts";
import type { EditPlan } from "../lib/pdf/edit/editPlan.ts";
import {
  applyEditPlanWithNativePaintToBytes,
  NativePaintPlanRejectedError,
} from "../lib/pdf/edit/nativePaintApply.ts";
import { buildNativePaintPlan } from "../lib/pdf/edit/nativePaint.ts";

const encoder = new TextEncoder();

function editablePlanForFirstOperator(bytes: Uint8Array): EditPlan {
  const operators = walkTextShowOperators(bytes);
  assert.equal(operators.length, 2);
  const operator = operators[0];
  return {
    pageIndex: 0,
    contentStreamIndex: 0,
    formPath: null,
    operatorIndex: 0,
    operatorType: "Tj",
    fontResourceName: "F1",
    fontSizePt: 12,
    wordSpacing: 0,
    charSpacing: 0,
    horizontalScalingPct: 100,
    replacementTextState: null,
    originalText: "A",
    replacementText: "C",
    originalGlyphCodes: [0x41],
    replacementGlyphCodes: [0x43],
    originalWidthPt: 6,
    replacementWidthPt: 6,
    tjSpacingDelta: 0,
    byteOffset: operator.start,
    byteLength: operator.end - operator.start,
    fallbackFont: null,
    editable: true,
    reason: null,
  };
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
  const plan = {
    ...editablePlanForFirstOperator(bytes),
    replacementTextState: {
      fontSizePt: 14,
      charSpacing: 0.5,
      wordSpacing: 1,
      horizontalScalingPct: 96,
    },
  } satisfies EditPlan;
  const paint = buildNativePaintPlan(walkTextShowOperators(bytes)[0], {
    fillColor: { colorSpace: "DeviceRGB", components: [0, 0.5, 0], cssHex: "#008000" },
  });
  assert.equal(paint.editable, true);

  const edited = applyEditPlanWithNativePaintToBytes(bytes, plan, 1, paint);
  const text = new TextDecoder().decode(edited);
  assert.match(text, /0 0\.5 0 rg[\s\S]*14 Tf[\s\S]*0\.5 Tc[\s\S]*1 Tw[\s\S]*96 Tz[\s\S]*<43> Tj/);
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
