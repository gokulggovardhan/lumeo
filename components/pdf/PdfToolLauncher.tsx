// components/pdf/PdfToolLauncher.tsx
//
// Homepage discovery is intentionally curated. The complete, searchable tool
// directory lives at /pdf-tools; the homepage gives the strongest general-use
// workflows the most visual weight and keeps secondary actions easy to find.

import Link from "next/link";
import { ToolGlyph } from "@/components/pdf/ToolGlyph";
import { getPublicPdfCatalog } from "@/lib/public-catalog/data";
import { resolveLumeoTools } from "@/lib/tools/resolve";
import { buildDiscoveryTiles, type Tile } from "@/lib/tools/tiles";
import { ScrollReveal } from "@/components/ui/ScrollReveal";

const PRIMARY_TOOL_SLUGS = [
  "merge",
  "compress",
  "edit",
  "pdf-to-word",
  "word-to-pdf",
  "sign",
] as const;

const SECONDARY_TOOL_SLUGS = [
  "split",
  "reorder",
  "jpg-to-pdf",
  "pdf-to-jpg",
] as const;

const CURATED_TOOL_SLUGS = new Set<string>([
  ...PRIMARY_TOOL_SLUGS,
  ...SECONDARY_TOOL_SLUGS,
]);

function statusLabel(tile: Tile) {
  if (tile.availability === "beta") return "Beta";
  if (tile.availability === "coming_soon") return "Coming soon";
  if (tile.availability === "maintenance") return "Maintenance";
  return null;
}

function CuratedToolCard({
  tile,
  index,
  featured = false,
}: {
  tile: Tile;
  index: number;
  featured?: boolean;
}) {
  const available =
    tile.availability === "active" || tile.availability === "beta";
  const status = statusLabel(tile);
  const contents = (
    <>
      <div className="flex items-start justify-between gap-4">
        <span
          className={`grid shrink-0 place-items-center rounded-[14px] border border-[var(--border-hairline)] bg-[var(--surface-base)] text-[var(--atelier-sage-300)] shadow-[inset_0_1px_0_rgba(var(--paper-rgb),0.05)] ${
            featured ? "h-12 w-12" : "h-11 w-11"
          }`}
        >
          <ToolGlyph
            name={tile.glyph}
            className={featured ? "h-[22px] w-[22px]" : "h-5 w-5"}
          />
        </span>
        {status ? (
          <span className="rounded-full border border-[var(--border-subtle)] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--text-premium)]">
            {status}
          </span>
        ) : null}
      </div>
      <div className="mt-auto">
        <h3
          className={`font-serif font-semibold leading-tight text-[var(--text-primary)] ${
            featured ? "text-[1.22rem]" : "text-[1.05rem]"
          }`}
        >
          {tile.label}
        </h3>
        <p className="mt-2 text-[13px] leading-5 text-[var(--text-secondary)]">
          {tile.description}
        </p>
      </div>
    </>
  );

  const classes = `group flex h-full flex-col rounded-[18px] border border-[var(--border-hairline)] bg-[var(--surface-raised)] ${
    featured ? "min-h-[12rem] p-5 sm:min-h-[13rem] sm:p-6" : "min-h-[10.5rem] p-5"
  } shadow-[var(--shadow-sm)] transition duration-200 ease-out hover:-translate-y-0.5 hover:border-[var(--border-subtle)] hover:bg-[var(--surface-elevated)] hover:shadow-[var(--shadow-md)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--champagne-rgb),0.2)] motion-reduce:transform-none`;

  return (
    <li className="min-w-0">
      <ScrollReveal index={index} className="h-full">
        {available ? (
          <Link
            href={tile.route}
            className={classes}
            aria-label={`Open ${tile.label}${status ? `, ${status}` : ""}`}
          >
            {contents}
          </Link>
        ) : (
          <article
            className={`${classes} cursor-default opacity-75 hover:translate-y-0 hover:shadow-[var(--shadow-sm)]`}
            aria-label={`${tile.label}, ${status ?? "Unavailable"}`}
          >
            {contents}
          </article>
        )}
      </ScrollReveal>
    </li>
  );
}

function selectTiles(tiles: Tile[], slugs: readonly string[]) {
  const bySlug = new Map(tiles.map((tile) => [tile.slug, tile]));
  return slugs
    .map((slug) => bySlug.get(slug))
    .filter((tile): tile is Tile => Boolean(tile));
}

export async function PdfToolLauncher() {
  const catalog = await getPublicPdfCatalog();
  const resolved = resolveLumeoTools(catalog.tools);
  const tiles = buildDiscoveryTiles(resolved);
  const primary = selectTiles(tiles, PRIMARY_TOOL_SLUGS);
  const secondary = selectTiles(tiles, SECONDARY_TOOL_SLUGS);
  // The main homepage remains intentionally curated, but an Admin-controlled
  // coming-soon state is also a publishing decision: every enabled tool in
  // that state must be visible to visitors even when it is not one of the
  // ten curated launch tiles. These cards remain non-actionable because
  // CuratedToolCard only links active/beta tools.
  const additionalComingSoon = tiles.filter(
    (tile) =>
      tile.availability === "coming_soon" &&
      !CURATED_TOOL_SLUGS.has(tile.slug),
  );

  return (
    <div>
      <section aria-labelledby="popular-tools-heading">
        <div className="mb-6 max-w-2xl">
          <p className="aura-text-label text-[var(--atelier-sage-300)]">
            Popular tools
          </p>
          <h2
            id="popular-tools-heading"
            className="mt-2 font-serif text-[1.8rem] font-semibold tracking-[-0.015em] text-[var(--text-primary)] sm:text-[2rem]"
          >
            Start with the essentials
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)] sm:text-base">
            Six focused workspaces for the most common PDF and document tasks.
          </p>
        </div>
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {primary.map((tile, index) => (
            <CuratedToolCard
              key={tile.route}
              tile={tile}
              index={index}
              featured
            />
          ))}
        </ul>
      </section>

      <section aria-labelledby="more-tools-heading" className="mt-14 sm:mt-16">
        <div className="mb-5 max-w-2xl">
          <p className="aura-text-label text-[var(--text-muted)]">More tools</p>
          <h2
            id="more-tools-heading"
            className="mt-2 font-serif text-[1.45rem] font-semibold text-[var(--text-primary)] sm:text-[1.6rem]"
          >
            Useful next steps, without the clutter
          </h2>
        </div>
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {secondary.map((tile, index) => (
            <CuratedToolCard key={tile.route} tile={tile} index={index} />
          ))}
        </ul>
      </section>

      {additionalComingSoon.length > 0 ? (
        <section aria-labelledby="coming-soon-tools-heading" className="mt-14 sm:mt-16">
          <div className="mb-5 max-w-2xl">
            <p className="aura-text-label text-[var(--text-muted)]">Coming soon</p>
            <h2
              id="coming-soon-tools-heading"
              className="mt-2 font-serif text-[1.45rem] font-semibold text-[var(--text-primary)] sm:text-[1.6rem]"
            >
              More tools on the way
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
              These tools are published for preview but stay unavailable until they are ready.
            </p>
          </div>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {additionalComingSoon.map((tile, index) => (
              <CuratedToolCard key={tile.route} tile={tile} index={index} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
