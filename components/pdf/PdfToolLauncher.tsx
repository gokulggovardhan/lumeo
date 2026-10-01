// components/pdf/PdfToolLauncher.tsx
//
// Homepage discovery is intentionally compact. The complete searchable tool
// directory lives at /pdf-tools; the homepage is a fast launcher, not a second
// directory. Availability still comes from the public catalog so published
// maintenance and coming-soon states stay truthful.

import Link from "next/link";
import { ToolGlyph } from "@/components/pdf/ToolGlyph";
import { getPublicPdfCatalog } from "@/lib/public-catalog/data";
import { resolveLumeoTools } from "@/lib/tools/resolve";
import { buildDiscoveryTiles, type Tile } from "@/lib/tools/tiles";
import { ScrollReveal } from "@/components/ui/ScrollReveal";

const PRIMARY_TOOL_SLUGS = [
  "edit",
  "merge",
  "compress",
  "sign",
  "pdf-to-word",
  "word-to-pdf",
] as const;

const SECONDARY_TOOL_SLUGS = [
  "reorder",
  "split",
  "jpg-to-pdf",
  "pdf-to-jpg",
  "watermark",
  "crop",
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

function CompactToolCard({
  tile,
  index,
}: {
  tile: Tile;
  index: number;
}) {
  const available =
    tile.availability === "active" || tile.availability === "beta";
  const status = statusLabel(tile);
  const emphasis = status ?? (tile.slug === "edit" ? "Advanced" : null);

  const contents = (
    <>
      <span
        aria-hidden="true"
        className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] border border-[var(--border-hairline)] bg-[var(--surface-base)] text-[var(--atelier-sage-300)] shadow-[inset_0_1px_0_rgba(var(--paper-rgb),0.05)] transition duration-200 group-hover:-translate-y-0.5 group-hover:scale-[1.03] motion-reduce:transform-none"
      >
        <ToolGlyph name={tile.glyph} className="h-[19px] w-[19px]" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-bold leading-tight text-[var(--text-primary)] sm:text-sm">
          {tile.label}
        </span>
        {emphasis ? (
          <span className="mt-1 block text-[10px] font-bold uppercase tracking-[0.07em] text-[var(--text-premium)]">
            {emphasis}
          </span>
        ) : null}
      </span>

      <span
        aria-hidden="true"
        className="shrink-0 text-sm text-[var(--text-muted)] transition duration-200 group-hover:translate-x-0.5 group-hover:text-[var(--atelier-sage-300)] motion-reduce:transform-none"
      >
        →
      </span>
    </>
  );

  const classes =
    "group flex min-h-[4.75rem] w-full items-center gap-3 rounded-[15px] border border-[var(--border-hairline)] bg-[var(--surface-raised)] px-3.5 py-3 text-left shadow-[var(--shadow-sm)] transition duration-200 ease-out hover:-translate-y-0.5 hover:border-[var(--border-subtle)] hover:bg-[var(--surface-elevated)] hover:shadow-[var(--shadow-md)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--champagne-rgb),0.2)] motion-reduce:transform-none";

  return (
    <li className="min-w-0">
      <ScrollReveal index={index} className="h-full">
        {available ? (
          <Link
            href={tile.route}
            className={classes}
            aria-label={
              "Open " + tile.label + (status ? ", " + status : "")
            }
          >
            {contents}
          </Link>
        ) : (
          <article
            className={
              classes +
              " cursor-default opacity-70 hover:translate-y-0 hover:shadow-[var(--shadow-sm)]"
            }
            aria-label={tile.label + ", " + (status ?? "Unavailable")}
          >
            {contents}
          </article>
        )}
      </ScrollReveal>
    </li>
  );
}

