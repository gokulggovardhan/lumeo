import {
  PDFArray,
  PDFDict,
  PDFName,
  PDFNumber,
  PDFRef,
  type PDFContext,
} from "pdf-lib";
import type { FontMetrics } from "./fontMetrics.ts";

const MAX_CID = 0xffff;
const MAX_ABS_VERTICAL_METRIC = 1_000_000;

export type PdfVerticalGlyphMetric = Readonly<{
  /** Vertical displacement w1y, in glyph-space units. */
  displacementY: number;
  /** Horizontal component v1x of the vertical position vector. */
  positionX: number;
  /** Vertical component v1y of the vertical position vector. */
  positionY: number;
  source: "W2" | "DW2";
}>;

export type PdfVerticalFontMetricsEvidence =
  | Readonly<{
      kind: "resolved";
      advisoryOnly: true;
      defaultDisplacementY: number;
      defaultPositionY: number;
      explicitMetrics: ReadonlyMap<number, PdfVerticalGlyphMetric>;
      source: "W2" | "DW2";
    }>
  | Readonly<{
      kind: "blocked";
      advisoryOnly: true;
      reason: string;
    }>;

function blocked(reason: string): PdfVerticalFontMetricsEvidence {
  return Object.freeze({ kind: "blocked", advisoryOnly: true, reason });
}

function numberValue(value: unknown): number | null {
  return value instanceof PDFNumber ? value.asNumber() : null;
}

function resolveObject(value: unknown, context: PDFContext): unknown {
  return value instanceof PDFRef ? context.lookup(value) : value;
}

function resolveArray(
  value: unknown,
  context: PDFContext,
): PDFArray | null {
  const resolved = resolveObject(value, context);
  return resolved instanceof PDFArray ? resolved : null;
}

function resolveDict(
  value: unknown,
  context: PDFContext,
): PDFDict | null {
  const resolved = resolveObject(value, context);
  return resolved instanceof PDFDict ? resolved : null;
}

function validCid(value: number | null): value is number {
  return (
    value !== null &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= MAX_CID
  );
}

function validMetric(value: number | null): value is number {
  return (
    value !== null &&
    Number.isFinite(value) &&
    Math.abs(value) <= MAX_ABS_VERTICAL_METRIC
  );
}

function setExplicitMetric(
  metrics: Map<number, PdfVerticalGlyphMetric>,
  cid: number,
  displacementY: number,
  positionX: number,
  positionY: number,
): string | null {
  if (metrics.has(cid)) {
    return `Vertical /W2 defines CID ${cid} more than once, so its metric is ambiguous.`;
  }
  metrics.set(
    cid,
    Object.freeze({
      displacementY,
      positionX,
      positionY,
      source: "W2" as const,
    }),
  );
  return null;
}

/**
 * Parses a CIDFont /W2 array exactly as PDF 32000 defines it:
 *
 *   c [w1y v1x v1y ...]
 *   cFirst cLast w1y v1x v1y
 *
 * Unlike the older horizontal /W parser, this evidence parser fails closed
 * on malformed or overlapping entries. It is a prerequisite for a possible
 * future vertical writer, so partial evidence must never look authoritative.
 */
function parseW2(
  w2: PDFArray,
  context: PDFContext,
): Map<number, PdfVerticalGlyphMetric> | string {
  const metrics = new Map<number, PdfVerticalGlyphMetric>();
  let index = 0;

  while (index < w2.size()) {
    const first = numberValue(w2.get(index));
    if (!validCid(first)) {
      return "Vertical /W2 contains an invalid starting CID.";
    }

    const secondRaw = w2.get(index + 1);
    const secondArray = resolveArray(secondRaw, context);
    if (secondArray) {
      if (secondArray.size() === 0 || secondArray.size() % 3 !== 0) {
        return "Vertical /W2 consecutive metrics must be non-empty w1y/v1x/v1y triplets.";
      }
      const glyphCount = secondArray.size() / 3;
      if (first + glyphCount - 1 > MAX_CID) {
        return "Vertical /W2 consecutive metrics exceed the 16-bit CID range.";
      }

      for (let offset = 0; offset < glyphCount; offset += 1) {
        const displacementY = numberValue(secondArray.get(offset * 3));
        const positionX = numberValue(secondArray.get(offset * 3 + 1));
        const positionY = numberValue(secondArray.get(offset * 3 + 2));
        if (
          !validMetric(displacementY) ||
          !validMetric(positionX) ||
          !validMetric(positionY)
        ) {
          return "Vertical /W2 contains a non-finite or unbounded glyph metric.";
        }
        const issue = setExplicitMetric(
          metrics,
          first + offset,
          displacementY,
          positionX,
          positionY,
        );
        if (issue) return issue;
      }
      index += 2;
      continue;
    }

    const last = numberValue(secondRaw);
    const displacementY = numberValue(w2.get(index + 2));
    const positionX = numberValue(w2.get(index + 3));
    const positionY = numberValue(w2.get(index + 4));
    if (!validCid(last) || last < first) {
      return "Vertical /W2 contains an invalid CID range.";
    }
    if (
      !validMetric(displacementY) ||
      !validMetric(positionX) ||
      !validMetric(positionY)
    ) {
      return "Vertical /W2 range metrics must contain finite w1y/v1x/v1y values.";
    }

    for (let cid = first; cid <= last; cid += 1) {
      const issue = setExplicitMetric(
        metrics,
        cid,
        displacementY,
        positionX,
        positionY,
      );
      if (issue) return issue;
    }
    index += 5;
  }

  return metrics;
}

