import { multiplyMatrix } from "./contentStream.ts";
import type { Matrix2x3 } from "./contentStream.ts";
import type { LocatedTextOperator } from "./formXObjects.ts";
import { PdfFontRegistry, type PdfFontProfile } from "./fontRegistry.ts";
import { glyphCodesFromTextStrings, measureNativeTextShowAdvance } from "./nativeTextAdvance.ts";
import {
  boxOriginFromTransform,
  transformPoint2x3,
  type DetectedTextRun,
} from "./textRuns.ts";

export type NativeTextDecode = {
  text: string | null;
  complete: boolean;
  glyphCodes: readonly number[] | null;
};

export type NativeDetectedTextSpan = {
  locatedOperator: LocatedTextOperator;
  fontProfile: PdfFontProfile | null;
  decode: NativeTextDecode;
  advancePt: number | null;
  advanceReason: ReturnType<typeof measureNativeTextShowAdvance>["reason"];
  run: DetectedTextRun | null;
  positionReliability: "proven" | "degraded";
};

function decodeOperator(
  located: LocatedTextOperator,
  profile: PdfFontProfile | null,
): NativeTextDecode {
  if (!profile) return { text: null, complete: false, glyphCodes: null };
  const codes = glyphCodesFromTextStrings(
    located.operator.strings,
    profile.resolvedFont.bytesPerCode,
  );
  if (!codes) return { text: null, complete: false, glyphCodes: null };

  let text = "";
  for (const code of codes) {
    const unicode = profile.resolvedFont.glyphCodeToUnicode.get(code);
    if (unicode === undefined) {
      return {
        text: text.length > 0 ? text : null,
        complete: false,
        glyphCodes: codes,
      };
    }
    text += unicode;
  }
  return { text, complete: true, glyphCodes: codes };
}

function visualAdvanceLength(
  operatorMatrix: {
    ctm?: Matrix2x3;
    textMatrix?: Matrix2x3;
  },
  viewportTransform: readonly number[],
  advancePt: number,
): number | null {
  if (!operatorMatrix.ctm || !operatorMatrix.textMatrix) return null;
  const userTextMatrix = multiplyMatrix(
    operatorMatrix.ctm,
    operatorMatrix.textMatrix,
  );
  const viewportTextMatrix = transformPoint2x3(
    [...viewportTransform],
    userTextMatrix,
  );
  const dx = viewportTextMatrix[0] * advancePt;
  const dy = viewportTextMatrix[1] * advancePt;
  const length = Math.hypot(dx, dy);
  return Number.isFinite(length) ? length : null;
}

export function detectNativeTextSpans({
  locatedOperators,
  fontRegistry,
  viewportTransform,
  pageWidthPt,
  pageHeightPt,
}: {
  locatedOperators: readonly LocatedTextOperator[];
  fontRegistry: PdfFontRegistry;
  viewportTransform: readonly number[];
  pageWidthPt: number;
  pageHeightPt: number;
}): NativeDetectedTextSpan[] {
  if (pageWidthPt <= 0 || pageHeightPt <= 0) return [];

  return locatedOperators.map((located): NativeDetectedTextSpan => {
    const resourceName = located.operator.fontResourceName;
    let fontProfile: PdfFontProfile | null = null;
    if (resourceName) {
      try {
        fontProfile = fontRegistry.resolve(located.resources, resourceName);
      } catch {
        fontProfile = null;
      }
    }

    const decode = decodeOperator(located, fontProfile);
    const measured = measureNativeTextShowAdvance(
      located.operator,
      fontProfile,
    );
    const tx = transformPoint2x3(
      [...viewportTransform],
      located.operator.textRenderingMatrix,
    );
    const origin = boxOriginFromTransform(tx);
    const visualAdvance =
      measured.advancePt === null
        ? null
        : visualAdvanceLength(
            located.operator,
            viewportTransform,
            measured.advancePt,
          );

    const canProject =
      decode.complete &&
      decode.text !== null &&
      decode.text.trim().length > 0 &&
      visualAdvance !== null &&
      visualAdvance >= 0 &&
      located.operator.positionReliability !== "degraded";

    const run: DetectedTextRun | null = canProject
      ? {
          str: decode.text!,
          fontName:
            located.operator.fontResourceName ??
            fontProfile?.familyName ??
            "PDF font",
          xPct: (origin.left / pageWidthPt) * 100,
          yPct: (origin.top / pageHeightPt) * 100,
          widthPct: (visualAdvance! / pageWidthPt) * 100,
          heightPct: (origin.fontHeight / pageHeightPt) * 100,
          fontSizePt: origin.fontHeight,
          rotated: origin.rotated,
          detectionSource: "native",
          detectionConfidence: "high",
        }
      : null;

    return {
      locatedOperator: located,
      fontProfile,
      decode,
      advancePt: measured.advancePt,
      advanceReason: measured.reason,
      run,
      positionReliability:
        located.operator.positionReliability ?? "degraded",
    };
  });
}
