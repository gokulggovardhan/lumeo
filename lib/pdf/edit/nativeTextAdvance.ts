import type { PdfFontProfile } from "./fontRegistry.ts";
import { stringAdvancePt } from "./fontMetrics.ts";
import type { TextShowOperator } from "./contentStream.ts";

export type NativeTextAdvanceMeasurement = {
  advancePt: number | null;
  glyphCodes: readonly number[] | null;
  reason:
    | null
    | "font-unresolved"
    | "malformed-glyph-bytes"
    | "vertical-writing-unsupported"
    | "composite-encoding-unproven";
};

export function glyphCodesFromTextStrings(
  strings: readonly Uint8Array[],
  bytesPerCode: 1 | 2,
): number[] | null {
  const codes: number[] = [];
  for (const bytes of strings) {
    if (bytesPerCode === 2 && bytes.length % 2 !== 0) return null;
    for (let index = 0; index < bytes.length; index += bytesPerCode) {
      if (bytesPerCode === 1) {
        codes.push(bytes[index]);
      } else {
        codes.push((bytes[index] << 8) | bytes[index + 1]);
      }
    }
  }
  return codes;
}

function compositeAdvanceIsProven(profile: PdfFontProfile): boolean {
  if (profile.kind !== "Type0") return true;
  const font = profile.resolvedFont;
  if (font.writingMode === "vertical") return false;
  return font.compositeEncodingName === "Identity-H";
}

export function measureNativeTextShowAdvance(
  operator: TextShowOperator,
  profile: PdfFontProfile | null,
): NativeTextAdvanceMeasurement {
  if (!profile) {
    return { advancePt: null, glyphCodes: null, reason: "font-unresolved" };
  }

  if (profile.resolvedFont.writingMode === "vertical") {
    return {
      advancePt: null,
      glyphCodes: null,
      reason: "vertical-writing-unsupported",
    };
  }

  if (!compositeAdvanceIsProven(profile)) {
    return {
      advancePt: null,
      glyphCodes: null,
      reason: "composite-encoding-unproven",
    };
  }

  const codes = glyphCodesFromTextStrings(
    operator.strings,
    profile.resolvedFont.bytesPerCode,
  );
  if (!codes) {
    return {
      advancePt: null,
      glyphCodes: null,
      reason: "malformed-glyph-bytes",
    };
  }

  const textAdvancePt = stringAdvancePt(codes, profile.metrics, {
    fontSizePt: operator.fontSizePt,
    charSpacing: operator.charSpacing,
    wordSpacing: operator.wordSpacing,
    horizontalScalingPct: operator.horizontalScalingPct,
  });

  const scale = operator.horizontalScalingPct / 100;
  const tjAdjustmentPt = (operator.tjAdjustments ?? []).reduce(
    (sum, adjustment) =>
      sum - (adjustment / 1000) * operator.fontSizePt * scale,
    0,
  );

  const advancePt = textAdvancePt + tjAdjustmentPt;
  if (!Number.isFinite(advancePt)) {
    return {
      advancePt: null,
      glyphCodes: codes,
      reason: "malformed-glyph-bytes",
    };
  }

  return {
    advancePt,
    glyphCodes: codes,
    reason: null,
  };
}
