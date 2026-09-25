import type { Matrix2x3, PdfPaintColor, TextShowOperator } from "./contentStream.ts";
import { PdfCoordinateMapper, type PercentBox, type VisualBox } from "./coordinateMapper.ts";
import type { LocatedTextOperator, StreamLocator } from "./formXObjects.ts";
import type { PdfFontProfile } from "./fontRegistry.ts";
import type { DetectedTextRun } from "./textRuns.ts";
import type { TextReconciliationEvidence } from "./textReconciliation.ts";
import type { PageTextCapabilityClassification } from "./documentTextCapability.ts";

export type PdfTextCapability =
  | "native-editable"
  | "fragmented-editable"
  | "view-only"
  | "unsupported";

export type PdfPageTextCapability =
  | "native-editable"
  | "mixed"
  | "view-only"
  | "no-detected-text";

export type PdfTextRegion = "header" | "body" | "footer";
export type PdfWritingDirection = "ltr" | "rtl" | "vertical";

export type PdfTextStyle = {
  fontResourceName: string | null;
  fontFamily: string;
  fontSubtype: string;
  baseFont: string;
  embedded: boolean;
  subset: boolean;
  fontSizePt: number;
  weight: number;
  italic: boolean;
  charSpacingPt: number;
  wordSpacingPt: number;
  horizontalScalingPct: number;
  textRisePt: number;
  renderingMode: number;
  fillColor: PdfPaintColor | null;
  strokeColor: PdfPaintColor | null;
  fillOpacity: number | null;
  strokeOpacity: number | null;
};

export type PdfTextSpan = {
  id: string;
  pageIndex: number;
  sourceRunIndex: number;
  originalText: string;
  text: string;
  boundsPct: PercentBox;
  boundsPt: VisualBox;
  baselinePt: number;
  sourceMatrix: Matrix2x3 | null;
  rotationDeg: number;
  writingDirection: PdfWritingDirection;
  sourceLocator: StreamLocator | null;
  sourceOperatorIndex: number | null;
  sourceOperatorKind: TextShowOperator["kind"] | null;
  style: PdfTextStyle;
  fontProfile: PdfFontProfile | null;
  reconciliationEvidence: TextReconciliationEvidence | null;
  capability: PdfTextCapability;
  capabilityReason: string | null;
};

export type PdfTextLineSegment = {
  spanId: string;
  sourceRunIndex: number;
  start: number;
  end: number;
};

export type PdfTextLine = {
  id: string;
  pageIndex: number;
  spans: PdfTextSpan[];
  text: string;
  segments: PdfTextLineSegment[];
  boundsPct: PercentBox;
  boundsPt: VisualBox;
  baselinePt: number;
  rotationDeg: number;
  region: PdfTextRegion;
};

export type PdfTextBlock = {
  id: string;
  pageIndex: number;
  lines: PdfTextLine[];
  text: string;
  boundsPct: PercentBox;
  boundsPt: VisualBox;
  region: PdfTextRegion;
};

export type PdfPageTextModel = {
  pageIndex: number;
  widthPt: number;
  heightPt: number;
  spans: PdfTextSpan[];
  lines: PdfTextLine[];
  blocks: PdfTextBlock[];
  capability: PdfPageTextCapability;
  editableSpanCount: number;
  viewOnlySpanCount: number;
  unsupportedSpanCount: number;
  classification: PageTextCapabilityClassification | null;
};

export type PdfTextSourceMatch = {
  locatedOperator: LocatedTextOperator;
  operator: TextShowOperator;
} | null;

export type BuildPdfPageTextModelInput = {
  pageIndex: number;
  widthPt: number;
  heightPt: number;
  runs: readonly DetectedTextRun[];
  matches: readonly PdfTextSourceMatch[];
  fontProfiles?: readonly (PdfFontProfile | null)[];
  fragmentedRunIndices?: ReadonlySet<number>;
  reconciliationEvidence?: readonly (TextReconciliationEvidence | null)[];
  classification?: PageTextCapabilityClassification | null;
};

