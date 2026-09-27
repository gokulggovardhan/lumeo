// components/pdf/PdfToolLauncher.tsx
//
// Homepage discovery is intentionally curated from the same resolved catalog
// that powers /pdf-tools and command search. The homepage shows a dense,
// application-like set of high-value actions; the complete directory remains
// available one step away.

import Link from "next/link";
import { DiscoveryToolCard } from "@/components/tools/DiscoveryToolCard";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { getPublicPdfCatalog } from "@/lib/public-catalog/data";
import { resolveLumeoTools } from "@/lib/tools/resolve";
import { buildDiscoveryTiles, type Tile } from "@/lib/tools/tiles";

const PRIMARY_TOOL_SLUGS = [
  "edit",
  "reorder",
  "merge",
  "split",
  "compress",
  "sign",
] as const;

const SECONDARY_TOOL_SLUGS = [
  "word-to-pdf",
  "pdf-to-word",
  "jpg-to-pdf",
  "pdf-to-jpg",
] as const;

const HOME_TOOL_SLUGS = [
  ...PRIMARY_TOOL_SLUGS,
  ...SECONDARY_TOOL_SLUGS,
] as const;

const CURATED_TOOL_SLUGS = new Set<string>(HOME_TOOL_SLUGS);

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
  const essentials = selectTiles(tiles, HOME_TOOL_SLUGS);

  // An Admin-controlled coming-soon state is a publishing decision. Keep any
  // additionally published preview visible without turning it into a fake
  // action: DiscoveryToolCard renders unavailable tools as <article>.
  const additionalComingSoon = tiles.filter(
    (tile) =>
      tile.availability === "coming_soon" &&
      !CURATED_TOOL_SLUGS.has(tile.slug),
  );

  return (
    <section aria-labelledby="pdf-tools-heading">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <p className="aura-text-label text-[var(--atelier-sage-300)]">
            PDF tools
          </p>
          <h2
            id="pdf-tools-heading"
            className="mt-1.5 font-serif text-[1.65rem] font-semibold tracking-[-0.015em] text-[var(--text-primary)] sm:text-[1.85rem]"
          >
            Start with what you need
          </h2>
          <p className="mt-1.5 text-sm leading-6 text-[var(--text-secondary)]">
            Open a focused tool now, then keep compatible work moving inside
            the Lumeo PDF Workspace.
          </p>
        </div>
        <Link
          href="/pdf-tools"
          className="lumeo-focus-ring inline-flex min-h-11 shrink-0 items-center gap-2 self-start rounded-[var(--radius-md)] px-1 text-sm font-bold text-[var(--atelier-sage-300)] transition hover:text-[var(--text-primary)] sm:self-auto"
        >
          View all PDF tools
          <span aria-hidden="true">→</span>
        </Link>
      </div>

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        {essentials.map((tile, index) => (
          <li key={tile.route} className="min-w-0">
            <ScrollReveal index={index} className="h-full">
              <DiscoveryToolCard tool={tile} context="home" />
            </ScrollReveal>
          </li>
        ))}
      </ul>

      {additionalComingSoon.length > 0 ? (
        <section aria-labelledby="coming-soon-tools-heading" className="mt-8">
          <div className="mb-4 flex items-center gap-3">
            <h3
              id="coming-soon-tools-heading"
              className="font-serif text-base font-semibold text-[var(--text-secondary)]"
            >
              Coming soon
            </h3>
            <span aria-hidden="true" className="h-px flex-1 bg-[var(--border-hairline)]" />
          </div>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
            {additionalComingSoon.map((tile, index) => (
              <li key={tile.route} className="min-w-0">
                <ScrollReveal index={index} className="h-full">
                  <DiscoveryToolCard tool={tile} context="home" />
                </ScrollReveal>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  );
}
