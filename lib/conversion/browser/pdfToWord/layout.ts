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

export type PdfTextStyle = {
  fontFamily?: string;
  fontName?: string;
  bold?: boolean;
  italic?: boolean;
};

function firstFamilyName(value: string): string {
  return value
    .split(",")[0]
    ?.trim()
    .replace(/^['"]|['"]$/g, "") ?? "";
}

function normalizeWordFontFamily(value: string): string {
  const subsetless = value.replace(/^[A-Z]{6}\+/, "");
  const raw = firstFamilyName(subsetless)
    .replace(/^\./, "")
    .replace(/[-_](Bold|Italic|Oblique|Regular|Medium|Semibold|Demi).*$/i, "")
    .replace(/(PSMT|MT)$/i, "")
    .trim();

  const lower = raw.toLowerCase();
  if (
    !raw ||
    /^g_d\d+_f\d+$/i.test(raw) ||
    /sans-serif|system-ui|sfui|helvetica|arial/.test(lower)
  ) {
    return "Arial";
  }
  if (/serif|times/.test(lower)) return "Times New Roman";
  if (/monospace|courier/.test(lower)) return "Courier New";
  return raw;
}

function fontFamilyFromName(
  fontName: string,
  style: PdfTextStyle | undefined,
): string {
  const preferred = style?.fontFamily || style?.fontName || fontName;
  return normalizeWordFontFamily(preferred);
}

function styleFromFontName(
  fontName: string,
  style: PdfTextStyle | undefined,
) {
  const descriptor = `${fontName} ${style?.fontFamily ?? ""} ${style?.fontName ?? ""}`;
  return {
    bold: style?.bold ?? /bold|black|semibold|demi/i.test(descriptor),
    italic: style?.italic ?? /italic|oblique/i.test(descriptor),
  };
}

/**
 * Reconstruct independently positioned editable PDF text runs.
 *
 * A PDF baseline is not a Word paragraph. Invoices, statements, forms and
 * tables routinely put unrelated cells on the same Y coordinate. Joining
 * those cells into one string causes Word to reflow them according to the
 * replacement font's metrics, which is exactly the failure mode that used to
 * collapse invoice columns and AMC tables.
 */
export function reconstructTextLines(
  items: Array<PdfTextItem | PdfMarkedContent>,
  viewportTransform: number[],
  pageWidthPt: number,
  pageHeightPt: number,
  styles: Record<string, PdfTextStyle> = {},
): ReconstructedTextLine[] {
  const runs = textRunsFromContent(
    items,
    viewportTransform,
    pageWidthPt,
    pageHeightPt,
  );

  return runs
    .filter((run) => !run.rotated)
    .map((run: DetectedTextRun) => {
      const style = styles[run.fontName];
      const textStyle = styleFromFontName(run.fontName, style);
      const widthPt = (run.widthPct / 100) * pageWidthPt;
      const heightPt = (run.heightPct / 100) * pageHeightPt;

      return {
        text: run.str,
        xPt: (run.xPct / 100) * pageWidthPt,
        yPt: (run.yPct / 100) * pageHeightPt,
        widthPt: Math.max(widthPt, 1),
        heightPt: Math.max(heightPt, run.fontSizePt * 1.15),
        fontSizePt: run.fontSizePt,
        fontFamily: fontFamilyFromName(run.fontName, style),
        bold: textStyle.bold,
        italic: textStyle.italic,
        sourceKind: "pdfjs" as const,
      };
    })
    .sort((a, b) => {
      const yDiff = a.yPt - b.yPt;
      return Math.abs(yDiff) > 0.25 ? yDiff : a.xPt - b.xPt;
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
      fontSizePt:
        line.fontSizePt ??
        Math.max(8, (line.heightPct / 100) * pageHeightPt * 0.8),
      fontFamily: "Arial",
      bold: false,
      italic: false,
      sourceKind: "ocr" as const,
    }));
}
