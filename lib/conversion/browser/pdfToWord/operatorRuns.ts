import type { PDFDocument } from "pdf-lib";

import {
  multiplyMatrix,
  tokenizeContentStream,
  type Matrix2x3,
  type TextShowOperator,
} from "../../../pdf/edit/contentStream.ts";
import {
  collectPageTextOperators,
  type LocatedTextOperator,
} from "../../../pdf/edit/formXObjects.ts";
import {
  glyphAdvancePt,
  stringAdvancePt,
  type FontMetrics,
} from "../../../pdf/edit/fontMetrics.ts";
import {
  encodeWithFallbackFont,
  fallbackFontMetrics,
} from "../../../pdf/edit/fallbackFont.ts";
import {
  PdfFontRegistry,
  type PdfFontProfile,
} from "../../../pdf/edit/fontRegistry.ts";
import {
  transformPoint2x3,
} from "../../../pdf/edit/textRuns.ts";
import type {
  ReconstructedGlyph,
  ReconstructedTextLine,
} from "./types.ts";

type StreamAppearance = {
  fillColorHex: string;
  tjAdjustmentTotal: number;
};

const DEFAULT_ASCENT_RATIO = 0.85;
const ROTATION_EPSILON_DEG = 0.25;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function hexChannel(value: number): string {
  return Math.round(clamp01(value) * 255)
    .toString(16)
    .padStart(2, "0")
    .toUpperCase();
}

function rgbHex(red: number, green: number, blue: number): string {
  return `#${hexChannel(red)}${hexChannel(green)}${hexChannel(blue)}`;
}

function cmykHex(cyan: number, magenta: number, yellow: number, black: number): string {
  return rgbHex(
    1 - Math.min(1, cyan + black),
    1 - Math.min(1, magenta + black),
    1 - Math.min(1, yellow + black),
  );
}

function colorFromOperands(values: number[]): string | null {
  if (values.length === 1) return rgbHex(values[0], values[0], values[0]);
  if (values.length === 3) return rgbHex(values[0], values[1], values[2]);
  if (values.length === 4) return cmykHex(values[0], values[1], values[2], values[3]);
  return null;
}

/**
 * Extract the effective non-stroking colour at each text-show operator.
 *
 * PDF producers frequently use generic `sc` after selecting a colour
 * space instead of the convenience `rg`/`g` operators. For conversion
 * fidelity the component count is enough to preserve DeviceGray/RGB/CMYK
 * appearances without introducing another PDF engine. Unknown/custom colour
 * spaces simply retain the previous known colour rather than guessing.
 */
function appearanceByOperatorStart(bytes: Uint8Array): Map<number, StreamAppearance> {
  const tokens = tokenizeContentStream(bytes);
  const appearances = new Map<number, StreamAppearance>();
  const stack: string[] = [];
  let fillColorHex = "#000000";
  let operands: typeof tokens = [];
  let operandStart = 0;

  for (const token of tokens) {
    if (token.type !== "operator") {
      if (operands.length === 0) operandStart = token.start;
      operands.push(token);
      continue;
    }

    const values = operands
      .filter((item): item is Extract<(typeof tokens)[number], { type: "number" }> => item.type === "number")
      .map((item) => item.value);

    switch (token.value) {
      case "q":
        stack.push(fillColorHex);
        break;
      case "Q":
        fillColorHex = stack.pop() ?? "#000000";
        break;
      case "g":
        if (values.length >= 1) fillColorHex = rgbHex(values[0], values[0], values[0]);
        break;
      case "rg":
        if (values.length >= 3) fillColorHex = rgbHex(values[0], values[1], values[2]);
        break;
      case "k":
        if (values.length >= 4) fillColorHex = cmykHex(values[0], values[1], values[2], values[3]);
        break;
      case "sc":
      case "scn": {
        const inferred = colorFromOperands(values);
        if (inferred) fillColorHex = inferred;
        break;
      }
      case "Tj":
      case "'":
      case '"':
        appearances.set(operandStart, {
          fillColorHex,
          tjAdjustmentTotal: 0,
        });
        break;
      case "TJ":
        appearances.set(operandStart, {
          fillColorHex,
          // Numeric operands inside a TJ array alter the text position.
          // Summing them is sufficient for the run's total advance even
          // though per-glyph shaping still remains represented separately.
          tjAdjustmentTotal: values.reduce((sum, value) => sum + value, 0),
        });
        break;
      default:
        break;
    }

    operands = [];
  }

  return appearances;
}

