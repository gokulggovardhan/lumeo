// lib/pdf/headerFooter/config.ts
//
// Header & Footer-specific config, defaults, and placeholder substitution.
// All positioning/rotation/page-range math is imported from lib/pdf/core/ --
// see lib/pdf/pageNumbers/config.ts for the sibling pattern this mirrors.
// Self-contained beyond core/ (no other project-file imports) so this
// module can run directly under `node --experimental-strip-types` for
// tests.
//
// Header/footer alignment (left/center/right) deliberately reuses
// PlacementCorner's existing top-*/bottom-* values directly -- "header,
// left-aligned" IS "top-left" placement, "footer, centered" IS
// "bottom-center" placement. No new positioning concept, no manual
// drag-to-position (not part of the approved feature list, mirroring
// Watermark/Page Numbers' own documented scope decisions for
// out-of-scope items) -- alignmentToCorner below is the only mapping
// needed.

import type { PlacementCorner } from "../core/placement.ts";

export type { PlacementCorner } from "../core/placement.ts";
export type { PageRangeSelector } from "../core/pageRanges.ts";
import type { PageRangeSelector } from "../core/pageRanges.ts";

export type TextZoneAlignment = "left" | "center" | "right";

export type TextZoneConfig = {
  enabled: boolean;
  // May contain {page}, {pages}, {date}, {time}, {filename} placeholders --
  // see resolvePlaceholders below. Prefix/suffix are plain text wrapped
  // around the RESOLVED template, so they're unaffected by which
  // placeholders (if any) the template uses.
  template: string;
  prefix: string;
  suffix: string;
  alignment: TextZoneAlignment;
};

export type HeaderFooterConfig = {
  header: TextZoneConfig;
  footer: TextZoneConfig;
  // When true, the lowest-index selected page uses firstPageHeader/
  // firstPageFooter instead of header/footer -- a distinct override, not
  // the same thing as Page Numbers' skipFirstPage (which omits drawing
  // entirely; this still draws, just with different content).
  firstPageDifferent: boolean;
  firstPageHeader: TextZoneConfig;
  firstPageFooter: TextZoneConfig;
  pageRange: PageRangeSelector;
  fontSizePt: number;
  color: string;
  bold: boolean;
  italic: boolean;
  opacity: number;
  marginPct: number;
};

export function alignmentToCorner(zone: "header" | "footer", alignment: TextZoneAlignment): PlacementCorner {
  const row = zone === "header" ? "top" : "bottom";
  const column = alignment === "left" ? "left" : alignment === "right" ? "right" : "center";
  return `${row}-${column}` as PlacementCorner;
}

export const DEFAULT_FONT_SIZE_PT = 10;
export const DEFAULT_COLOR = "#1a1a1a";
export const DEFAULT_MARGIN_PCT = 4;
export const DEFAULT_OPACITY = 1;

function createDefaultZone(alignment: TextZoneAlignment, template = ""): TextZoneConfig {
  return { enabled: false, template, prefix: "", suffix: "", alignment };
}

export function createDefaultHeaderFooterConfig(): HeaderFooterConfig {
  return {
    header: createDefaultZone("center"),
    footer: { ...createDefaultZone("center", "{page}"), enabled: true },
    firstPageDifferent: false,
    firstPageHeader: createDefaultZone("center"),
    firstPageFooter: createDefaultZone("center", "{page}"),
    pageRange: { mode: "all" },
    fontSizePt: DEFAULT_FONT_SIZE_PT,
    color: DEFAULT_COLOR,
    bold: false,
    italic: false,
    opacity: DEFAULT_OPACITY,
    marginPct: DEFAULT_MARGIN_PCT,
  };
}

export type PlaceholderContext = {
  pageNumber: number; // 1-based, position within the resolved page range
  totalPages: number; // count of pages in the resolved page range
  filename: string;
  now?: Date; // injectable for tests; defaults to `new Date()`
};

const PLACEHOLDER_PATTERN = /\{(page|pages|date|time|filename)\}/g;

// Replaces each recognized {placeholder} token with its resolved value.
// Unrecognized tokens (typos, or literal braces the user typed on purpose)
// are left untouched rather than stripped or erroring -- a template is
// free text first, a placeholder syntax second.
export function resolvePlaceholders(template: string, context: PlaceholderContext): string {
  const now = context.now ?? new Date();
  return template.replace(PLACEHOLDER_PATTERN, (match, token: string) => {
    switch (token) {
      case "page":
        return String(context.pageNumber);
      case "pages":
        return String(context.totalPages);
      case "date":
        return now.toLocaleDateString();
      case "time":
        return now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      case "filename":
        return context.filename;
      default:
        return match;
    }
  });
}

// Renders one zone's final drawn text: resolves placeholders in the
// template, then wraps with prefix/suffix. Returns "" (nothing to draw)
// for a disabled zone or an empty resolved+wrapped result.
export function renderZoneText(zone: TextZoneConfig, context: PlaceholderContext): string {
  if (!zone.enabled) return "";
  const resolved = resolvePlaceholders(zone.template, context);
  return `${zone.prefix}${resolved}${zone.suffix}`;
}
