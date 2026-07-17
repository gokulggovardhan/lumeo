// components/PublicPdfChrome.tsx

import Link from "next/link";
import type { ReactNode } from "react";
import { L2PublicHeader, L2PublicNavLink } from "@/components/ui/Aura";
import { PublicPdfToolsMenuClient } from "@/components/public/PublicPdfToolsMenuClient";
import { getPublicPdfCatalog } from "@/lib/public-catalog/data";
import { BrandLockup } from "@/components/BrandMark";

function HomeIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[1.05rem] w-[1.05rem]" fill="none">
      <path d="m5 11 7-6 7 6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" />
      <path d="M7.5 10.5v7.2h9v-7.2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" />
    </svg>
  );
}

export async function PublicNav({
  maxWidth = "max-w-[1160px]",
}: {
  maxWidth?: string;
}) {
  const catalog = await getPublicPdfCatalog();

  return (
    <L2PublicHeader className="lumeo-nav-enter aura-public-nav">
      <nav className={`mx-auto flex min-h-16 ${maxWidth} items-center justify-between gap-2 sm:gap-4`} aria-label="Public navigation">
        <Link href="/" className="flex min-w-0 items-center rounded-[var(--radius-lg)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--champagne-rgb),0.2)]">
          <BrandLockup markSize="h-9 w-9 sm:h-10 sm:w-10" />
        </Link>

        <div className="flex shrink-0 items-center gap-2">
          <PublicPdfToolsMenuClient categories={catalog.categories} compact />
          <span className="hidden sm:inline-flex">
            <L2PublicNavLink href="/guides">Guides</L2PublicNavLink>
          </span>
          <span className="hidden sm:inline-flex">
            <L2PublicNavLink href="/privacy">Privacy</L2PublicNavLink>
          </span>
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
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="lumeo-ambient absolute -left-44 -top-48 h-[32rem] w-[32rem] rounded-full bg-[rgba(var(--atelier-sage-rgb),0.07)] blur-[60px] md:blur-[150px]" />
        <div className="lumeo-ambient absolute -right-44 top-0 [animation-delay:-4s] h-[30rem] w-[30rem] rounded-full bg-[rgba(var(--atelier-brass-rgb),0.055)] blur-[60px] md:blur-[155px]" />
      </div>

      <div className="relative z-10">
        <PublicNav maxWidth={maxWidth} />
        <div className={`mx-auto ${maxWidth} ${contentClassName}`}>{children}</div>
      </div>
    </main>
  );
}

export function ToolPlaceholder({
  title,
  description,
  accepted,
}: {
  title: string;
  description: string;
  accepted: string;
}) {
  return (
    <PublicPageShell
      mainClassName="min-h-dvh bg-[var(--surface-canvas)] text-[var(--text-primary)]"
      contentClassName="px-5 py-14 sm:px-8 sm:py-20"
      maxWidth="max-w-[820px]"
    >
      <section className="mx-auto text-center">
        <p className="aura-text-label text-[var(--text-accent)]">
          Coming next
        </p>
        <h1 className="mt-4 font-serif text-4xl tracking-[-0.04em] text-[var(--text-primary)] sm:text-6xl">
          {title}
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-[var(--text-secondary)] sm:text-lg sm:leading-8">
          {description}
        </p>

        <div className="aura-luminous-card mx-auto mt-10 max-w-2xl rounded-[24px] px-6 py-8 sm:px-8">
          <p className="relative text-xl font-bold text-[var(--text-primary)]">This workspace is being prepared.</p>
          <p className="relative mt-3 text-sm leading-6 text-[var(--text-secondary)]">Accepted format: {accepted}</p>
          <p className="relative mt-5 text-xs font-semibold text-[var(--text-success)]">Private by design · Browser-first where possible</p>
        </div>
      </section>
    </PublicPageShell>
  );
}