/**
 * Resolves vertical CIDFont metrics without granting write authority.
 *
 * /DW2 contains [v1y, w1y]. If it is absent, PDF 32000 defines defaults
 * v1y=880 and w1y=-1000. /W2 optionally overrides complete
 * (w1y, v1x, v1y) triples per CID.
 *
 * The default v1x is not stored in /DW2: it is half of that CID's horizontal
 * displacement w0. The per-CID helper derives it from the independently
 * resolved horizontal /W or /DW evidence.
 */
export function resolveVerticalFontMetricsEvidence({
  fontDict,
  context,
  fontKind,
  writingMode,
}: {
  fontDict: PDFDict;
  context: PDFContext;
  fontKind: string;
  writingMode: "horizontal" | "vertical" | "unknown";
}): PdfVerticalFontMetricsEvidence {
  if (fontKind !== "Type0") {
    return blocked(
      "Vertical CID metrics are applicable only to Type0 composite font resources.",
    );
  }
  if (writingMode !== "vertical") {
    return blocked(
      "This PDF font resource is not proven to use vertical writing mode.",
    );
  }

  const descendants = resolveArray(
    fontDict.get(PDFName.of("DescendantFonts")),
    context,
  );
  if (!descendants || descendants.size() !== 1) {
    return blocked(
      "The Type0 font does not expose exactly one descendant CIDFont for vertical metric resolution.",
    );
  }
  const descendant = resolveDict(descendants.get(0), context);
  if (!descendant) {
    return blocked(
      "The Type0 descendant CIDFont could not be resolved for vertical metrics.",
    );
  }

  let defaultPositionY = 880;
  let defaultDisplacementY = -1000;
  const dw2Raw = descendant.get(PDFName.of("DW2"));
  if (dw2Raw !== undefined) {
    const dw2 = resolveArray(dw2Raw, context);
    if (!dw2 || dw2.size() !== 2) {
      return blocked(
        "Vertical /DW2 must contain exactly [v1y, w1y].",
      );
    }
    const positionY = numberValue(dw2.get(0));
    const displacementY = numberValue(dw2.get(1));
    if (!validMetric(positionY) || !validMetric(displacementY)) {
      return blocked(
        "Vertical /DW2 contains a non-finite or unbounded default metric.",
      );
    }
    defaultPositionY = positionY;
    defaultDisplacementY = displacementY;
  }

  const w2Raw = descendant.get(PDFName.of("W2"));
  if (w2Raw === undefined) {
    return Object.freeze({
      kind: "resolved",
      advisoryOnly: true,
      defaultDisplacementY,
      defaultPositionY,
      explicitMetrics: new Map<number, PdfVerticalGlyphMetric>(),
      source: "DW2" as const,
    });
  }

  const w2 = resolveArray(w2Raw, context);
  if (!w2) {
    return blocked("Vertical /W2 is present but is not a PDF array.");
  }
  const parsed = parseW2(w2, context);
  if (typeof parsed === "string") return blocked(parsed);

  return Object.freeze({
    kind: "resolved",
    advisoryOnly: true,
    defaultDisplacementY,
    defaultPositionY,
    explicitMetrics: parsed,
    source: "W2" as const,
  });
}

/**
 * Resolves one CID's complete vertical displacement/position vector.
 *
 * An explicit /W2 triplet wins. Otherwise the PDF default uses:
 *   w1 = (0, DW2[1])
 *   v  = (w0 / 2, DW2[0])
 *
 * This helper still returns advisory evidence only. It does not shape text,
 * validate glyph ordering, build an EditPlan, or authorize a PDF mutation.
 */
export function metricForVerticalCid({
  cid,
  vertical,
  horizontal,
}: {
  cid: number;
  vertical: Extract<PdfVerticalFontMetricsEvidence, { kind: "resolved" }>;
  horizontal: FontMetrics;
}): PdfVerticalGlyphMetric | null {
  if (!Number.isInteger(cid) || cid < 0 || cid > MAX_CID) return null;

  const explicit = vertical.explicitMetrics.get(cid);
  if (explicit) return explicit;

  const width =
    horizontal.glyphWidths.get(cid) ?? horizontal.defaultWidth;
  if (!Number.isFinite(width) || Math.abs(width) > MAX_ABS_VERTICAL_METRIC) {
    return null;
  }

  return Object.freeze({
    displacementY: vertical.defaultDisplacementY,
    positionX: width / 2,
    positionY: vertical.defaultPositionY,
    source: "DW2" as const,
  });
}
