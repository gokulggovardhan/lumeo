// Aura OS v2 Command Palette -- canonical search index.
//
// Deliberately does NOT redefine the tool list. It takes the same Tile[]
// that already powers the "PDF Tools" nav dropdown (lib/tools/tiles.ts's
// buildTiles(), computed once server-side in PublicNav) and layers two
// things on top: a small set of extra search aliases (so "combine" finds
// Merge, "shrink" finds Compress, etc -- words that don't appear in the
// tile's own label/description) and a short static list of non-tool pages
// (Guides, Privacy, About, Contact). This is the one place both result
// types are merged -- nothing else in the app should build its own
// parallel copy of this list.
import type { Tile } from "@/lib/tools/tiles";

export type CommandPaletteItem = {
  id: string;
  title: string;
  description?: string;
  category: "Tool" | "Page";
  route: string;
  glyph?: Tile["glyph"];
  keywords: string[];
};

// Extra synonyms per tool slug -- only words that a real user might type
// that don't already appear in the tile's own label/description text.
// Not exhaustive; extend here as real search gaps are found, not guessed.
const TOOL_ALIASES: Record<string, string[]> = {
  merge: ["combine", "join", "concatenate"],
  compress: ["reduce", "shrink", "smaller", "optimize"],
  "jpg-to-pdf": ["jpeg", "image", "photo", "picture"],
  "pdf-to-jpg": ["jpeg", "image", "export", "screenshot"],
  split: ["separate", "divide", "extract pages"],
  reorder: ["organize", "rotate", "duplicate", "remove pages"],
  sign: ["signature", "initials"],
  watermark: ["stamp", "brand", "overlay"],
  crop: ["trim", "resize", "margins"],
  edit: ["annotate", "draw", "text", "whiteout"],
  "extract-text": ["ocr", "copy text", "read"],
  "word-to-pdf": ["doc", "docx", "convert"],
  "pdf-to-word": ["doc", "docx", "editable"],
  "html-to-pdf": ["webpage", "convert", "css"],
};

// Non-tool destinations worth surfacing. Admin is deliberately excluded --
// this session has no reliable client-side way to know whether the
// current visitor is an authenticated admin without adding new auth-state
// plumbing, which is out of this PR's scope ("Do NOT change: Authentication").
// Revisit once an existing, already-computed auth signal is available to
// pass in as a prop, the same way tiles already is.
const STATIC_PAGES: CommandPaletteItem[] = [
  { id: "page-pdf-tools", title: "All PDF Tools", category: "Page", route: "/pdf-tools", keywords: ["catalog", "directory", "browse"] },
  { id: "page-guides", title: "Guides", category: "Page", route: "/guides", keywords: ["help", "how to", "docs", "documentation"] },
  { id: "page-about", title: "About", category: "Page", route: "/about", keywords: ["company", "team"] },
  { id: "page-contact", title: "Contact", category: "Page", route: "/contact", keywords: ["support", "email", "feedback"] },
  { id: "page-privacy", title: "Privacy", category: "Page", route: "/privacy", keywords: ["data", "gdpr"] },
  { id: "page-security", title: "Security", category: "Page", route: "/security", keywords: ["safety"] },
  { id: "page-accessibility", title: "Accessibility", category: "Page", route: "/accessibility", keywords: ["a11y", "wcag"] },
  { id: "page-terms", title: "Terms", category: "Page", route: "/terms", keywords: ["legal", "tos"] },
];

export function buildCommandPaletteIndex(tiles: Tile[]): CommandPaletteItem[] {
  const toolItems: CommandPaletteItem[] = tiles.map((tile) => ({
    id: `tool-${tile.slug}`,
    title: tile.label,
    description: tile.description,
    category: "Tool",
    route: tile.route,
    glyph: tile.glyph,
    keywords: TOOL_ALIASES[tile.slug] ?? [],
  }));

  return [...toolItems, ...STATIC_PAGES];
}

function normalize(value: string) {
  return value.toLowerCase().trim();
}

// Plain substring matching against title, description, and keywords/aliases
// -- deliberately not a fuzzy-match library (no new dependency, per this
// PR's "do not add unnecessary dependencies" rule, and substring matching
// against a ~20-item list is instant with no perceptible difference from
// fuzzy matching at this scale).
export function searchCommandPaletteIndex(items: CommandPaletteItem[], query: string): CommandPaletteItem[] {
  const trimmed = normalize(query);
  if (!trimmed) return items;

  return items.filter((item) => {
    if (normalize(item.title).includes(trimmed)) return true;
    if (item.description && normalize(item.description).includes(trimmed)) return true;
    return item.keywords.some((keyword) => normalize(keyword).includes(trimmed));
  });
}
