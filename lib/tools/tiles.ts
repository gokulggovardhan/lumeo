import "server-only";

import {
  DISCOVERY_CATEGORY_LABEL,
  type ToolAction,
  type ToolDiscoveryCategory,
  type ToolProcessing,
} from "@/lib/tools/catalog";
import type { ResolvedTool } from "@/lib/tools/resolve";

export type TileAccent = "sage" | "brass";
export type ToolDiscoveryAvailability =
  | "active"
  | "beta"
  | "maintenance"
  | "coming_soon"
  | "hidden";

const CATEGORY_BY_TOOL: Record<ResolvedTool["key"], ToolDiscoveryCategory> = {
  compose: "organize",
  distill: "optimize",
  capture: "convert",
  render: "convert",
  inscribe: "edit-sign",
  seal: "edit-sign",
  secure: "edit-sign",
  convert: "convert",
  recognize: "convert",
};

const TILE_LABEL: Record<string, string> = {
  merge: "Merge PDF",
  split: "Split PDF",
  compress: "Compress PDF",
  reorder: "Organize PDF",
  watermark: "Watermark PDF",
  "page-numbers": "Page Numbers",
  "header-footer": "Header & Footer",
  crop: "Crop PDF",
};

const TILE_DESCRIPTION: Record<string, string> = {
  "heic-to-jpeg": "Convert iPhone HEIC photos to high-quality JPEG.",
  merge: "Combine multiple PDFs into one document.",
  split: "Extract page ranges or separate a PDF into smaller files.",
  compress: "Reduce PDF file size with clear quality controls.",
  "jpg-to-pdf": "Turn JPG, PNG, or WebP images into one PDF.",
  "pdf-to-jpg": "Export PDF pages as sharp image files.",
  sign: "Add a signature or initials to any PDF page.",
  "word-to-pdf": "Convert Word documents to PDF with server assistance.",
  "pdf-to-word": "Convert PDF pages into an editable Word file.",
  reorder: "Reorder, rotate, duplicate, or remove PDF pages.",
  "extract-text": "Read, search, and export selectable PDF text.",
  "html-to-pdf": "Turn HTML and CSS into a downloadable PDF.",
  edit: "Add text, drawings, shapes, and whiteout boxes.",
  watermark: "Apply a text or image watermark across PDF pages.",
  "page-numbers": "Add page numbers in the style and position you choose.",
  "header-footer": "Add running headers or footers across PDF pages.",
  crop: "Crop PDF pages to a precise custom rectangle.",
};

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

const POPULAR_TOOL_SLUGS = new Set(["merge", "compress", "edit", "sign"]);

export type Tile = {
  slug: string;
  route: string;
  label: string;
  description: string;
  glyph: ResolvedTool["key"];
  accent: TileAccent;
  category: ToolDiscoveryCategory;
  categoryLabel: string;
  brandedCategory: string;
  processing: ToolProcessing;
  availability: ToolDiscoveryAvailability;
  maintenanceMessage: string | null;
  aliases: string[];
  capabilities: string[];
  popular: boolean;
};

function actionAvailability(
  action: ToolAction,
  toolAvailability: ResolvedTool["availability"],
): ToolDiscoveryAvailability {
  if (action.dbStatus === "hidden") return "hidden";
  if (action.dbStatus === "maintenance") return "maintenance";
  if (action.dbStatus === "coming_soon") return "coming_soon";
  if (action.live) return action.dbStatus === "beta" ? "beta" : "active";
  return toolAvailability === "soon" ? "coming_soon" : "maintenance";
}

function buildAllTiles(tools: ResolvedTool[]): Tile[] {
  const byRoute = new Map<string, Tile>();

  for (const tool of tools) {
    const category = CATEGORY_BY_TOOL[tool.key];
    for (const action of tool.actions) {
      if (!action.route) continue;

      const existing = byRoute.get(action.route);
      if (existing) {
        existing.capabilities.push(action.label);
        existing.aliases.push(action.slug, ...(action.searchAliases ?? []));
        continue;
      }

      byRoute.set(action.route, {
        slug: action.slug,
        route: action.route,
        label: TILE_LABEL[action.slug] ?? action.label,
        description: TILE_DESCRIPTION[action.slug] ?? tool.tag,
        glyph: tool.key,
        accent: TOOL_ACCENT[tool.key],
        category,
        categoryLabel: DISCOVERY_CATEGORY_LABEL[category],
        brandedCategory: tool.name,
        processing: action.processing ?? tool.processing,
        availability: actionAvailability(action, tool.availability),
        maintenanceMessage: action.maintenanceMessage ?? null,
        aliases: [action.slug, ...(action.searchAliases ?? [])],
        capabilities: [action.label],
        popular: POPULAR_TOOL_SLUGS.has(action.slug),
      });
    }
  }

  return Array.from(byRoute.values()).map((tile) => ({
    ...tile,
    aliases: Array.from(new Set(tile.aliases)),
    capabilities: Array.from(new Set(tile.capabilities)),
  }));
}

export function buildTiles(tools: ResolvedTool[]): Tile[] {
  return buildAllTiles(tools)
    .filter((tile) => tile.availability === "active" || tile.availability === "beta")
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function buildDiscoveryTiles(tools: ResolvedTool[]): Tile[] {
  return buildAllTiles(tools).filter((tile) => tile.availability !== "hidden");
}
