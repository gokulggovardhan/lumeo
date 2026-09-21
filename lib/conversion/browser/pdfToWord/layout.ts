import {
  textRunsFromContent,
  type DetectedTextRun,
} from "../../../pdf/edit/textRuns.ts";
import type {
  OcrTextLine,
  ReconstructedTextLine,
} from "./types.ts";

type PdfTextItem = {
  str: string;
  transform: number[];
  width: number;
  fontName: string;
};

type PdfMarkedContent = { type: string };

function fontFamilyFromName(fontName: string): string {
  const normalized = fontName.replace(/^[A-Z]{6}\+/, "").replace(/[-_](Bold|Italic|Oblique).*$/i, "");
  return normalized || "Arial";
}

function styleFromFontName(fontName: string) {
  return {
    bold: /bold|black|semibold|demi/i.test(fontName),
    italic: /italic|oblique/i.test(fontName),
  };
}

function normalizeTextGap(left: DetectedTextRun, right: DetectedTextRun): string {
  const leftEnd = left.xPct + left.widthPct;
  const gap = right.xPct - leftEnd;
  if (left.str.endsWith(" ") || right.str.startsWith(" ")) return "";
  return gap > Math.max(0.35, left.heightPct * 0.18) ? " " : "";
}

export function reconstructTextLines(
  items: Array<PdfTextItem | PdfMarkedContent>,
  viewportTransform: number[],
  pageWidthPt: number,
  pageHeightPt: number,
): ReconstructedTextLine[] {
  const runs = textRunsFromContent(
    items,
    viewportTransform,
    pageWidthPt,
    pageHeightPt,
  );

  if (!runs.length) return [];

  const sorted = [...runs].sort((a, b) => {
    const yDiff = a.yPct - b.yPct;
    return Math.abs(yDiff) > 0.35 ? yDiff : a.xPct - b.xPct;
  });

  const groups: DetectedTextRun[][] = [];

  for (const run of sorted) {
    const last = groups.at(-1);
    if (!last) {
      groups.push([run]);
      continue;
    }

    const baseline = last.reduce((sum, item) => sum + item.yPct, 0) / last.length;
    const tolerancePct = Math.max(
      0.35,
      (Math.max(run.fontSizePt, ...last.map((item) => item.fontSizePt)) /
        pageHeightPt) *
        45,
    );

    if (Math.abs(run.yPct - baseline) <= tolerancePct) {
      last.push(run);
      last.sort((a, b) => a.xPct - b.xPct);
    } else {
      groups.push([run]);
    }
  }

  return groups.map((group) => {
    const first = group[0];
    const last = group[group.length - 1];
    let text = "";
    for (let index = 0; index < group.length; index += 1) {
      if (index > 0) text += normalizeTextGap(group[index - 1], group[index]);
      text += group[index].str;
    }

    const dominant = group.reduce((best, item) =>
      item.str.length > best.str.length ? item : best,
    );
    const style = styleFromFontName(dominant.fontName);
    const maxHeightPct = Math.max(...group.map((item) => item.heightPct));
    const fontSizePt = Math.max(...group.map((item) => item.fontSizePt));

    return {
      text,
      xPt: (first.xPct / 100) * pageWidthPt,
      yPt: (Math.min(...group.map((item) => item.yPct)) / 100) * pageHeightPt,
      widthPt:
        ((last.xPct + last.widthPct - first.xPct) / 100) * pageWidthPt,
      heightPt: Math.max(
        (maxHeightPct / 100) * pageHeightPt,
        fontSizePt * 1.15,
      ),
      fontSizePt,
      fontFamily: fontFamilyFromName(dominant.fontName),
      bold: style.bold,
      italic: style.italic,
    };
  });
}

export function ocrLinesToReconstructed(
  lines: OcrTextLine[],
  pageWidthPt: number,
  pageHeightPt: number,
): ReconstructedTextLine[] {
  return lines
    .filter((line) => line.text.trim())
    .map((line) => ({
      text: line.text,
      xPt: (line.xPct / 100) * pageWidthPt,
      yPt: (line.yPct / 100) * pageHeightPt,
      widthPt: (line.widthPct / 100) * pageWidthPt,
      heightPt: (line.heightPct / 100) * pageHeightPt,
      fontSizePt: line.fontSizePt ?? Math.max(8, (line.heightPct / 100) * pageHeightPt * 0.8),
      fontFamily: "Arial",
      bold: false,
      italic: false,
    }));
}
