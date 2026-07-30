"use client";

import Link from "next/link";
import { ToolGlyph } from "@/components/pdf/ToolGlyph";
import { formatBytes } from "@/lib/pdf/formatBytes";
import { useRecentFiles } from "@/lib/recent-files/useRecentFiles";
import type { RecentFileItem } from "@/lib/recent-files";
import type { Tile } from "@/lib/tools/tiles";

// The four fastest re-entry points, always available even for a first-time
// visitor with no recent history -- kept deliberately short (not the full
// 14-tile catalog already shown above this section) so "Quick actions"
// stays a small strip, not a second copy of the homepage grid.
const QUICK_ACTION_SLUGS = ["merge", "split", "compress", "sign"];

function RecentFileLink({ item, tile }: { item: RecentFileItem; tile: Tile }) {
  const metaParts = [
    tile.label,
    item.pageCount ? `${item.pageCount} page${item.pageCount === 1 ? "" : "s"}` : null,
    item.fileSize ? formatBytes(item.fileSize) : null,
  ].filter(Boolean);

  return (
    <Link
      href={tile.route}
      className="aura-glass-thin flex items-center gap-3 rounded-[var(--radius-lg)] px-3.5 py-3 transition duration-[var(--v2-motion-fast)] hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--champagne-rgb),0.18)]"
    >
      <span
        aria-hidden="true"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius-md)] bg-[rgba(var(--champagne-rgb),0.1)] text-[var(--text-premium)]"
      >
        <ToolGlyph name={tile.glyph} className="h-[18px] w-[18px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-[var(--text-primary)]">{item.filename}</span>
        <span className="mt-0.5 block truncate text-xs text-[var(--text-muted)]">{metaParts.join(" · ")}</span>
      </span>
    </Link>
  );
}

export function ContinueWorking({ tiles }: { tiles: Tile[] }) {
  const recentFiles = useRecentFiles();

  const tileBySlug = new Map(tiles.map((tile) => [tile.slug, tile]));
  const visibleRecent = recentFiles
    .map((item) => ({ item, tile: tileBySlug.get(item.tool) }))
    .filter((entry): entry is { item: RecentFileItem; tile: Tile } => Boolean(entry.tile))
    .slice(0, 6);

  const quickActionTiles = QUICK_ACTION_SLUGS.map((slug) => tileBySlug.get(slug)).filter(
    (tile): tile is Tile => Boolean(tile),
  );

  // Nothing to reasonably show (catalog data unexpectedly missing the four
  // quick-action tools) -- fail quiet rather than render an empty shell.
  if (quickActionTiles.length === 0) return null;

  return (
    <section aria-label="Continue working" className="mt-9 sm:mt-12">
      {visibleRecent.length > 0 ? (
        <div className="mb-5">
          <p className="aura-text-label text-[var(--atelier-sage-300)]">Recent files</p>
          <ul className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {visibleRecent.map(({ item, tile }) => (
              <li key={item.id}>
                <RecentFileLink item={item} tile={tile} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div>
        <p className="aura-text-label text-[var(--atelier-sage-300)]">Quick actions</p>
        <ul className="mt-3 flex flex-wrap gap-2.5">
          {quickActionTiles.map((tile) => (
            <li key={tile.route}>
              <Link
                href={tile.route}
                className="aura-glass-thin inline-flex items-center gap-2 rounded-[var(--radius-pill)] px-4 py-2 text-sm font-bold text-[var(--text-primary)] transition duration-[var(--v2-motion-fast)] hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--champagne-rgb),0.18)]"
              >
                <ToolGlyph name={tile.glyph} className="h-4 w-4" />
                {tile.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
