// components/pdf/PdfToolLauncher.tsx
//
// The homepage IS the catalog: one flat grid of the actual actions people
// come here to do -- Merge, Split, Compress, Sign, Convert -- each a single
// tap from landing straight into the workspace. No submenu, no deep-tool
// grouping page to click through first. Deep-tool groupings (Compose,
// Distill, ...) still exist as the data model and drive /pdf-tools, but the
// homepage surfaces their live actions directly, deduplicated by
// destination route so six related actions that all open the same
// workspace (e.g. every Split family action) show once, not six times.

import Link from "next/link";
import { ToolGlyph } from "@/components/pdf/ToolGlyph";
import { getPublicPdfCatalog } from "@/lib/public-catalog/data";
import { resolveLumeoTools, type ResolvedTool } from "@/lib/tools/resolve";
import { ScrollReveal } from "@/components/ui/ScrollReveal";

type TileAccent = "sage" | "brass";

// Copy tuned per destination, not reused from the deep-tool tag -- a tile
// gets one plain sentence about the actual action, not the category pitch.
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

type Tile = {
  slug: string;
  route: string;
  label: string;
  description: string;
  glyph: ResolvedTool["key"];
  accent: TileAccent;
};

function buildTiles(tools: ResolvedTool[]): Tile[] {
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

  return tiles;
}

function ToolTile({ tile, index }: { tile: Tile; index: number }) {
  return (
    <li className="min-w-0">
      <ScrollReveal index={index} className="h-full">
        <Link
          href={tile.route}
          data-accent={tile.accent === "brass" ? "brass" : undefined}
          aria-label={tile.label}
          className="lumeo-tile group backdrop-blur-[18px]"
        >
          <div className="lumeo-tile-icon">
            <ToolGlyph name={tile.glyph} className="h-[22px] w-[22px]" />
          </div>
          <div className="min-w-0">
            <h3 className="font-serif font-semibold text-[1.05rem] leading-tight text-[var(--text-primary)]">
              {tile.label}
            </h3>
            <p className="mt-1.5 text-[13px] leading-[1.45] text-[var(--text-secondary)]">{tile.description}</p>
          </div>
        </Link>
      </ScrollReveal>
    </li>
  );
}

function ComingSoonLine({ tools }: { tools: ResolvedTool[] }) {
  if (tools.length === 0) return null;

  return (
    <ScrollReveal index={2}>
      <p className="mt-10 text-center text-[13px] text-[var(--text-muted)]">
        <span className="text-[var(--atelier-brass-300)]">More on the way — </span>
        {tools.map((tool, i) => (
          <span key={tool.key}>
            {tool.name}
            {i < tools.length - 1 ? ", " : ""}
          </span>
        ))}
      </p>
    </ScrollReveal>
  );
}

export async function PdfToolLauncher({ showHeading = true }: { showHeading?: boolean }) {
  const catalog = await getPublicPdfCatalog();
  const resolved = resolveLumeoTools(catalog.tools);
  const tiles = buildTiles(resolved);
  const comingSoon = resolved.filter((tool) => tool.availability === "soon");

  return (
    <section aria-label="PDF tools">
      {showHeading ? (
        <header className="mb-7 text-center">
          <p className="aura-text-label text-[var(--lumeo-gold-300)]">Lumeo PDF Workspace</p>
          <h1 className="mt-3 font-serif text-[length:var(--text-heading-xl)] leading-[var(--leading-heading)] text-[color:var(--lumeo-paper-50)]">
            Choose a tool. Get it done.
          </h1>
        </header>
      ) : null}

      <nav aria-label="Available PDF tools">
        <ul className="grid grid-cols-2 gap-3.5 sm:gap-4 md:grid-cols-4">
          {tiles.map((tile, index) => (
            <ToolTile key={tile.route} tile={tile} index={index} />
          ))}
        </ul>
      </nav>

      <ComingSoonLine tools={comingSoon} />
    </section>
  );
}
