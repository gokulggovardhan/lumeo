import type { LocatedTextOperator } from "./formXObjects.ts";
import type { PdfFontProfile } from "./fontRegistry.ts";
import { transformPoint2x3, type DetectedTextRun } from "./textRuns.ts";

export type NativeGeometryConfidence = "exact-simple-run" | "source-only";

export type NativeContentStreamSpan = {
  key: string;
  text: string;
  glyphCodes: readonly number[];
  decodeComplete: boolean;
  locatedOperator: LocatedTextOperator;
  fontProfile: PdfFontProfile | null;
  geometryConfidence: NativeGeometryConfidence;
  detectedRun: DetectedTextRun | null;
  limitationReason: string | null;
};

export type NativeTextDetectionInput = {
  operators: readonly LocatedTextOperator[];
  viewportTransform: readonly number[];
  pageWidthPt: number;
  pageHeightPt: number;
  resolveFontProfile: (operator: LocatedTextOperator) => PdfFontProfile | null;
};

function codesFromStrings(
  strings: readonly Uint8Array[],
  bytesPerCode: 1 | 2,
): number[] | null {
  const codes: number[] = [];
  for (const bytes of strings) {
    if (bytesPerCode === 2 && bytes.length % 2 !== 0) return null;
    for (let index = 0; index < bytes.length; index += bytesPerCode) {
      codes.push(
        bytesPerCode === 1
          ? bytes[index]
          : (bytes[index] << 8) | bytes[index + 1],
      );
    }
  }
  return codes;
}

function decode(
  operator: LocatedTextOperator["operator"],
  profile: PdfFontProfile | null,
): { text: string; glyphCodes: number[]; complete: boolean } {
  if (!profile) return { text: "", glyphCodes: [], complete: false };
  const glyphCodes = codesFromStrings(
    operator.strings,
    profile.resolvedFont.bytesPerCode,
  );
  if (!glyphCodes) return { text: "", glyphCodes: [], complete: false };

  let text = "";
  let complete = true;
  for (const code of glyphCodes) {
    const value = profile.resolvedFont.glyphCodeToUnicode.get(code);
    if (value === undefined) {
      complete = false;
      continue;
    }
    text += value;
  }
  return { text, glyphCodes, complete };
}

export function locatedTextOperatorKey(operator: LocatedTextOperator): string {
  const locator =
    operator.locator.kind === "page"
      ? `page:${operator.locator.contentStreamIndex}`
      : `xobject:${operator.locator.formPath.join("/")}`;
  return `${locator}:operator:${operator.operatorIndex}`;
}

function axisAngleDeg(x: number, y: number): number {
  return (Math.atan2(y, x) * 180) / Math.PI;
}

function skewMagnitudeDeg(transform: readonly number[]): number {
  const xAxis = axisAngleDeg(transform[0], transform[1]);
  const yAxis = axisAngleDeg(-transform[2], transform[3]);
  const delta = Math.abs(yAxis - xAxis);
  const normalized = Math.min(delta, Math.abs(180 - delta));
  return normalized;
}

function normalizedAdvance(
  glyphCodes: readonly number[],
  profile: PdfFontProfile,
  operator: LocatedTextOperator["operator"],
): number | null {
  if (operator.fontSizePt <= 0 || glyphCodes.length === 0) return null;
  let advance = 0;
  for (const code of glyphCodes) {
    const width =
      profile.metrics.glyphWidths.get(code) ?? profile.metrics.defaultWidth;
    if (!Number.isFinite(width) || width <= 0) return null;
    advance += width / 1000;
    advance += operator.charSpacing / operator.fontSizePt;
    if (profile.bytesPerCode === 1 && code === 32) {
      advance += operator.wordSpacing / operator.fontSizePt;
    }
  }
  return Number.isFinite(advance) && advance > 0 ? advance : null;
}

