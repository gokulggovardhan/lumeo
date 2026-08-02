// lib/pdf/core/text.ts
//
// Shared color parsing and standard-font embedding/selection -- used by any
// tool that draws styled text on a PDF page (Watermark today; Page Numbers,
// Header & Footer next). Only imports "pdf-lib" (a package, not a relative
// project file), so it has no test-runner/bundler extension-resolution
// constraint of its own.

import { StandardFonts, type PDFDocument, type PDFFont } from "pdf-lib";

export function hexToRgb01(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.replace("#", "");
  const value = Number.parseInt(normalized.length === 3
    ? normalized.split("").map((c) => c + c).join("")
    : normalized, 16);
  return {
    r: ((value >> 16) & 255) / 255,
    g: ((value >> 8) & 255) / 255,
    b: (value & 255) / 255,
  };
}

export async function embedTextFonts(doc: PDFDocument) {
  const [regular, bold, italic, boldItalic] = await Promise.all([
    doc.embedFont(StandardFonts.Helvetica),
    doc.embedFont(StandardFonts.HelveticaBold),
    doc.embedFont(StandardFonts.HelveticaOblique),
    doc.embedFont(StandardFonts.HelveticaBoldOblique),
  ]);
  return { regular, bold, italic, boldItalic };
}

export function pickFont(fonts: Awaited<ReturnType<typeof embedTextFonts>>, bold: boolean, italic: boolean): PDFFont {
  if (bold && italic) return fonts.boldItalic;
  if (bold) return fonts.bold;
  if (italic) return fonts.italic;
  return fonts.regular;
}
