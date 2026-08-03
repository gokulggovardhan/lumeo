import "server-only";

import type { ResolvedTool } from "@/lib/tools/resolve";

// The flat, direct-action view of the catalog: one entry per real
// destination route (Merge, Split, Compress, ...), deduplicated so every
// action that opens the same workspace collapses to a single entry. Shared
// between the homepage tile grid (components/pdf/PdfToolLauncher.tsx) and
// the "PDF Tools" nav dropdown (components/PublicPdfChrome.tsx) -- both
// want plain functional names, not the poetic deep-tool names those only
// belong to the full /pdf-tools catalog and its category pages.

export type TileAccent = "sage" | "brass";

const TILE_LABEL: Record<string, string> = {
  split: "Split & organize",
};

const TILE_DESCRIPTION: Record<string, string> = {
  merge: "Combine multiple PDFs into one.",
  split: "Split, reorder, rotate or remove pages.",
  compress: "Shrink file size without losing quality.",
  "jpg-to-pdf": "Turn photos and scans into a PDF.",
  "pdf-to-jpg": "Export pages as sharp images.",
  sign: "Add your signature and initials.",
  "word-to-pdf": "Convert Word documents to PDF.",
  "pdf-to-word": "Convert PDF pages into an editable Word file.",
  reorder: "Reorder, rotate, duplicate, or remove pages in one document.",
  "extract-text": "Pull selectable text out of a PDF and read, search, or export it.",
  "html-to-pdf": "Turn HTML and CSS into a downloadable PDF.",
  watermark: "Stamp text or a logo across every page.",
  "page-numbers": "Add page numbers in the style and position you choose.",
  "header-footer": "Add a running header or footer across every page.",
  crop: "Crop pages to a custom rectangle.",
};

// Sage for document-structure work, brass for the two actions that produce
// a signed or converted "official" output -- the palette's only two real
// accent hues, used with intent rather than one color per tile.
const TOOL_ACCENT: Record<ResolvedTool["key"], TileAccent> = {
  compose: "sage",
  distill: "sage",
  capture: "sage",
  render: "sage",
  inscribe: "sage",
  seal: "brass",
  secure: "brass",
  convert: "brass",
  recognize: "sage",
};

export type Tile = {
  slug: string;
  route: string;
  label: string;
  description: string;
  glyph: ResolvedTool["key"];
  accent: TileAccent;
};

export function buildTiles(tools: ResolvedTool[]): Tile[] {
  const seenRoutes = new Set<string>();
  const tiles: Tile[] = [];

  for (const tool of tools) {
    if (tool.availability !== "available") continue;

    for (const action of tool.actions) {
      if (!action.live || !action.route) continue;
      if (seenRoutes.has(action.route)) continue;
      seenRoutes.add(action.route);

      tiles.push({
        slug: action.slug,
        route: action.route,
        label: TILE_LABEL[action.slug] ?? action.label,
        description: TILE_DESCRIPTION[action.slug] ?? tool.tag,
        glyph: tool.key,
        accent: TOOL_ACCENT[tool.key],
      });
    }
  }

  return tiles.sort((a, b) => a.label.localeCompare(b.label));
}