function bytesToCodes(bytes: Uint8Array, bytesPerCode: 1 | 2): number[] {
  if (bytesPerCode === 1) return Array.from(bytes);
  const codes: number[] = [];
  for (let index = 0; index + 1 < bytes.length; index += 2) {
    codes.push((bytes[index] << 8) | bytes[index + 1]);
  }
  return codes;
}

function decodeOperator(
  operator: TextShowOperator,
  profile: PdfFontProfile,
): { text: string; codes: number[]; allDecoded: boolean } {
  const codes = operator.strings.flatMap((bytes) =>
    bytesToCodes(bytes, profile.resolvedFont.bytesPerCode),
  );
  let text = "";
  let allDecoded = true;
  for (const code of codes) {
    const decoded = profile.resolvedFont.glyphCodeToUnicode.get(code);
    if (decoded === undefined) {
      allDecoded = false;
      continue;
    }
    text += decoded;
  }
  return { text, codes, allDecoded };
}

function normalizeWordFamily(profile: PdfFontProfile): string {
  const descriptor = `${profile.familyName} ${profile.baseFont} ${profile.fallbackPdfFont}`.toLowerCase();
  if (/courier|mono|consol|menlo/.test(descriptor)) return "Courier New";
  if (/times|serif|cambria|georgia|garamond/.test(descriptor)) return "Times New Roman";
  if (/arial|helvetica|sfui|sans|segoe|roboto|futura/.test(descriptor)) return "Arial";
  return profile.familyName || "Arial";
}

function normalizeAngleDeg(value: number): number {
  let angle = value % 360;
  if (angle > 180) angle -= 360;
  if (angle <= -180) angle += 360;
  return angle;
}

function visualOrigin(
  tx: number[],
  ascentRatio: number,
): {
  left: number;
  top: number;
  baseline: number;
  fontHeight: number;
  rotationDeg: number;
} {
  const angle = Math.atan2(tx[1], tx[0]);
  const rotationDeg = normalizeAngleDeg((angle * 180) / Math.PI);
  const fontHeight = Math.hypot(tx[2], tx[3]);
  const ascent = fontHeight * ascentRatio;
  const rotated = Math.abs(rotationDeg) > ROTATION_EPSILON_DEG;
  return {
    left: rotated ? tx[4] + ascent * Math.sin(angle) : tx[4],
    top: rotated ? tx[5] - ascent * Math.cos(angle) : tx[5] - ascent,
    baseline: tx[5],
    fontHeight,
    rotationDeg,
  };
}

function xAxisScale(
  tx: number[],
  operator: TextShowOperator,
): number {
  const nominal =
    operator.fontSizePt * Math.abs(operator.horizontalScalingPct / 100);
  return nominal > 0 ? Math.hypot(tx[0], tx[1]) / nominal : 1;
}

function glyphsFor(
  codes: number[],
  profile: PdfFontProfile,
  metrics: FontMetrics,
  operator: TextShowOperator,
  transformedXAxisScale: number,
): ReconstructedGlyph[] {
  const horizontalScale = operator.horizontalScalingPct / 100;
  return codes.map((code) => {
    const text = profile.resolvedFont.glyphCodeToUnicode.get(code) ?? "";
    const wordSpacing =
      metrics.bytesPerCode === 1 && code === 32 ? operator.wordSpacing : 0;
    const baseAdvance =
      glyphAdvancePt(code, metrics, operator.fontSizePt) +
      operator.charSpacing +
      wordSpacing;
    return {
      text,
      code,
      advancePt:
        baseAdvance * horizontalScale * transformedXAxisScale,
    };
  });
}

function wordFallbackScalePct(
  text: string,
  profile: PdfFontProfile,
  operator: TextShowOperator,
  sourceAdvancePt: number,
  transformedXAxisScale: number,
): number {
  const fallbackCodes = encodeWithFallbackFont(text);
  if (!fallbackCodes || fallbackCodes.length === 0) return 100;

  const metrics = fallbackFontMetrics(profile.fallbackPdfFont);
  const naturalPt =
    stringAdvancePt(fallbackCodes, metrics, {
      fontSizePt: operator.fontSizePt,
      charSpacing: 0,
      wordSpacing: 0,
      horizontalScalingPct: 100,
    }) * transformedXAxisScale;
  if (!Number.isFinite(naturalPt) || naturalPt <= 0.1) return 100;

  const scale = (sourceAdvancePt / naturalPt) * 100;
  // Word supports a broad character-scale range, but values outside this
  // conservative band are a signal that this is not a metric-compatible
  // fallback. fitText remains as a final containment guard in that case.
  return Math.max(70, Math.min(130, scale));
}

