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
import { buildDiscoveryTiles, type Tile } from "@/lib/tools/tiles";
import { ScrollReveal } from "@/components/ui/ScrollReveal";

function availabilityLabel(tile: Tile) {
  if (tile.availability === "beta") return "Beta";
  if (tile.availability === "coming_soon") return "Coming soon";
  if (tile.availability === "maintenance") return "Maintenance";
  return null;
}

function ToolTile({ tile, index }: { tile: Tile; index: number }) {
  const available = tile.availability === "active" || tile.availability === "beta";
  const status = availabilityLabel(tile);
  const contents = (
    <>
      <div className="lumeo-tile-icon">
        <ToolGlyph name={tile.glyph} className="h-[22px] w-[22px]" />
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-serif font-semibold text-[1.05rem] leading-tight text-[var(--text-primary)]">
            {tile.label}
          </h3>
          {status ? (
            <span className="rounded-full border border-[var(--border-subtle)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--text-premium)]">
              {status}
            </span>
          ) : null}
        </div>
        <p className="mt-1.5 text-[13px] leading-[1.45] text-[var(--text-secondary)]">{tile.description}</p>
      </div>
    </>
  );

  return (
    <li className="min-w-0">
      <ScrollReveal index={index} className="h-full">
        {available ? (
          <Link
            href={tile.route}
            data-accent={tile.accent === "brass" ? "brass" : undefined}
            aria-label={`${tile.label}${status ? `, ${status}` : ""}`}
            className="lumeo-tile group backdrop-blur-[18px]"
          >
            {contents}
          </Link>
        ) : (
          <article
            aria-label={`${tile.label}, ${status ?? "Unavailable"}`}
            className="lumeo-tile cursor-default opacity-80 backdrop-blur-[18px]"
          >
            {contents}
          </article>
        )}
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
  const tiles = buildDiscoveryTiles(resolved);
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
        <ul className="grid grid-cols-2 gap-3.5 sm:gap-4 md:grid-cols-4 xl:grid-cols-5">
          {tiles.map((tile, index) => (
            <ToolTile key={tile.route} tile={tile} index={index} />
          ))}
        </ul>
      </nav>

      <ComingSoonLine tools={comingSoon} />
    </section>
  );
}