const DEFAULT_ASCENT_RATIO = 0.85;
const LINE_BASELINE_TOLERANCE_FACTOR = 0.35;
const LINE_ANGLE_TOLERANCE_DEG = 2.5;
const BLOCK_VERTICAL_GAP_FACTOR = 1.9;
const HEADER_FOOTER_BAND_PCT = 9;

function normalizeAngleDeg(value: number): number {
  let angle = value % 360;
  if (angle > 180) angle -= 360;
  if (angle <= -180) angle += 360;
  return angle;
}

function angleDistanceDeg(a: number, b: number): number {
  return Math.abs(normalizeAngleDeg(a - b));
}

function matrixRotationDeg(matrix: Matrix2x3 | null, rotatedFallback: boolean): number {
  if (!matrix) return rotatedFallback ? 90 : 0;
  return normalizeAngleDeg((Math.atan2(matrix[1], matrix[0]) * 180) / Math.PI);
}

function inferDirection(text: string, rotationDeg: number): PdfWritingDirection {
  const quarterTurn = Math.abs(Math.abs(normalizeAngleDeg(rotationDeg)) - 90) < 8;
  if (quarterTurn) return "vertical";
  if (/[֐-ࣿ]/u.test(text)) return "rtl";
  return "ltr";
}

function regionForBox(box: PercentBox): PdfTextRegion {
  if (box.yPct < HEADER_FOOTER_BAND_PCT) return "header";
  if (box.yPct + box.heightPct > 100 - HEADER_FOOTER_BAND_PCT) return "footer";
  return "body";
}

function unionPercentBoxes(boxes: readonly PercentBox[]): PercentBox {
  const left = Math.min(...boxes.map((box) => box.xPct));
  const top = Math.min(...boxes.map((box) => box.yPct));
  const right = Math.max(...boxes.map((box) => box.xPct + box.widthPct));
  const bottom = Math.max(...boxes.map((box) => box.yPct + box.heightPct));
  return { xPct: left, yPct: top, widthPct: right - left, heightPct: bottom - top };
}

function styleFor(
  run: DetectedTextRun,
  match: PdfTextSourceMatch,
  fontProfile: PdfFontProfile | null,
): PdfTextStyle {
  const operator = match?.operator ?? null;
  return {
    fontResourceName: operator?.fontResourceName ?? null,
    fontFamily: fontProfile?.familyName ?? run.fontName,
    fontSubtype: fontProfile?.kind ?? "Unknown",
    baseFont: fontProfile?.baseFont ?? run.fontName,
    embedded: fontProfile?.isEmbedded ?? false,
    subset: fontProfile?.isSubset ?? false,
    fontSizePt: operator?.fontSizePt || run.fontSizePt,
    weight: fontProfile?.weight ?? 400,
    italic: fontProfile?.italic ?? false,
    charSpacingPt: operator?.charSpacing ?? 0,
    wordSpacingPt: operator?.wordSpacing ?? 0,
    horizontalScalingPct: operator?.horizontalScalingPct ?? 100,
    textRisePt: operator?.textRise ?? 0,
    renderingMode: operator?.renderMode ?? 0,
    fillColor: operator?.fillColor ?? null,
    strokeColor: operator?.strokeColor ?? null,
    fillOpacity: operator?.fillOpacity ?? null,
    strokeOpacity: operator?.strokeOpacity ?? null,
  };
}

