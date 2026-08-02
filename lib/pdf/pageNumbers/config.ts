// lib/pdf/pageNumbers/config.ts
//
// Page-Numbers-specific config, defaults, and text-format generation. All
// positioning/rotation/page-range math is imported from lib/pdf/core/ --
// see lib/pdf/watermark/config.ts for the sibling pattern this mirrors.
// Self-contained beyond core/ (no other project-file imports) so this
// module can run directly under `node --experimental-strip-types` for
// tests.
//
// Coordinates are percent of the visual (rotation-aware) page, 0-100,
// top-left origin -- same convention as Watermark and Edit PDF.

import type { Anchor } from "../core/anchors.ts";
import type { PlacementCorner } from "../core/placement.ts";
import type { PageRangeSelector } from "../core/pageRanges.ts";

export type { Anchor } from "../core/anchors.ts";
export type { PlacementCorner } from "../core/placement.ts";
export type { PageRangeSelector } from "../core/pageRanges.ts";

export type NumberFormat = "number" | "page-x" | "x-of-n" | "x-slash-n";
export type NumeralStyle = "arabic" | "roman-lower" | "roman-upper" | "alpha-lower" | "alpha-upper";

export type PageNumbersSinglePlacement =
  | { mode: "corner"; corner: PlacementCorner }
  | { mode: "manual"; xPct: number; yPct: number; allowOverflow?: boolean };

export type PageNumbersConfig = {
  numberFormat: NumberFormat;
  numeralStyle: NumeralStyle;
  prefix: string;
  suffix: string;
  // Number assigned to the first NUMBERED page (after skipFirstPage is
  // applied). Does not change which pages get a number, only what the
  // sequence counts up from.
  startNumber: number;
  // When true, the first page in the resolved page range gets no number
  // drawn, but still occupies position 1 in the sequence -- so the next
  // numbered page shows startNumber + 1, not startNumber. This matches the
  // conventional "skip first page" behavior in Word/Adobe: the cover page
  // is excluded from display, not from counting.
  skipFirstPage: boolean;
  pageRange: PageRangeSelector;
  placement: PageNumbersSinglePlacement;
  // UI-only projection for manual placement's numeric fields/drag handle,
  // matching Watermark's manualAnchor -- ignored by export.ts entirely.
  manualAnchor: Anchor;
  marginPct: number;
  fontSizePt: number;
  color: string;
  bold: boolean;
  italic: boolean;
  opacity: number;
};

export const DEFAULT_FONT_SIZE_PT = 11;
export const DEFAULT_COLOR = "#1a1a1a";
export const DEFAULT_MARGIN_PCT = 4;
export const DEFAULT_OPACITY = 1;
export const DEFAULT_START_NUMBER = 1;

export function createDefaultPageNumbersConfig(): PageNumbersConfig {
  return {
    numberFormat: "page-x",
    numeralStyle: "arabic",
    prefix: "",
    suffix: "",
    startNumber: DEFAULT_START_NUMBER,
    skipFirstPage: false,
    pageRange: { mode: "all" },
    placement: { mode: "corner", corner: "bottom-center" },
    manualAnchor: "bottom-center",
    marginPct: DEFAULT_MARGIN_PCT,
    fontSizePt: DEFAULT_FONT_SIZE_PT,
    color: DEFAULT_COLOR,
    bold: false,
    italic: false,
    opacity: DEFAULT_OPACITY,
  };
}

// --- Numeral formatting --------------------------------------------------

const ROMAN_VALUES: Array<[number, string]> = [
  [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"],
  [100, "C"], [90, "XC"], [50, "L"], [40, "XL"],
  [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
];

// Roman numerals have no zero/negative representation and become
// impractically long past a few thousand -- falls back to plain arabic
// digits outside [1, 3999] rather than producing a pathological string.
export function toRoman(value: number): string {
  if (!Number.isInteger(value) || value < 1 || value > 3999) return String(value);

  let remaining = value;
  let result = "";
  for (const [amount, numeral] of ROMAN_VALUES) {
    while (remaining >= amount) {
      result += numeral;
      remaining -= amount;
    }
  }
  return result;
}

// Spreadsheet-column-style alphabetic numbering: 1=a, 2=b, ..., 26=z,
// 27=aa, 28=ab, ... Falls back to plain arabic digits for non-positive
// input (no representation below 1).
export function toAlpha(value: number): string {
  if (!Number.isInteger(value) || value < 1) return String(value);

  let remaining = value;
  let result = "";
  while (remaining > 0) {
    const remainder = (remaining - 1) % 26;
    result = String.fromCharCode(97 + remainder) + result;
    remaining = Math.floor((remaining - 1) / 26);
  }
  return result;
}

export function formatNumeral(value: number, style: NumeralStyle): string {
  switch (style) {
    case "roman-lower":
      return toRoman(value).toLowerCase();
    case "roman-upper":
      return toRoman(value);
    case "alpha-lower":
      return toAlpha(value);
    case "alpha-upper":
      return toAlpha(value).toUpperCase();
    default:
      return String(value);
  }
}

// Renders the full page-number label for one page: applies the numeral
// style to the displayed number (and to the total, for "x-of-n"/"x-slash-n"
// formats), wraps it in the chosen format template, then adds prefix/suffix.
export function formatPageLabel(
  displayNumber: number,
  totalNumberedPages: number,
  config: Pick<PageNumbersConfig, "numberFormat" | "numeralStyle" | "prefix" | "suffix">,
): string {
  const n = formatNumeral(displayNumber, config.numeralStyle);
  const total = formatNumeral(totalNumberedPages, config.numeralStyle);

  let core: string;
  switch (config.numberFormat) {
    case "page-x":
      core = `Page ${n}`;
      break;
    case "x-of-n":
      core = `Page ${n} of ${total}`;
      break;
    case "x-slash-n":
      core = `${n} / ${total}`;
      break;
    default:
      core = n;
  }

  return `${config.prefix}${core}${config.suffix}`;
}