function totalAdvancePt(
  glyphs: ReconstructedGlyph[],
  operator: TextShowOperator,
  appearance: StreamAppearance,
  transformedXAxisScale: number,
): number {
  const glyphAdvance = glyphs.reduce((sum, glyph) => sum + glyph.advancePt, 0);
  const tjDelta =
    (-appearance.tjAdjustmentTotal / 1000) *
    operator.fontSizePt *
    (operator.horizontalScalingPct / 100) *
    transformedXAxisScale;
  return glyphAdvance + tjDelta;
}

function sameVisualLine(a: ReconstructedTextLine, b: ReconstructedTextLine): boolean {
  const baselineA = a.baselinePt ?? a.yPt + a.heightPt * 0.85;
  const baselineB = b.baselinePt ?? b.yPt + b.heightPt * 0.85;
  return (
    Math.abs(baselineB - baselineA) <=
      Math.max(0.9, Math.min(a.fontSizePt, b.fontSizePt) * 0.14) &&
    Math.abs((a.rotationDeg ?? 0) - (b.rotationDeg ?? 0)) <= 0.5
  );
}

function compatibleStyle(a: ReconstructedTextLine, b: ReconstructedTextLine): boolean {
  return (
    a.fontFamily === b.fontFamily &&
    a.bold === b.bold &&
    a.italic === b.italic &&
    (a.colorHex ?? "#000000") === (b.colorHex ?? "#000000") &&
    Math.abs(a.fontSizePt - b.fontSizePt) <= 0.15
  );
}

/**
 * Merge only genuinely contiguous operator fragments. A gap larger than a
 * small fraction of an em deliberately stays split, even when PDF.js would
 * have merged the same material into one TextItem. That is what protects
 * independent invoice/table cells sharing a baseline.
 */
function mergeContiguousOperatorFragments(
  lines: ReconstructedTextLine[],
): ReconstructedTextLine[] {
  const byVisualOrder = [...lines].sort(
    (a, b) =>
      (a.baselinePt ?? a.yPt) - (b.baselinePt ?? b.yPt) ||
      a.xPt - b.xPt,
  );
  const consumed = new Set<ReconstructedTextLine>();
  const merged: ReconstructedTextLine[] = [];

  for (const seed of byVisualOrder) {
    if (consumed.has(seed)) continue;
    let current = { ...seed, glyphs: seed.glyphs ? [...seed.glyphs] : undefined };
    consumed.add(seed);

    while (true) {
      const right = current.xPt + current.widthPt;
      let candidate: ReconstructedTextLine | null = null;
      let bestGap = Number.POSITIVE_INFINITY;

      for (const item of byVisualOrder) {
        if (consumed.has(item) || !sameVisualLine(current, item) || !compatibleStyle(current, item)) {
          continue;
        }
        const gap = item.xPt - right;
        if (
          gap >= -0.2 &&
          gap <= Math.max(0.8, current.fontSizePt * 0.16) &&
          gap < bestGap
        ) {
          candidate = item;
          bestGap = gap;
        }
      }

      if (!candidate) break;
      const needsSpace =
        bestGap > current.fontSizePt * 0.08 &&
        !/\s$/u.test(current.text) &&
        !/^\s/u.test(candidate.text);
      current.text += needsSpace ? ` ${candidate.text}` : candidate.text;
      current.widthPt =
        candidate.xPt + candidate.widthPt - current.xPt;
      current.heightPt = Math.max(current.heightPt, candidate.heightPt);
      current.glyphs = [
        ...(current.glyphs ?? []),
        ...(needsSpace
          ? [{ text: " ", code: null, advancePt: bestGap }]
          : []),
        ...(candidate.glyphs ?? []),
      ];
      current.readingOrderIndex = Math.min(
        current.readingOrderIndex ?? Number.MAX_SAFE_INTEGER,
        candidate.readingOrderIndex ?? Number.MAX_SAFE_INTEGER,
      );
      consumed.add(candidate);
    }

    merged.push(current);
  }

  return merged;
}

export type OperatorRunExtraction = {
  lines: ReconstructedTextLine[];
  decodedOperatorCount: number;
  totalOperatorCount: number;
  decodedCharacterCount: number;
};