function synthesizeRun({
  key,
  text,
  glyphCodes,
  located,
  profile,
  viewportTransform,
  pageWidthPt,
  pageHeightPt,
}: {
  key: string;
  text: string;
  glyphCodes: readonly number[];
  located: LocatedTextOperator;
  profile: PdfFontProfile;
  viewportTransform: readonly number[];
  pageWidthPt: number;
  pageHeightPt: number;
}): DetectedTextRun | null {
  const operator = located.operator;

  // TJ includes explicit numeric positioning adjustments which are not yet
  // retained on TextShowOperator. Do not fabricate native geometry for it.
  if (operator.kind === "TJ") return null;
  if (operator.renderMode >= 4) return null;
  if (profile.kind === "Type3") return null;
  if (profile.encodingSource === "Unknown" || profile.metricsSource === "Unknown") {
    return null;
  }
  if (
    profile.ascentRatio === null ||
    profile.descentRatio === null ||
    !Number.isFinite(profile.ascentRatio) ||
    !Number.isFinite(profile.descentRatio)
  ) {
    return null;
  }

  const advance = normalizedAdvance(glyphCodes, profile, operator);
  if (advance === null) return null;

  const tx = transformPoint2x3(
    [...viewportTransform],
    [...operator.textRenderingMatrix],
  );
  if (tx.some((value) => !Number.isFinite(value))) return null;

  // A strongly non-orthogonal text basis is complex vector text. Keep the
  // source evidence, but do not invent a rectangular editable run.
  if (skewMagnitudeDeg(tx) > 4) return null;

  const base = [tx[4], tx[5]] as const;
  const end = [base[0] + tx[0] * advance, base[1] + tx[1] * advance] as const;
  const topStart = [
    base[0] + tx[2] * profile.ascentRatio,
    base[1] + tx[3] * profile.ascentRatio,
  ] as const;
  const topEnd = [
    end[0] + tx[2] * profile.ascentRatio,
    end[1] + tx[3] * profile.ascentRatio,
  ] as const;
  const bottomStart = [
    base[0] + tx[2] * profile.descentRatio,
    base[1] + tx[3] * profile.descentRatio,
  ] as const;
  const bottomEnd = [
    end[0] + tx[2] * profile.descentRatio,
    end[1] + tx[3] * profile.descentRatio,
  ] as const;

  const xs = [topStart[0], topEnd[0], bottomStart[0], bottomEnd[0]];
  const ys = [topStart[1], topEnd[1], bottomStart[1], bottomEnd[1]];
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  const width = right - left;
  const height = bottom - top;

  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0 ||
    pageWidthPt <= 0 ||
    pageHeightPt <= 0
  ) {
    return null;
  }

  return {
    str: text,
    fontName: profile.resourceName,
    xPct: (left / pageWidthPt) * 100,
    yPct: (top / pageHeightPt) * 100,
    widthPct: (width / pageWidthPt) * 100,
    heightPct: (height / pageHeightPt) * 100,
    fontSizePt: operator.fontSizePt,
    rotated: Math.abs(axisAngleDeg(tx[0], tx[1])) > 0.1,
    detectionSource: "native",
    nativeSourceKey: key,
  };
}

export function buildNativeContentStreamSpans({
  operators,
  viewportTransform,
  pageWidthPt,
  pageHeightPt,
  resolveFontProfile,
}: NativeTextDetectionInput): NativeContentStreamSpan[] {
  return operators.map((located) => {
    const key = locatedTextOperatorKey(located);
    const profile = resolveFontProfile(located);
    const decoded = decode(located.operator, profile);
    let limitationReason: string | null = null;

    if (!located.operator.fontResourceName) {
      limitationReason = "The PDF text operator does not identify a font resource.";
    } else if (!profile) {
      limitationReason = "The PDF font resource could not be resolved.";
    } else if (!decoded.complete) {
      limitationReason = "The PDF character encoding could not be decoded completely.";
    }

    const detectedRun =
      profile && decoded.complete && decoded.text.trim()
        ? synthesizeRun({
            key,
            text: decoded.text,
            glyphCodes: decoded.glyphCodes,
            located,
            profile,
            viewportTransform,
            pageWidthPt,
            pageHeightPt,
          })
        : null;

    if (!limitationReason && decoded.complete && decoded.text.trim() && !detectedRun) {
      limitationReason =
        "Native text was decoded, but its geometry is not yet proven safe enough to expose as an editable run.";
    }

    return {
      key,
      text: decoded.text,
      glyphCodes: decoded.glyphCodes,
      decodeComplete: decoded.complete,
      locatedOperator: located,
      fontProfile: profile,
      geometryConfidence: detectedRun ? "exact-simple-run" : "source-only",
      detectedRun,
      limitationReason,
    };
  });
}

export function nativeDetectedRuns(
  spans: readonly NativeContentStreamSpan[],
): DetectedTextRun[] {
  return spans
    .map((span) => span.detectedRun)
    .filter((run): run is DetectedTextRun => run !== null);
}
