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

function HomeIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[1.05rem] w-[1.05rem]" fill="none">
      <path d="m5 11 7-6 7 6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" />
      <path d="M7.5 10.5v7.2h9v-7.2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" />
    </svg>
  );
}

function ContactIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[1.05rem] w-[1.05rem]" fill="none">
      <path d="M4 6.5a1.5 1.5 0 0 1 1.5-1.5h13a1.5 1.5 0 0 1 1.5 1.5v11a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" />
      <path d="m4.8 6.2 7.2 6 7.2-6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" />
    </svg>
  );
}

export async function PublicNav({
  maxWidth = "max-w-[1160px]",
}: {
  maxWidth?: string;
}) {
  const catalog = await getPublicPdfCatalog();
  const tools = resolveLumeoTools(catalog.tools);
  const tiles = buildTiles(tools);
  const hasMoreComingSoon = tools.some((tool) => tool.availability === "soon");

  return (
    <L2PublicHeader className="lumeo-nav-enter aura-public-nav">
      <nav className={`mx-auto flex min-h-16 ${maxWidth} items-center justify-between gap-2 sm:gap-4`} aria-label="Public navigation">
        <Link href="/" className="flex min-w-0 items-center rounded-[var(--radius-lg)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--champagne-rgb),0.2)]">
          <BrandLockup markSize="h-9 w-9 sm:h-10 sm:w-10" />
        </Link>

        <div className="flex shrink-0 items-center gap-2">
          <CommandPaletteTrigger tiles={tiles} />
          <PublicPdfToolsMenuClient tiles={tiles} hasMoreComingSoon={hasMoreComingSoon} compact />
          <span className="hidden sm:inline-flex">
            <PublicNavLink href="/guides">Guides</PublicNavLink>
          </span>
          <span className="hidden sm:inline-flex">
            <PublicNavLink href="/privacy">Privacy</PublicNavLink>
          </span>
          <Link
            href="/contact"
            aria-label="Contact Lumeo"
            title="Contact"
            className="lumeo-press lumeo-focus-ring inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[rgba(var(--champagne-rgb),0.12)] text-[var(--text-accent)] shadow-[inset_0_1px_0_rgba(255,253,248,0.08)] transition hover:bg-[rgba(var(--champagne-rgb),0.2)] hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--champagne-rgb),0.18)]"
          >
            <ContactIcon />
          </Link>
          <Link
            href="/"
            aria-label="Go to Lumeo PDF home"
            title="Home"
            className="lumeo-press lumeo-focus-ring inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[rgba(var(--paper-rgb),0.075)] text-[var(--text-muted)] shadow-[inset_0_1px_0_rgba(255,253,248,0.08)] transition hover:bg-[rgba(var(--champagne-rgb),0.12)] hover:text-[var(--text-accent)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--champagne-rgb),0.18)]"
          >
            <HomeIcon />
          </Link>
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
    <main id="main-content" className={`lumeo-page-enter aura-page-shell relative overflow-x-hidden ${mainClassName}`}>
      {/* Aura OS v2 (fix): the ambient sage/brass glow blobs previously here sat
       * edge-adjacent (near-zero gap) to the tool workspace's settings panel and
       * header title, both docked at the top corners. Their large blur radius
       * (150-155px) visibly bled color across that chrome even though the
       * panels are fully opaque and stacked above (z-10 vs the blob's z-index
       * auto), reported as a translucent/glossy patch on Compress PDF's settings
       * panel and Merge PDF's header. Removed rather than repositioned: this
       * shell wraps every PDF tool page, so there's no gap large enough to keep
       * decorative glow clear of docked chrome at every viewport width. */}
      <div className="relative z-10">
        <PublicNav maxWidth={maxWidth} />
        <div className={`mx-auto ${maxWidth} ${contentClassName}`}>{children}</div>
      </div>
    </main>
  );
}