export function reconstructOperatorTextRuns({
  document,
  registry,
  pageIndex,
  viewportTransform,
}: {
  document: PDFDocument;
  registry: PdfFontRegistry;
  pageIndex: number;
  viewportTransform: number[];
}): OperatorRunExtraction {
  const located = collectPageTextOperators(document, pageIndex);
  const appearanceCache = new WeakMap<Uint8Array, Map<number, StreamAppearance>>();
  const lines: ReconstructedTextLine[] = [];
  let decodedOperatorCount = 0;
  let decodedCharacterCount = 0;

  located.forEach((locatedOperator: LocatedTextOperator, readingOrderIndex) => {
    const operator = locatedOperator.operator;
    const resourceName = operator.fontResourceName;
    if (!resourceName) return;

    let profile: PdfFontProfile | null = null;
    try {
      profile = registry.resolve(locatedOperator.resources, resourceName);
    } catch {
      profile = null;
    }
    if (!profile) return;

    const decoded = decodeOperator(operator, profile);
    if (!decoded.allDecoded || !decoded.text.trim()) return;

    let appearance = appearanceCache.get(locatedOperator.streamBytes);
    if (!appearance) {
      appearance = appearanceByOperatorStart(locatedOperator.streamBytes);
      appearanceCache.set(locatedOperator.streamBytes, appearance);
    }
    const sourceAppearance =
      appearance.get(operator.start) ?? {
        fillColorHex: "#000000",
        tjAdjustmentTotal: 0,
      };

    const tx = transformPoint2x3(viewportTransform, operator.textRenderingMatrix);
    const ascentRatio =
      profile.ascentRatio !== null &&
      profile.ascentRatio > 0.25 &&
      profile.ascentRatio < 1.5
        ? profile.ascentRatio
        : DEFAULT_ASCENT_RATIO;
    const origin = visualOrigin(tx, ascentRatio);
    const axisScale = xAxisScale(tx, operator);
    const glyphs = glyphsFor(
      decoded.codes,
      profile,
      profile.metrics,
      operator,
      axisScale,
    );
    const widthPt = Math.max(
      0.5,
      totalAdvancePt(glyphs, operator, sourceAppearance, axisScale),
    );
    const wordScalePct = wordFallbackScalePct(
      decoded.text,
      profile,
      operator,
      widthPt,
      axisScale,
    );

    const line: ReconstructedTextLine = {
      text: decoded.text,
      xPt: origin.left,
      yPt: origin.top,
      widthPt,
      heightPt: Math.max(origin.fontHeight, 1),
      fontSizePt: Math.max(origin.fontHeight, 1),
      fontFamily: normalizeWordFamily(profile),
      bold: profile.weight >= 600,
      italic: profile.italic,
      baselinePt: origin.baseline,
      rotationDeg: origin.rotationDeg,
      sourceFontName: profile.baseFont,
      fontWeight: profile.weight,
      charSpacingPt:
        operator.charSpacing *
        (operator.horizontalScalingPct / 100) *
        axisScale,
      wordSpacingPt:
        operator.wordSpacing *
        (operator.horizontalScalingPct / 100) *
        axisScale,
      horizontalScalingPct: operator.horizontalScalingPct,
      wordScalePct,
      textRisePt: operator.textRise,
      colorHex: sourceAppearance.fillColorHex,
      underline: false,
      underlineColorHex: null,
      hyperlinkUrl: null,
      readingOrderIndex,
      sourceKind: "operator",
      visualOnly: Math.abs(origin.rotationDeg) > ROTATION_EPSILON_DEG,
      glyphs,
    };
    lines.push(line);
    decodedOperatorCount += 1;
    decodedCharacterCount += decoded.text.length;
  });

  const merged = mergeContiguousOperatorFragments(lines);
  merged
    .sort(
      (a, b) =>
        (a.yPt - b.yPt) ||
        (a.xPt - b.xPt),
    )
    .forEach((line, visualOrderIndex) => {
      line.visualOrderIndex = visualOrderIndex;
    });

  // Return in source/content-stream order for accessible/logical Word XML;
  // the absolute X/Y on each frame independently controls visual placement.
  merged.sort(
    (a, b) =>
      (a.readingOrderIndex ?? 0) - (b.readingOrderIndex ?? 0),
  );

  return {
    lines: merged,
    decodedOperatorCount,
    totalOperatorCount: located.length,
    decodedCharacterCount,
  };
}