function AllToolsTile({ label }: { label: string }) {
  return (
    <li className="min-w-0">
      <Link
        href="/pdf-tools"
        className="group flex min-h-[4.75rem] w-full items-center gap-3 rounded-[15px] border border-dashed border-[var(--border-subtle)] bg-[rgba(var(--paper-rgb),0.018)] px-3.5 py-3 text-left transition duration-200 ease-out hover:-translate-y-0.5 hover:border-[var(--atelier-sage-300)] hover:bg-[var(--surface-raised)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--champagne-rgb),0.2)] motion-reduce:transform-none"
        aria-label={label}
      >
        <span
          aria-hidden="true"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] border border-[var(--border-hairline)] bg-[var(--surface-base)] text-[var(--atelier-sage-300)]"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            className="h-[19px] w-[19px]"
          >
            <rect x="4" y="4" width="6" height="6" rx="1.2" />
            <rect x="14" y="4" width="6" height="6" rx="1.2" />
            <rect x="4" y="14" width="6" height="6" rx="1.2" />
            <rect x="14" y="14" width="6" height="6" rx="1.2" />
          </svg>
        </span>
        <span className="min-w-0 flex-1 text-[13px] font-bold leading-tight text-[var(--atelier-sage-300)] sm:text-sm">
          {label}
        </span>
        <span
          aria-hidden="true"
          className="shrink-0 text-sm text-[var(--atelier-sage-300)] transition duration-200 group-hover:translate-x-0.5 motion-reduce:transform-none"
        >
          →
        </span>
      </Link>
    </li>
  );
}

function selectTiles(tiles: Tile[], slugs: readonly string[]) {
  const bySlug = new Map(tiles.map((tile) => [tile.slug, tile]));
  return slugs
    .map((slug) => bySlug.get(slug))
    .filter((tile): tile is Tile => Boolean(tile));
}

export async function PdfToolLauncher({
  allToolsLabel = "View all tools",
}: {
  allToolsLabel?: string;
}) {
  const catalog = await getPublicPdfCatalog();
  const resolved = resolveLumeoTools(catalog.tools);
  const tiles = buildDiscoveryTiles(resolved);
  const primary = selectTiles(tiles, PRIMARY_TOOL_SLUGS);
  const secondary = selectTiles(tiles, SECONDARY_TOOL_SLUGS);
  const curated = [...primary, ...secondary];

  // Admin-controlled coming-soon publishing remains truthful: every enabled
  // coming-soon tool can still surface even when it is outside the 12 compact
  // homepage launch tiles. CompactToolCard keeps those entries non-actionable.
  const additionalComingSoon = tiles.filter(
    (tile) =>
      tile.availability === "coming_soon" &&
      !CURATED_TOOL_SLUGS.has(tile.slug),
  );

  return (
    <div>
      <section aria-labelledby="popular-tools-heading">
        <div className="mb-4 flex flex-col gap-2 sm:mb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="aura-text-label text-[var(--atelier-sage-300)]">
              PDF tools
            </p>
            <h2
              id="popular-tools-heading"
              className="mt-1.5 font-serif text-[1.5rem] font-semibold tracking-[-0.015em] text-[var(--text-primary)] sm:text-[1.65rem]"
            >
              Choose what you want to do.
            </h2>
          </div>
          <p className="max-w-[32rem] text-xs leading-5 text-[var(--text-muted)] sm:text-right">
            Open a focused workspace now, or browse the complete directory.
          </p>
        </div>

        <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {curated.map((tile, index) => (
            <CompactToolCard key={tile.route} tile={tile} index={index} />
          ))}
          <AllToolsTile label={allToolsLabel} />
        </ul>
      </section>

      {additionalComingSoon.length > 0 ? (
        <section
          aria-labelledby="coming-soon-tools-heading"
          className="mt-7 border-t border-[var(--border-hairline)] pt-6"
        >
          <div className="mb-3">
            <p className="aura-text-label text-[var(--text-muted)]">Coming soon</p>
            <h2
              id="coming-soon-tools-heading"
              className="mt-1.5 font-serif text-lg font-semibold text-[var(--text-primary)]"
            >
              Published previews
            </h2>
          </div>
          <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {additionalComingSoon.map((tile, index) => (
              <CompactToolCard
                key={tile.route}
                tile={tile}
                index={curated.length + index}
              />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
