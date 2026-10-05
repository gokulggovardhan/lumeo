"use client";

import Link from "next/link";
import { ToolGlyph } from "@/components/pdf/ToolGlyph";
import { formatBytes } from "@/lib/pdf/formatBytes";
import { useRecentFiles } from "@/lib/recent-files/useRecentFiles";
import type { RecentFileItem } from "@/lib/recent-files";
import type { Tile } from "@/lib/tools/tiles";

function RecentFileLink({ item, tile }: { item: RecentFileItem; tile: Tile }) {
  const metaParts = [
    tile.label,
    item.pageCount
      ? item.pageCount + " page" + (item.pageCount === 1 ? "" : "s")
      : null,
    item.fileSize ? formatBytes(item.fileSize) : null,
  ].filter(Boolean);

  return (
    <Link
      href={tile.route}
      prefetch={false}
      className="aura-glass-thin flex items-center gap-3 rounded-[var(--radius-lg)] px-3.5 py-3 transition duration-[var(--v2-motion-fast)] hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--champagne-rgb),0.18)] motion-reduce:transform-none"
    >
      <span
        aria-hidden="true"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius-md)] bg-[rgba(var(--champagne-rgb),0.1)] text-[var(--text-premium)]"
      >
        <ToolGlyph name={tile.glyph} className="h-[18px] w-[18px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-[var(--text-primary)]">
          {item.filename}
        </span>
        <span className="mt-0.5 block truncate text-xs text-[var(--text-muted)]">
          {metaParts.join(" · ")}
        </span>
      </span>
    </Link>
  );
}

export function ContinueWorking({ tiles }: { tiles: Tile[] }) {
  const recentFiles = useRecentFiles();
  const tileBySlug = new Map(tiles.map((tile) => [tile.slug, tile]));
  const visibleRecent = recentFiles
    .map((item) => ({ item, tile: tileBySlug.get(item.tool) }))
    .filter(
      (entry): entry is { item: RecentFileItem; tile: Tile } =>
        Boolean(entry.tile),
    )
    .slice(0, 6);

  // The compact homepage launcher already provides the repeatable actions.
  // Only render this section when there is genuine local history to resume,
  // avoiding a second duplicate tool launcher below the primary grid.
  if (visibleRecent.length === 0) return null;

  return (
    <section
      aria-labelledby="continue-working-heading"
      className="mt-9 border-t border-[var(--border-hairline)] pt-7 sm:mt-10"
    >
      <div className="mb-3 flex items-end justify-between gap-4">
        <div>
          <p className="aura-text-label text-[var(--atelier-sage-300)]">
            Recent files
          </p>
          <h2
            id="continue-working-heading"
            className="mt-1.5 font-serif text-xl font-semibold text-[var(--text-primary)]"
          >
            Continue where you left off
          </h2>
        </div>
        <p className="hidden text-xs text-[var(--text-muted)] sm:block">
          Stored only in this browser.
        </p>
      </div>

      <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {visibleRecent.map(({ item, tile }) => (
          <li key={item.id}>
            <RecentFileLink item={item} tile={tile} />
          </li>
        ))}
      </ul>
    </section>
  );
}
