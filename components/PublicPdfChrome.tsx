// components/PublicPdfChrome.tsx

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { L2PublicHeader, L2PublicNavLink } from "@/components/ui/Aura";
import { L2MobileNavClient } from "@/components/public/L2MobileNavClient";

export function LumeoSealMark() {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#CBA052]/22 bg-[#F0EAD6] p-0.5 shadow-[0_8px_24px_rgba(0,0,0,0.18)]">
      <Image
        src="/brand/lumeo-pdf-mark.png"
        alt=""
        width={36}
        height={36}
        className="h-full w-full object-contain"
        priority
      />
    </span>
  );
}

export function BrandLockup({
  tone = "light",
  markSize = "h-9 w-9",
}: {
  tone?: "light" | "dark";
  markSize?: string;
}) {
  const primaryText = tone === "dark" ? "text-[#151A22]" : "text-[var(--text-primary)]";
  const secondaryText =
    tone === "dark" ? "text-[var(--atelier-sage-600)]" : "text-[var(--text-accent)]";

  return (
    <span className="flex min-w-0 items-center gap-3">
      <span
        className={`flex shrink-0 items-center justify-center rounded-lg border border-[#CBA052]/22 bg-[#F0EAD6] p-0.5 shadow-[0_8px_24px_rgba(0,0,0,0.18)] ${markSize}`}
      >
        <Image
          src="/brand/lumeo-pdf-mark.png"
          alt=""
          width={40}
          height={40}
          className="h-full w-full object-contain"
          priority
        />
      </span>

      <span className="min-w-0 leading-none">
        <span
          className={`block text-[1.25rem] font-bold leading-none tracking-[-0.025em] ${primaryText}`}
        >
          Lumeo
        </span>
        <span
          className={`mt-1 block text-[0.54rem] font-bold uppercase tracking-[0.19em] ${secondaryText}`}
        >
          PDF Workspace
        </span>
      </span>
    </span>
  );
}

function HomeIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[1.05rem] w-[1.05rem]" fill="none">
      <path d="m5 11 7-6 7 6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" />
      <path d="M7.5 10.5v7.2h9v-7.2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" />
    </svg>
  );
}

export function PublicNav({
  maxWidth = "max-w-[1160px]",
  toolsMenu,
}: {
  maxWidth?: string;
  toolsMenu?: ReactNode;
}) {
  return (
    <L2PublicHeader className="lumeo-nav-enter aura-public-nav">
      <nav className={`mx-auto flex min-h-16 ${maxWidth} items-center justify-between gap-4`} aria-label="Public navigation">
        <Link href="/" className="flex min-w-0 items-center rounded-[var(--radius-lg)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--champagne-rgb),0.2)]">
          <BrandLockup markSize="h-9 w-9 sm:h-10 sm:w-10" />
        </Link>

        <div className="hidden shrink-0 items-center gap-2 md:flex">
          {toolsMenu ?? (
            <L2PublicNavLink href="/pdf-tools">
              PDF Tools
            </L2PublicNavLink>
          )}
          <L2PublicNavLink href="/guides">Guides</L2PublicNavLink>
          <L2PublicNavLink href="/privacy">Privacy</L2PublicNavLink>
          <Link
            href="/"
            aria-label="Go to Lumeo PDF home"
            title="Home"
            className="lumeo-press lumeo-focus-ring inline-flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] bg-[rgba(var(--paper-rgb),0.075)] text-[var(--text-muted)] shadow-[inset_0_1px_0_rgba(255,253,248,0.08)] transition hover:bg-[rgba(var(--champagne-rgb),0.12)] hover:text-[var(--text-accent)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--champagne-rgb),0.18)]"
          >
            <HomeIcon />
          </Link>
        </div>
        <L2MobileNavClient />
      </nav>
    </L2PublicHeader>
  );
}

export function PublicPageShell({
  children,
  maxWidth = "max-w-[1160px]",
  contentClassName = "px-5 py-8 sm:px-8 lg:py-10",
  mainClassName = "min-h-screen bg-[#0C1220] text-[#F0EAD6]",
  toolsMenu,
}: {
  children: ReactNode;
  maxWidth?: string;
  contentClassName?: string;
  mainClassName?: string;
  toolsMenu?: ReactNode;
}) {
  return (
    <main id="main-content" className={`lumeo-page-enter aura-page-shell relative overflow-x-hidden ${mainClassName}`}>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="lumeo-ambient absolute -left-44 -top-48 h-[32rem] w-[32rem] rounded-full bg-[rgba(var(--atelier-sage-rgb),0.07)] blur-[150px]" />
        <div className="lumeo-ambient absolute -right-44 top-0 [animation-delay:-4s] h-[30rem] w-[30rem] rounded-full bg-[rgba(var(--atelier-brass-rgb),0.055)] blur-[155px]" />
      </div>

      <div className="relative z-10">
        <PublicNav maxWidth={maxWidth} toolsMenu={toolsMenu} />
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