function capabilityFor(
  match: PdfTextSourceMatch,
  fontProfile: PdfFontProfile | null,
  fragmented: boolean,
  reconciliation: TextReconciliationEvidence | null,
): { capability: PdfTextCapability; reason: string | null } {
  if (!match) {
    return {
      capability: "view-only",
      reason: "The visible text could not be reconciled safely to a native PDF text-show operator.",
    };
  }
  if (match.operator.renderMode >= 4) {
    return {
      capability: "unsupported",
      reason: "This text participates in a clipping text-rendering mode and is not safe to rewrite in place.",
    };
  }
  if (!fontProfile) {
    return {
      capability: "view-only",
      reason: "The source font resource could not be resolved safely enough for native editing.",
    };
  }
  if (match.operator.positionReliability === "degraded") {
    return {
      capability: "view-only",
      reason: "The source text position depends on an earlier glyph advance that could not be measured safely.",
    };
  }
  if (fontProfile.kind === "Type3") {
    return {
      capability: "unsupported",
      reason: "Type3 text uses custom glyph programs and is currently read-only.",
    };
  }
  if (fontProfile.resolvedFont.writingMode === "vertical") {
    return {
      capability: "unsupported",
      reason: "Vertical PDF text is currently read-only until vertical metrics and caret geometry are fully supported.",
    };
  }
  if (fontProfile.encodingSource === "Unknown") {
    return {
      capability: "view-only",
      reason: "The font encoding cannot be decoded reliably enough for safe text replacement.",
    };
  }
  if (fontProfile.metricsSource === "Unknown") {
    return {
      capability: "view-only",
      reason: "The font's glyph advance metrics are not proven well enough for safe replacement geometry.",
    };
  }
  if (
    reconciliation?.unicodeAgreement === "conflict" ||
    reconciliation?.directionAgreement === "conflict"
  ) {
    return {
      capability: "view-only",
      reason: "Independent native and PDF.js text evidence materially disagrees.",
    };
  }
  if (
    reconciliation?.source === "reconciled" &&
    reconciliation.confidence !== "high" &&
    reconciliation.confidence !== "medium"
  ) {
    return {
      capability: "view-only",
      reason: "Native and PDF.js text evidence does not reconcile with sufficient confidence.",
    };
  }
  return {
    capability: fragmented ? "fragmented-editable" : "native-editable",
    reason: fragmented
      ? "This visual span is reconstructed from fragmented PDF text operators."
      : null,
  };
}

function composeLineText(
  spans: readonly PdfTextSpan[],
): { text: string; segments: PdfTextLineSegment[] } {
  if (spans.length === 0) return { text: "", segments: [] };

  let text = "";
  const segments: PdfTextLineSegment[] = [];

  for (let index = 0; index < spans.length; index += 1) {
    const current = spans[index];
    if (index > 0) {
      const previous = spans[index - 1];
      const gapPt = current.boundsPt.xPt - (previous.boundsPt.xPt + previous.boundsPt.widthPt);
      const fontSize = Math.max(1, Math.min(previous.style.fontSizePt, current.style.fontSizePt));
      const needsSpace =
        gapPt > fontSize * 0.18 &&
        !/\s$/u.test(text) &&
        !/^\s/u.test(current.text) &&
        !/^[,.;:!?)]/u.test(current.text) &&
        !/[(]$/u.test(text);
      if (needsSpace) text += " ";
    }

    const start = text.length;
    text += current.text;
    segments.push({
      spanId: current.id,
      sourceRunIndex: current.sourceRunIndex,
      start,
      end: text.length,
    });
  }

  return { text, segments };
}

