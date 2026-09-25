// components/PublicPdfChrome.tsx

import Link from "next/link";
import type { ReactNode } from "react";
import { L2PublicHeader } from "@/components/ui/Aura";
import { CommandPaletteTrigger } from "@/components/CommandPaletteTrigger";
import { PublicPdfToolsMenuClient } from "@/components/public/PublicPdfToolsMenuClient";
import { PublicNavLink } from "@/components/public/PublicNavLink";
import { getPublicPdfCatalog } from "@/lib/public-catalog/data";
import { resolveLumeoTools } from "@/lib/tools/resolve";
import { buildTiles } from "@/lib/tools/tiles";
import { BrandLockup } from "@/components/BrandMark";

const NAV_TOOL_SLUGS = new Set([
  "merge",
  "compress",
  "edit",
  "pdf-to-word",
  "word-to-pdf",
  "sign",
  "split",
  "reorder",
  "jpg-to-pdf",
  "pdf-to-jpg",
]);

export async function PublicNav({
  maxWidth = "max-w-[1160px]",
}: {
  maxWidth?: string;
}) {
  const catalog = await getPublicPdfCatalog();
  const tools = resolveLumeoTools(catalog.tools);
  const tiles = buildTiles(tools);
  const menuTiles = tiles.filter((tile) => NAV_TOOL_SLUGS.has(tile.slug));
  const hasMoreComingSoon = tools.some((tool) => tool.availability === "soon");

  return (
    <L2PublicHeader className="lumeo-nav-enter aura-public-nav">
      <nav
        className={`mx-auto flex min-h-16 ${maxWidth} items-center justify-between gap-2 sm:gap-4`}
        aria-label="Public navigation"
      >
        <Link
          href="/"
          className="flex min-w-0 items-center rounded-[var(--radius-lg)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--champagne-rgb),0.2)]"
        >
          <BrandLockup markSize="h-9 w-9 sm:h-10 sm:w-10" />
        </Link>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <CommandPaletteTrigger tiles={tiles} />
          <PublicPdfToolsMenuClient
            tiles={menuTiles}
            hasMoreComingSoon={hasMoreComingSoon}
            compact
          />
          <span className="hidden md:inline-flex">
            <PublicNavLink href="/guides">Guides</PublicNavLink>
          </span>
          <span className="hidden md:inline-flex">
            <PublicNavLink href="/about">About</PublicNavLink>
          </span>
        </div>
      </nav>
    </L2PublicHeader>
  );
}

export function PublicPageShell({
  children,
  maxWidth = "max-w-[1160px]",
  contentClassName = "px-5 py-8 sm:px-8 lg:py-10",
  mainClassName = "min-h-screen bg-[#0C1220] text-[#F0EAD6]",
}: {
  children: ReactNode;
  maxWidth?: string;
  contentClassName?: string;
  mainClassName?: string;
}) {
  return (
    <main
      id="main-content"
      className={`lumeo-page-enter aura-page-shell relative overflow-x-hidden ${mainClassName}`}
    >
      <div className="relative z-10">
        <PublicNav maxWidth={maxWidth} />
        <div className={`mx-auto ${maxWidth} ${contentClassName}`}>{children}</div>
      </div>
    </main>
  );
}