function buildLines(
  pageIndex: number,
  spans: readonly PdfTextSpan[],
  mapper: PdfCoordinateMapper,
): PdfTextLine[] {
  type MutableLine = { spans: PdfTextSpan[]; baselinePt: number; rotationDeg: number };
  const lines: MutableLine[] = [];

  const ordered = [...spans].sort((a, b) => {
    if (Math.abs(a.baselinePt - b.baselinePt) > 0.5) return a.baselinePt - b.baselinePt;
    return a.boundsPt.xPt - b.boundsPt.xPt;
  });

  for (const span of ordered) {
    const baselineTolerance = Math.max(1.5, span.style.fontSizePt * LINE_BASELINE_TOLERANCE_FACTOR);
    let best: MutableLine | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const line of lines) {
      const distance = Math.abs(line.baselinePt - span.baselinePt);
      const rightMost = Math.max(...line.spans.map((item) => item.boundsPt.xPt + item.boundsPt.widthPt));
      const leftMost = Math.min(...line.spans.map((item) => item.boundsPt.xPt));
      const horizontalGap =
        span.boundsPt.xPt > rightMost
          ? span.boundsPt.xPt - rightMost
          : leftMost > span.boundsPt.xPt + span.boundsPt.widthPt
            ? leftMost - (span.boundsPt.xPt + span.boundsPt.widthPt)
            : 0;
      const maxSameLineGap = Math.max(
        span.style.fontSizePt * 6,
        mapper.widthPt * 0.12,
      );
      if (
        distance <= baselineTolerance &&
        horizontalGap <= maxSameLineGap &&
        angleDistanceDeg(line.rotationDeg, span.rotationDeg) <= LINE_ANGLE_TOLERANCE_DEG &&
        distance < bestDistance
      ) {
        best = line;
        bestDistance = distance;
      }
    }

    if (best) {
      best.spans.push(span);
      const count = best.spans.length;
      best.baselinePt = ((best.baselinePt * (count - 1)) + span.baselinePt) / count;
    } else {
      lines.push({ spans: [span], baselinePt: span.baselinePt, rotationDeg: span.rotationDeg });
    }
  }

  return lines
    .map((line, index) => {
      const lineSpans = [...line.spans].sort((a, b) => a.boundsPt.xPt - b.boundsPt.xPt);
      const boundsPct = unionPercentBoxes(lineSpans.map((span) => span.boundsPct));
      const composed = composeLineText(lineSpans);
      return {
        id: `p${pageIndex}-line-${index}`,
        pageIndex,
        spans: lineSpans,
        text: composed.text,
        segments: composed.segments,
        boundsPct,
        boundsPt: mapper.percentBoxToVisualBox(boundsPct),
        baselinePt: line.baselinePt,
        rotationDeg: line.rotationDeg,
        region: regionForBox(boundsPct),
      };
    })
    .sort((a, b) => a.boundsPct.yPct - b.boundsPct.yPct || a.boundsPct.xPct - b.boundsPct.xPct);
}

function overlapRatioX(a: PercentBox, b: PercentBox): number {
  const overlap = Math.max(
    0,
    Math.min(a.xPct + a.widthPct, b.xPct + b.widthPct) - Math.max(a.xPct, b.xPct),
  );
  const denominator = Math.max(0.001, Math.min(a.widthPct, b.widthPct));
  return overlap / denominator;
}

function buildBlocks(
  pageIndex: number,
  lines: readonly PdfTextLine[],
  mapper: PdfCoordinateMapper,
): PdfTextBlock[] {
  type MutableBlock = { lines: PdfTextLine[]; boundsPct: PercentBox; region: PdfTextRegion };
  const blocks: MutableBlock[] = [];

  for (const line of lines) {
    const lineHeightPt = Math.max(1, line.boundsPt.heightPt);
    let best: MutableBlock | null = null;
    let bestGap = Number.POSITIVE_INFINITY;

    for (const block of blocks) {
      if (block.region !== line.region) continue;
      const last = block.lines[block.lines.length - 1];
      if (angleDistanceDeg(last.rotationDeg, line.rotationDeg) > LINE_ANGLE_TOLERANCE_DEG) continue;

      const gapPt = line.boundsPt.yPt - (last.boundsPt.yPt + last.boundsPt.heightPt);
      const maxGap = Math.max(lineHeightPt, last.boundsPt.heightPt) * BLOCK_VERTICAL_GAP_FACTOR;
      const horizontalAffinity =
        overlapRatioX(block.boundsPct, line.boundsPct) >= 0.2 ||
        Math.abs(block.boundsPct.xPct - line.boundsPct.xPct) <= 2;

      if (gapPt >= -lineHeightPt * 0.35 && gapPt <= maxGap && horizontalAffinity && gapPt < bestGap) {
        best = block;
        bestGap = gapPt;
      }
    }

    if (best) {
      best.lines.push(line);
      best.boundsPct = unionPercentBoxes([best.boundsPct, line.boundsPct]);
    } else {
      blocks.push({ lines: [line], boundsPct: line.boundsPct, region: line.region });
    }
  }

  return blocks
    .map((block, index) => ({
      id: `p${pageIndex}-block-${index}`,
      pageIndex,
      lines: block.lines,
      text: block.lines.map((line) => line.text).join("\n"),
      boundsPct: block.boundsPct,
      boundsPt: mapper.percentBoxToVisualBox(block.boundsPct),
      region: block.region,
    }))
    .sort((a, b) => a.boundsPct.yPct - b.boundsPct.yPct || a.boundsPct.xPct - b.boundsPct.xPct);
}

export function buildPdfPageTextModel({
  pageIndex,
  widthPt,
  heightPt,
  runs,
  matches,
  fontProfiles = [],
  fragmentedRunIndices = new Set<number>(),
  reconciliationEvidence = [],
  classification = null,
}: BuildPdfPageTextModelInput): PdfPageTextModel {
  const mapper = new PdfCoordinateMapper(widthPt, heightPt);

  const spans = runs.map((run, sourceRunIndex): PdfTextSpan => {
    const match = matches[sourceRunIndex] ?? null;
    const fontProfile = fontProfiles[sourceRunIndex] ?? null;
    const boundsPct: PercentBox = {
      xPct: run.xPct,
      yPct: run.yPct,
      widthPct: run.widthPct,
      heightPct: run.heightPct,
    };
    const boundsPt = mapper.percentBoxToVisualBox(boundsPct);
    const sourceMatrix = match?.operator.textRenderingMatrix ?? null;
    const rotationDeg = matrixRotationDeg(sourceMatrix, run.rotated);
    const reconciliation = reconciliationEvidence[sourceRunIndex] ?? null;
    const capability = capabilityFor(
      match,
      fontProfile,
      fragmentedRunIndices.has(sourceRunIndex),
      reconciliation,
    );

    return {
      id: `p${pageIndex}-span-${sourceRunIndex}`,
      pageIndex,
      sourceRunIndex,
      originalText: run.str,
      text: run.str,
      boundsPct,
      boundsPt,
      baselinePt: mapper.baselineForBox(boundsPct, DEFAULT_ASCENT_RATIO),
      sourceMatrix,
      rotationDeg,
      writingDirection: inferDirection(run.str, rotationDeg),
      sourceLocator: match?.locatedOperator.locator ?? null,
      sourceOperatorIndex: match?.locatedOperator.operatorIndex ?? null,
      sourceOperatorKind: match?.operator.kind ?? null,
      style: styleFor(run, match, fontProfile),
      fontProfile,
      reconciliationEvidence: reconciliation,
      capability: capability.capability,
      capabilityReason: capability.reason,
    };
  });

  const lines = buildLines(pageIndex, spans, mapper);
  const blocks = buildBlocks(pageIndex, lines, mapper);
  const editableSpanCount = spans.filter(
    (span) => span.capability === "native-editable" || span.capability === "fragmented-editable",
  ).length;
  const unsupportedSpanCount = spans.filter((span) => span.capability === "unsupported").length;
  const viewOnlySpanCount = spans.length - editableSpanCount - unsupportedSpanCount;

  let capability: PdfPageTextCapability;
  if (spans.length === 0) capability = "no-detected-text";
  else if (editableSpanCount === spans.length) capability = "native-editable";
  else if (editableSpanCount > 0) capability = "mixed";
  else capability = "view-only";

  return {
    pageIndex,
    widthPt,
    heightPt,
    spans,
    lines,
    blocks,
    capability,
    editableSpanCount,
    viewOnlySpanCount,
    unsupportedSpanCount,
    classification,
  };
}
